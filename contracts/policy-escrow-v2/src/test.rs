#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env,
};

struct Fixture {
    env: Env,
    client: PolicyEscrowV2Client<'static>,
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
    let owner = Address::generate(&env);
    let non_owner = Address::generate(&env);
    let session_signer = Address::generate(&env);
    let destination = Address::generate(&env);
    let other_destination = Address::generate(&env);
    let asset_admin = Address::generate(&env);
    let asset_contract = env.register_stellar_asset_contract_v2(asset_admin.clone()).address();
    let other_asset_contract = env.register_stellar_asset_contract_v2(asset_admin).address();
    let contract_id = env.register(
        PolicyEscrowV2,
        PolicyEscrowV2Args::__constructor(&owner),
    );
    let client = PolicyEscrowV2Client::new(&env, &contract_id);
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

fn grant(fx: &Fixture, per_payment_limit: i128, total_limit: i128) -> SessionPolicyV2 {
    fx.client.grant_session(
        &fx.owner,
        &fx.session_signer,
        &vec![&fx.env, fx.destination.clone()],
        &vec![&fx.env, fx.asset_contract.clone()],
        &per_payment_limit,
        &total_limit,
        &1_000,
    )
}

fn reference(env: &Env, byte: u8) -> BytesN<32> {
    BytesN::from_array(env, &[byte; 32])
}

fn fund(fx: &Fixture, amount: i128) {
    StellarAssetClient::new(&fx.env, &fx.asset_contract).mint(&fx.contract_id, &amount);
}

#[test]
fn constructor_and_grant_create_bounded_session() {
    let fx = fixture();
    let policy = grant(&fx, 2, 5);
    assert_eq!(policy.session_signer, fx.session_signer);
    assert_eq!(policy.per_payment_limit, 2);
    assert_eq!(policy.total_limit, 5);
    assert_eq!(policy.spent, 0);
    assert_eq!(policy.next_nonce, 1);
    assert_eq!(policy.revoked, false);
    assert_eq!(fx.client.read_session(&fx.session_signer), Some(policy));
}

#[test]
#[should_panic]
fn non_owner_cannot_grant() {
    let fx = fixture();
    fx.client.grant_session(
        &fx.non_owner,
        &fx.session_signer,
        &vec![&fx.env, fx.destination.clone()],
        &vec![&fx.env, fx.asset_contract.clone()],
        &1,
        &1,
        &1_000,
    );
}

#[test]
#[should_panic]
fn invalid_policy_is_rejected() {
    let fx = fixture();
    fx.client.grant_session(
        &fx.owner,
        &fx.session_signer,
        &vec![&fx.env],
        &vec![&fx.env, fx.asset_contract.clone()],
        &0,
        &0,
        &99,
    );
}

#[test]
fn allowed_transfer_updates_balance_budget_and_nonce() {
    let fx = fixture();
    grant(&fx, 2, 5);
    fund(&fx, 5);
    let destination_token = TokenClient::new(&fx.env, &fx.asset_contract);
    let before = destination_token.balance(&fx.destination);

    let receipt = fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &2,
        &reference(&fx.env, 7),
        &1,
    );

    assert_eq!(destination_token.balance(&fx.destination), before + 2);
    assert_eq!(receipt.spent, 2);
    assert_eq!(receipt.remaining_budget, 3);
    let stored = fx.client.read_session(&fx.session_signer).unwrap();
    assert_eq!(stored.spent, 2);
    assert_eq!(stored.next_nonce, 2);
}

#[test]
#[should_panic]
fn destination_must_be_allowlisted_even_with_valid_session() {
    let fx = fixture();
    grant(&fx, 1, 2);
    fund(&fx, 1);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.other_destination,
        &fx.asset_contract,
        &1,
        &reference(&fx.env, 1),
        &1,
    );
}

#[test]
#[should_panic]
fn asset_must_be_allowlisted() {
    let fx = fixture();
    grant(&fx, 1, 2);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.other_asset_contract,
        &1,
        &reference(&fx.env, 2),
        &1,
    );
}

#[test]
#[should_panic]
fn zero_amount_is_rejected() {
    let fx = fixture();
    grant(&fx, 1, 2);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &0,
        &reference(&fx.env, 3),
        &1,
    );
}

#[test]
#[should_panic]
fn per_payment_limit_is_enforced() {
    let fx = fixture();
    grant(&fx, 1, 3);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &2,
        &reference(&fx.env, 4),
        &1,
    );
}

#[test]
#[should_panic]
fn cumulative_budget_is_enforced() {
    let fx = fixture();
    grant(&fx, 2, 3);
    fund(&fx, 4);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &2,
        &reference(&fx.env, 5),
        &1,
    );
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &2,
        &reference(&fx.env, 6),
        &2,
    );
}

#[test]
#[should_panic]
fn nonce_must_be_exactly_next() {
    let fx = fixture();
    grant(&fx, 1, 2);
    fund(&fx, 1);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &1,
        &reference(&fx.env, 8),
        &2,
    );
}

#[test]
#[should_panic]
fn expired_session_is_rejected() {
    let fx = fixture();
    grant(&fx, 1, 2);
    fx.env.ledger().set_timestamp(1_001);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &1,
        &reference(&fx.env, 9),
        &1,
    );
}

#[test]
#[should_panic]
fn revoked_session_is_rejected() {
    let fx = fixture();
    grant(&fx, 1, 2);
    fx.client.revoke_session(&fx.owner, &fx.session_signer);
    fx.client.execute_allowed_transfer(
        &fx.session_signer,
        &fx.destination,
        &fx.asset_contract,
        &1,
        &reference(&fx.env, 10),
        &1,
    );
}

#[test]
fn owner_can_recover_prefunded_assets() {
    let fx = fixture();
    fund(&fx, 3);
    let token_client = TokenClient::new(&fx.env, &fx.asset_contract);
    fx.client.owner_withdraw(
        &fx.owner,
        &fx.destination,
        &fx.asset_contract,
        &3,
    );
    assert_eq!(token_client.balance(&fx.destination), 3);
    assert_eq!(token_client.balance(&fx.contract_id), 0);
}

#[test]
#[should_panic]
fn non_owner_cannot_recover_assets() {
    let fx = fixture();
    fund(&fx, 1);
    fx.client.owner_withdraw(
        &fx.non_owner,
        &fx.destination,
        &fx.asset_contract,
        &1,
    );
}

