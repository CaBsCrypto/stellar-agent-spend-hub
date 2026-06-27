#![no_std]

use serde::Deserialize;
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contracterror, contractimpl, contracttype,
    crypto::Hash,
    symbol_short, Address, Bytes, BytesN, Env, MuxedAddress, Symbol, TryFromVal, Val, Vec,
};

const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND_TO: u32 = 3_110_400;
const TRANSFER_FN: Symbol = symbol_short!("transfer");
const GRANT_FN: Symbol = symbol_short!("grant");
const REVOKE_FN: Symbol = symbol_short!("revoke");

#[contract]
pub struct SpendAccountV1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AccountError {
    NotInitialized = 1,
    InvalidCredential = 2,
    InvalidWebAuthnData = 3,
    InvalidChallenge = 4,
    InvalidOrigin = 5,
    InvalidRpId = 6,
    MissingSession = 7,
    RevokedSession = 8,
    ExpiredSession = 9,
    InvalidContext = 10,
    InvalidTransfer = 11,
    DestinationOutsideAllowlist = 12,
    AssetOutsideAllowlist = 13,
    AmountOverLimit = 14,
    BudgetExceeded = 15,
    InvalidPolicy = 16,
    AllowlistTooLarge = 17,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnerConfig {
    pub public_key: BytesN<65>,
    pub credential_id_hash: BytesN<32>,
    pub rp_id_hash: BytesN<32>,
    pub origin_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionPolicy {
    pub signer: BytesN<32>,
    pub allowed_destinations: Vec<Address>,
    pub allowed_assets: Vec<Address>,
    pub per_payment_limit: i128,
    pub total_limit: i128,
    pub spent: i128,
    pub expires_at: u64,
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PasskeySignature {
    pub credential_id_hash: BytesN<32>,
    pub authenticator_data: Bytes,
    pub client_data_json: Bytes,
    pub signature: BytesN<64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionSignature {
    pub public_key: BytesN<32>,
    pub signature: BytesN<64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccountSignature {
    Passkey(PasskeySignature),
    Session(SessionSignature),
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
    Session,
}

#[derive(Deserialize)]
struct ClientDataJson<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    challenge: &'a str,
    origin: &'a str,
}

#[contractimpl]
impl SpendAccountV1 {
    pub fn __constructor(
        env: Env,
        owner_public_key: BytesN<65>,
        credential_id_hash: BytesN<32>,
        rp_id_hash: BytesN<32>,
        origin_hash: BytesN<32>,
    ) {
        env.storage().instance().set(
            &DataKey::Owner,
            &OwnerConfig {
                public_key: owner_public_key,
                credential_id_hash,
                rp_id_hash,
                origin_hash,
            },
        );
        bump_ttl(&env);
    }

    pub fn grant(
        env: Env,
        signer: BytesN<32>,
        allowed_destinations: Vec<Address>,
        allowed_assets: Vec<Address>,
        per_payment_limit: i128,
        total_limit: i128,
        expires_at: u64,
    ) -> Result<SessionPolicy, AccountError> {
        env.current_contract_address().require_auth();
        validate_policy(
            &env,
            &allowed_destinations,
            &allowed_assets,
            per_payment_limit,
            total_limit,
            expires_at,
        )?;
        let policy = SessionPolicy {
            signer,
            allowed_destinations,
            allowed_assets,
            per_payment_limit,
            total_limit,
            spent: 0,
            expires_at,
            revoked: false,
        };
        env.storage().instance().set(&DataKey::Session, &policy);
        bump_ttl(&env);
        Ok(policy)
    }

    pub fn revoke(env: Env) -> Result<SessionPolicy, AccountError> {
        env.current_contract_address().require_auth();
        let mut policy = read_session(&env)?;
        policy.revoked = true;
        env.storage().instance().set(&DataKey::Session, &policy);
        bump_ttl(&env);
        Ok(policy)
    }

    pub fn extend_ttl(env: Env) {
        env.current_contract_address().require_auth();
        bump_ttl(&env);
    }

    pub fn owner(env: Env) -> OwnerConfig {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .unwrap_or_else(|| panic_with(&env, AccountError::NotInitialized))
    }

    pub fn session(env: Env) -> Option<SessionPolicy> {
        env.storage().instance().get(&DataKey::Session)
    }
}

#[contractimpl]
impl CustomAccountInterface for SpendAccountV1 {
    type Error = AccountError;
    type Signature = AccountSignature;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: AccountSignature,
        auth_contexts: Vec<Context>,
    ) -> Result<(), AccountError> {
        match signature {
            AccountSignature::Passkey(passkey) => {
                verify_passkey(&env, &signature_payload, passkey)?;
                verify_owner_contexts(&env, &auth_contexts)?;
            }
            AccountSignature::Session(session) => {
                let mut policy = read_session(&env)?;
                verify_session_signature(&env, &signature_payload, &session, &policy)?;
                verify_session_policy(&env, &auth_contexts, &mut policy)?;
                env.storage().instance().set(&DataKey::Session, &policy);
            }
        }
        bump_ttl(&env);
        Ok(())
    }
}

fn verify_passkey(
    env: &Env,
    signature_payload: &Hash<32>,
    signature: PasskeySignature,
) -> Result<(), AccountError> {
    let owner: OwnerConfig = env
        .storage()
        .instance()
        .get(&DataKey::Owner)
        .ok_or(AccountError::NotInitialized)?;
    if signature.credential_id_hash != owner.credential_id_hash {
        return Err(AccountError::InvalidCredential);
    }
    if signature.authenticator_data.len() < 37 {
        return Err(AccountError::InvalidWebAuthnData);
    }
    let rp_hash = signature.authenticator_data.slice(0..32);
    if rp_hash != Bytes::from_array(env, &owner.rp_id_hash.to_array()) {
        return Err(AccountError::InvalidRpId);
    }

    let json_buffer = signature.client_data_json.to_buffer::<1024>();
    let (client_data, _): (ClientDataJson, _) =
        serde_json_core::de::from_slice(json_buffer.as_slice())
            .map_err(|_| AccountError::InvalidWebAuthnData)?;
    if client_data.kind != "webauthn.get" {
        return Err(AccountError::InvalidWebAuthnData);
    }
    let mut expected_challenge = [0u8; 43];
    base64_url_encode(&mut expected_challenge, &signature_payload.to_array());
    if client_data.challenge.as_bytes() != expected_challenge {
        return Err(AccountError::InvalidChallenge);
    }
    let origin_hash = env
        .crypto()
        .sha256(&Bytes::from_slice(env, client_data.origin.as_bytes()));
    if origin_hash.to_array() != owner.origin_hash.to_array() {
        return Err(AccountError::InvalidOrigin);
    }

    let mut signed_data = signature.authenticator_data;
    signed_data.extend_from_array(
        &env.crypto()
            .sha256(&signature.client_data_json)
            .to_array(),
    );
    env.crypto().secp256r1_verify(
        &owner.public_key,
        &env.crypto().sha256(&signed_data),
        &signature.signature,
    );
    Ok(())
}

fn verify_session_signature(
    env: &Env,
    signature_payload: &Hash<32>,
    signature: &SessionSignature,
    policy: &SessionPolicy,
) -> Result<(), AccountError> {
    if policy.revoked {
        return Err(AccountError::RevokedSession);
    }
    if env.ledger().timestamp() > policy.expires_at {
        return Err(AccountError::ExpiredSession);
    }
    if signature.public_key != policy.signer {
        return Err(AccountError::InvalidCredential);
    }
    env.crypto().ed25519_verify(
        &signature.public_key,
        &Bytes::from_array(env, &signature_payload.to_array()),
        &signature.signature,
    );
    Ok(())
}

fn verify_owner_contexts(env: &Env, contexts: &Vec<Context>) -> Result<(), AccountError> {
    if contexts.is_empty() {
        return Err(AccountError::InvalidContext);
    }
    for context in contexts.iter() {
        let contract = match context {
            Context::Contract(contract) => contract,
            _ => return Err(AccountError::InvalidContext),
        };
        if contract.contract == env.current_contract_address() {
            if contract.fn_name != GRANT_FN
                && contract.fn_name != REVOKE_FN
                && contract.fn_name != Symbol::new(env, "extend_ttl")
            {
                return Err(AccountError::InvalidContext);
            }
        } else if contract.fn_name == TRANSFER_FN {
            validate_transfer_args(env, &contract.args, None)?;
        } else {
            return Err(AccountError::InvalidContext);
        }
    }
    Ok(())
}

fn verify_session_policy(
    env: &Env,
    contexts: &Vec<Context>,
    policy: &mut SessionPolicy,
) -> Result<(), AccountError> {
    if contexts.is_empty() {
        return Err(AccountError::InvalidContext);
    }
    let mut total = 0_i128;
    for context in contexts.iter() {
        let contract = match context {
            Context::Contract(contract) => contract,
            _ => return Err(AccountError::InvalidContext),
        };
        if contract.fn_name != TRANSFER_FN || !address_allowed(&policy.allowed_assets, &contract.contract) {
            return Err(AccountError::AssetOutsideAllowlist);
        }
        let (destination, amount) = validate_transfer_args(env, &contract.args, Some(policy))?;
        if !address_allowed(&policy.allowed_destinations, &destination) {
            return Err(AccountError::DestinationOutsideAllowlist);
        }
        if amount > policy.per_payment_limit {
            return Err(AccountError::AmountOverLimit);
        }
        total = total.checked_add(amount).ok_or(AccountError::BudgetExceeded)?;
    }
    let spent = policy
        .spent
        .checked_add(total)
        .ok_or(AccountError::BudgetExceeded)?;
    if spent > policy.total_limit {
        return Err(AccountError::BudgetExceeded);
    }
    policy.spent = spent;
    Ok(())
}

fn validate_transfer_args(
    env: &Env,
    args: &Vec<Val>,
    _policy: Option<&SessionPolicy>,
) -> Result<(Address, i128), AccountError> {
    if args.len() != 3 {
        return Err(AccountError::InvalidTransfer);
    }
    let from = Address::try_from_val(env, &args.get(0).ok_or(AccountError::InvalidTransfer)?)
        .map_err(|_| AccountError::InvalidTransfer)?;
    let to = MuxedAddress::try_from_val(env, &args.get(1).ok_or(AccountError::InvalidTransfer)?)
        .map_err(|_| AccountError::InvalidTransfer)?;
    let amount = i128::try_from_val(env, &args.get(2).ok_or(AccountError::InvalidTransfer)?)
        .map_err(|_| AccountError::InvalidTransfer)?;
    if from != env.current_contract_address() || amount <= 0 {
        return Err(AccountError::InvalidTransfer);
    }
    Ok((to.address(), amount))
}

fn validate_policy(
    env: &Env,
    destinations: &Vec<Address>,
    assets: &Vec<Address>,
    per_payment_limit: i128,
    total_limit: i128,
    expires_at: u64,
) -> Result<(), AccountError> {
    if destinations.is_empty()
        || assets.is_empty()
        || destinations.len() > 16
        || assets.len() > 16
    {
        return Err(AccountError::AllowlistTooLarge);
    }
    if per_payment_limit <= 0
        || total_limit < per_payment_limit
        || expires_at <= env.ledger().timestamp()
    {
        return Err(AccountError::InvalidPolicy);
    }
    Ok(())
}

fn read_session(env: &Env) -> Result<SessionPolicy, AccountError> {
    env.storage()
        .instance()
        .get(&DataKey::Session)
        .ok_or(AccountError::MissingSession)
}

fn address_allowed(items: &Vec<Address>, item: &Address) -> bool {
    items.iter().any(|allowed| allowed == *item)
}

fn bump_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn panic_with(env: &Env, error: AccountError) -> ! {
    soroban_sdk::panic_with_error!(env, error)
}

fn base64_url_encode(dst: &mut [u8], src: &[u8]) {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut di = 0usize;
    let mut si = 0usize;
    let n = (src.len() / 3) * 3;
    while si < n {
        let value =
            (src[si] as usize) << 16 | (src[si + 1] as usize) << 8 | src[si + 2] as usize;
        dst[di] = ALPHABET[value >> 18 & 0x3f];
        dst[di + 1] = ALPHABET[value >> 12 & 0x3f];
        dst[di + 2] = ALPHABET[value >> 6 & 0x3f];
        dst[di + 3] = ALPHABET[value & 0x3f];
        si += 3;
        di += 4;
    }
    let remain = src.len() - si;
    if remain == 0 {
        return;
    }
    let mut value = (src[si] as usize) << 16;
    if remain == 2 {
        value |= (src[si + 1] as usize) << 8;
    }
    dst[di] = ALPHABET[value >> 18 & 0x3f];
    dst[di + 1] = ALPHABET[value >> 12 & 0x3f];
    if remain == 2 {
        dst[di + 2] = ALPHABET[value >> 6 & 0x3f];
    }
}

#[cfg(test)]
mod test;
