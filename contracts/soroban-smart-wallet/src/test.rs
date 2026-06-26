#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, String,
};

struct Fixture {
    env: Env,
    client: SorobanSmartWalletClient<'static>,
    contract_id: Address,
    owner: Address,
    non_owner: Address,
    session_signer: Address,
    destination: Address,
    other_destination: Address,
    asset_contract: Address,
    other_asset_contract: Address,
}

fn fixture() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(100);
    let contract_id = env.register(SorobanSmartWallet, ());
    let client = SorobanSmartWalletClient::new(&env, &contract_id);
    let owner = Address::generate(&env);
    let non_owner = Address::generate(&env);
    let session_signer = Address::generate(&env);
    let destination = Address::generate(&env);
    let other_destination = Address::generate(&env);
    let asset_admin = Address::generate(&env);
    let asset_contract = env.register_stellar_asset_contract_v2(asset_admin.clone()).address();
    let other_asset_contract = env.register_stellar_asset_contract_v2(asset_admin).address();
    client.init(&owner);
    Fixture {
        env,
        client,
        contract_id,
        owner,
        non_owner,
        session_signer,
        destination,
        other_destination,
        asset_contract,
        other_asset_contract,
    }
}

fn provider(env: &Env) -> String {
    String::from_str(env, "browserbase-mcp")
}

fn grant_default(fx: &Fixture) -> SessionPolicy {
    fx.client.grant_session(
        &fx.owner,
        &fx.session_signer,
        &vec![&fx.env, fx.destination.clone()],
        &vec![&fx.env, provider(&fx.env)],
        &vec![&fx.env, fx.asset_contract.clone()],
        &25,
        &1_000,
    )
}

fn fund_contract(fx: &Fixture, amount: i128) {
    let asset_client = StellarAssetClient::new(&fx.env, &fx.asset_contract);
    asset_client.mint(&fx.contract_id, &amount);
}

#[test]
fn owner_can_init_and_grant_session() {
    let fx = fixture();
    let policy = grant_default(&fx);
    let stored = fx.client.read_session(&fx.session_signer).unwrap();

    assert_eq!(policy.session_signer, fx.session_signer);
    assert_eq!(policy.per_payment_limit, 25);
    assert_eq!(policy.revoked, false);
    assert_eq!(policy.allowed_assets, vec![&fx.env, fx.asset_contract.clone()]);
    assert_eq!(stored, policy);
}

#[test]
#[should_panic]
fn non_owner_cannot_grant_session() {
    let fx = fixture();
    fx.client.grant_session(
        &fx.non_owner,
        &fx.session_signer,
        &vec![&fx.env, fx.destination.clone()],
        &vec![&fx.env, provider(&fx.env)],
        &vec![&fx.env, fx.asset_contract.clone()],
        &25,
        &1_000,
    );
}

#[test]
fn valid_session_can_execute_allowed_payment() {
    let fx = fixture();
    grant_default(&fx);
    let receipt = fx.client.execute_allowed_payment(
        &fx.session_signer,
        &fx.destination,
        &18,
        &provider(&fx.env),
        &1,
    );

    assert_eq!(receipt.session_signer, fx.session_signer);
    assert_eq!(receipt.destination, fx.destination);
    assert_eq!(receipt.amount, 18);
    assert_eq!(receipt.provider_id, provider(&fx.env));
    assert_eq!(receipt.nonce, 1);
    assert_eq!(receipt.executed_at, 100);
}

#[test]
fn valid_session_can_execute_allowed_transfer() {
    let fx = fixture();
    grant_default(&fx);
    fund_contract(&fx, 25);
    let token_client = TokenClient::new(&fx.env, &fx.asset_contract);
    assert_eq!(token_client.balance(&fx.destination), 0);

    let receipt = fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &7,
        &provider(&fx.env),
        &2,
    );

    assert_eq!(receipt.asset_contract, fx.asset_contract);
    assert_eq!(receipt.amount, 7);
    assert_eq!(receipt.destination, fx.destination);
    assert_eq!(token_client.balance(&fx.destination), 7);
    assert_eq!(token_client.balance(&fx.contract_id), 18);
}

#[test]
#[should_panic]
fn transfer_blocks_asset_outside_allowlist() {
    let fx = fixture();
    grant_default(&fx);
    fund_contract(&fx, 25);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.other_asset_contract,
        &7,
        &provider(&fx.env),
        &3,
    );
}

#[test]
#[should_panic]
fn destination_and_provider_outside_allowlist_blocks() {
    let fx = fixture();
    grant_default(&fx);
    fx.client.execute_allowed_payment(
        &fx.session_signer,
        &fx.other_destination,
        &18,
        &String::from_str(&fx.env, "unknown-provider"),
        &4,
    );
}

#[test]
fn provider_allowlist_can_authorize_even_when_destination_differs() {
    let fx = fixture();
    grant_default(&fx);
    let receipt = fx.client.execute_allowed_payment(
        &fx.session_signer,
        &fx.other_destination,
        &18,
        &provider(&fx.env),
        &5,
    );

    assert_eq!(receipt.destination, fx.other_destination);
}

#[test]
#[should_panic]
fn amount_over_limit_blocks() {
    let fx = fixture();
    grant_default(&fx);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &26,
        &provider(&fx.env),
        &6,
    );
}

#[test]
#[should_panic]
fn expired_session_blocks() {
    let fx = fixture();
    fx.client.grant_session(
        &fx.owner,
        &fx.session_signer,
        &vec![&fx.env, fx.destination.clone()],
        &vec![&fx.env, provider(&fx.env)],
        &vec![&fx.env, fx.asset_contract.clone()],
        &25,
        &99,
    );
    fx.client.execute_allowed_payment(
        &fx.session_signer,
        &fx.destination,
        &18,
        &provider(&fx.env),
        &7,
    );
}

#[test]
#[should_panic]
fn revoked_session_blocks() {
    let fx = fixture();
    grant_default(&fx);
    let revoked = fx.client.revoke_session(&fx.owner, &fx.session_signer);
    assert_eq!(revoked.revoked, true);
    fx.client.execute_allowed_payment(
        &fx.session_signer,
        &fx.destination,
        &18,
        &provider(&fx.env),
        &8,
    );
}

#[test]
#[should_panic]
fn repeated_nonce_blocks_replay() {
    let fx = fixture();
    grant_default(&fx);
    fx.client.execute_allowed_payment(
        &fx.session_signer,
        &fx.destination,
        &18,
        &provider(&fx.env),
        &9,
    );
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &7,
        &provider(&fx.env),
        &9,
    );
}