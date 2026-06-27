extern crate std;

use super::*;
use ed25519_dalek::{Signer as _, SigningKey as Ed25519SigningKey};
use p256::ecdsa::{
    signature::hazmat::PrehashSigner, Signature as P256Signature, SigningKey as P256SigningKey,
};
use sha2::{Digest, Sha256};
use soroban_sdk::{
    auth::{Context, ContractContext},
    testutils::{Address as _, Ledger},
    vec, IntoVal,
};
use std::{format, string::String as StdString};

struct Fixture {
    env: Env,
    client: SpendAccountV1Client<'static>,
    account: Address,
    owner_key: P256SigningKey,
    credential_hash: BytesN<32>,
    session_key: Ed25519SigningKey,
    merchant: Address,
    asset: Address,
}

fn fixture() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| ledger.timestamp = 1_000);

    let owner_key = P256SigningKey::from_bytes((&[3u8; 32]).into()).unwrap();
    let encoded = owner_key.verifying_key().to_encoded_point(false);
    let owner_public_key: BytesN<65> = BytesN::from_array(&env, encoded.as_bytes().try_into().unwrap());
    let credential_hash: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(&env, b"demo-credential")).into();
    let rp_id_hash: BytesN<32> = env
        .crypto()
        .sha256(&Bytes::from_slice(&env, b"agente-pagos-stellar.vercel.app")).into();
    let origin_hash: BytesN<32> = env.crypto().sha256(&Bytes::from_slice(
        &env,
        b"https://agente-pagos-stellar.vercel.app",
    )).into();
    let account = env.register(
        SpendAccountV1,
        (
            owner_public_key,
            credential_hash.clone(),
            rp_id_hash,
            origin_hash,
        ),
    );
    let client = SpendAccountV1Client::new(&env, &account);
    let merchant = Address::generate(&env);
    let asset = Address::generate(&env);
    let session_key = Ed25519SigningKey::from_bytes(&[7u8; 32]);
    let signer = BytesN::from_array(&env, session_key.verifying_key().as_bytes());
    client
        .grant(
            &signer,
            &vec![&env, merchant.clone()],
            &vec![&env, asset.clone()],
            &100_000,
            &200_000,
            &87_400,
        );

    Fixture {
        env,
        client,
        account,
        owner_key,
        credential_hash: credential_hash.into(),
        session_key,
        merchant,
        asset,
    }
}

fn transfer_args(f: &Fixture, destination: &Address, amount: i128) -> Vec<Val> {
    vec![
        &f.env,
        f.account.clone().into_val(&f.env),
        MuxedAddress::from(destination.clone()).into_val(&f.env),
        amount.into_val(&f.env),
    ]
}

fn transfer_context(f: &Fixture, destination: &Address, amount: i128) -> Vec<Context> {
    vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.asset.clone(),
            fn_name: symbol_short!("transfer"),
            args: transfer_args(f, destination, amount),
        }),
    ]
}

fn session_signature(f: &Fixture, payload: &[u8; 32]) -> AccountSignature {
    AccountSignature::Session(SessionSignature {
        public_key: BytesN::from_array(&f.env, f.session_key.verifying_key().as_bytes()),
        signature: BytesN::from_array(&f.env, &f.session_key.sign(payload).to_bytes()),
    })
}

fn passkey_signature(
    f: &Fixture,
    payload: &[u8; 32],
    origin: &str,
    credential_hash: BytesN<32>,
) -> AccountSignature {
    let client_json = format!(
        "{{\"type\":\"webauthn.get\",\"challenge\":\"{}\",\"origin\":\"{}\"}}",
        base64(payload),
        origin
    );
    let rp_hash = Sha256::digest(b"agente-pagos-stellar.vercel.app");
    let mut auth_data: std::vec::Vec<u8> = rp_hash.iter().copied().collect();
    auth_data.extend_from_slice(&[1, 0, 0, 0, 0]);
    let mut signed = auth_data.clone();
    signed.extend_from_slice(&Sha256::digest(client_json.as_bytes()));
    let digest = Sha256::digest(&signed);
    let signature: P256Signature = f.owner_key.sign_prehash(&digest).unwrap();
    let signature = signature.normalize_s().unwrap_or(signature);
    AccountSignature::Passkey(PasskeySignature {
        credential_id_hash: credential_hash,
        authenticator_data: Bytes::from_slice(&f.env, &auth_data),
        client_data_json: Bytes::from_slice(&f.env, client_json.as_bytes()),
        signature: BytesN::from_array(&f.env, &signature.to_bytes().into()),
    })
}

fn invoke_auth(
    f: &Fixture,
    payload: &[u8; 32],
    signature: AccountSignature,
    contexts: &Vec<Context>,
) -> Result<(), Result<AccountError, soroban_sdk::InvokeError>> {
    f.env.try_invoke_contract_check_auth::<AccountError>(
        &f.account,
        &BytesN::from_array(&f.env, payload),
        signature.into_val(&f.env),
        contexts,
    )
}

#[test]
fn valid_passkey_authorizes_owner_admin_context() {
    let f = fixture();
    let payload = [9u8; 32];
    let contexts = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.account.clone(),
            fn_name: symbol_short!("grant"),
            args: vec![&f.env],
        }),
    ];
    let signature = passkey_signature(
        &f,
        &payload,
        "https://agente-pagos-stellar.vercel.app",
        f.credential_hash.clone(),
    );
    assert_eq!(invoke_auth(&f, &payload, signature, &contexts), Ok(()));
}

#[test]
fn passkey_rejects_wrong_origin_and_credential() {
    let f = fixture();
    let payload = [10u8; 32];
    let contexts = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.account.clone(),
            fn_name: symbol_short!("revoke"),
            args: vec![&f.env],
        }),
    ];
    let wrong_origin = passkey_signature(
        &f,
        &payload,
        "https://evil.example",
        f.credential_hash.clone(),
    );
    assert_eq!(
        invoke_auth(&f, &payload, wrong_origin, &contexts),
        Err(Ok(AccountError::InvalidOrigin))
    );
    let wrong_credential = passkey_signature(
        &f,
        &payload,
        "https://agente-pagos-stellar.vercel.app",
        BytesN::from_array(&f.env, &[4u8; 32]),
    );
    assert_eq!(
        invoke_auth(&f, &payload, wrong_credential, &contexts),
        Err(Ok(AccountError::InvalidCredential))
    );
}

#[test]
fn session_authorizes_allowlisted_transfer_and_tracks_budget() {
    let f = fixture();
    let payload = [11u8; 32];
    let contexts = transfer_context(&f, &f.merchant, 100_000);
    assert_eq!(
        invoke_auth(&f, &payload, session_signature(&f, &payload), &contexts),
        Ok(())
    );
    assert_eq!(f.client.session().unwrap().spent, 100_000);
}

#[test]
fn session_blocks_destination_asset_and_amount() {
    let f = fixture();
    let payload = [12u8; 32];
    let other = Address::generate(&f.env);
    let wrong_destination = transfer_context(&f, &other, 1);
    assert_eq!(
        invoke_auth(
            &f,
            &payload,
            session_signature(&f, &payload),
            &wrong_destination
        ),
        Err(Ok(AccountError::DestinationOutsideAllowlist))
    );
    let over_limit = transfer_context(&f, &f.merchant, 100_001);
    assert_eq!(
        invoke_auth(
            &f,
            &payload,
            session_signature(&f, &payload),
            &over_limit
        ),
        Err(Ok(AccountError::AmountOverLimit))
    );
    let wrong_asset = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: other,
            fn_name: symbol_short!("transfer"),
            args: transfer_args(&f, &f.merchant, 1),
        }),
    ];
    assert_eq!(
        invoke_auth(
            &f,
            &payload,
            session_signature(&f, &payload),
            &wrong_asset
        ),
        Err(Ok(AccountError::AssetOutsideAllowlist))
    );
}

#[test]
fn cumulative_budget_and_unknown_context_are_blocked() {
    let f = fixture();
    for byte in [13u8, 14u8] {
        let payload = [byte; 32];
        let contexts = transfer_context(&f, &f.merchant, 100_000);
        assert_eq!(
            invoke_auth(&f, &payload, session_signature(&f, &payload), &contexts),
            Ok(())
        );
    }
    let payload = [15u8; 32];
    let contexts = transfer_context(&f, &f.merchant, 1);
    assert_eq!(
        invoke_auth(&f, &payload, session_signature(&f, &payload), &contexts),
        Err(Ok(AccountError::BudgetExceeded))
    );
    let unknown = vec![
        &f.env,
        Context::Contract(ContractContext {
            contract: f.asset.clone(),
            fn_name: symbol_short!("approve"),
            args: vec![&f.env],
        }),
    ];
    assert_eq!(
        invoke_auth(&f, &payload, session_signature(&f, &payload), &unknown),
        Err(Ok(AccountError::AssetOutsideAllowlist))
    );
}

#[test]
fn revoked_and_expired_sessions_are_blocked() {
    let revoked = fixture();
    revoked.client.revoke();
    let payload = [16u8; 32];
    let contexts = transfer_context(&revoked, &revoked.merchant, 1);
    assert_eq!(
        invoke_auth(
            &revoked,
            &payload,
            session_signature(&revoked, &payload),
            &contexts
        ),
        Err(Ok(AccountError::RevokedSession))
    );

    let expired = fixture();
    expired
        .env
        .ledger()
        .with_mut(|ledger| ledger.timestamp = 90_000);
    let contexts = transfer_context(&expired, &expired.merchant, 1);
    assert_eq!(
        invoke_auth(
            &expired,
            &payload,
            session_signature(&expired, &payload),
            &contexts
        ),
        Err(Ok(AccountError::ExpiredSession))
    );
}

fn base64(src: &[u8; 32]) -> StdString {
    let mut output = [0u8; 43];
    base64_url_encode(&mut output, src);
    StdString::from_utf8(output.to_vec()).unwrap()
}
