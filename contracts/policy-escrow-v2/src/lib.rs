#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, BytesN, Env, MuxedAddress, Vec,
};

const MAX_ALLOWLIST_ITEMS: u32 = 16;
const TTL_THRESHOLD: u32 = 518_400;
const TTL_EXTEND_TO: u32 = 3_110_400;

#[contract]
pub struct PolicyEscrowV2;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    NotInitialized = 1,
    NotOwner = 2,
    MissingSession = 3,
    RevokedSession = 4,
    ExpiredSession = 5,
    DestinationOutsideAllowlist = 6,
    AssetOutsideAllowlist = 7,
    InvalidAmount = 8,
    AmountOverLimit = 9,
    SessionBudgetExceeded = 10,
    InvalidNonce = 11,
    InvalidPolicy = 12,
    AllowlistTooLarge = 13,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionPolicyV2 {
    pub session_signer: Address,
    pub allowed_destinations: Vec<Address>,
    pub allowed_assets: Vec<Address>,
    pub per_payment_limit: i128,
    pub total_limit: i128,
    pub spent: i128,
    pub expires_at: u64,
    pub revoked: bool,
    pub next_nonce: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferReceiptV2 {
    pub session_signer: Address,
    pub destination: Address,
    pub asset_contract: Address,
    pub amount: i128,
    pub payment_reference: BytesN<32>,
    pub nonce: u64,
    pub spent: i128,
    pub remaining_budget: i128,
    pub executed_at: u64,
}

#[contractevent(topics = ["escrow_v2", "transfer"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferExecutedV2 {
    #[topic]
    pub session_signer: Address,
    pub receipt: TransferReceiptV2,
}

#[contractevent(topics = ["escrow_v2", "withdraw"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OwnerWithdrawalV2 {
    #[topic]
    pub owner: Address,
    pub destination: Address,
    pub asset_contract: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
    Session(Address),
}

#[contractimpl]
impl PolicyEscrowV2 {
    pub fn __constructor(env: Env, owner: Address) {
        env.storage().instance().set(&DataKey::Owner, &owner);
        bump_ttl(&env);
    }

    pub fn grant_session(
        env: Env,
        owner_auth: Address,
        session_signer: Address,
        allowed_destinations: Vec<Address>,
        allowed_assets: Vec<Address>,
        per_payment_limit: i128,
        total_limit: i128,
        expires_at: u64,
    ) -> SessionPolicyV2 {
        require_owner(&env, &owner_auth);
        validate_policy(
            &env,
            &allowed_destinations,
            &allowed_assets,
            per_payment_limit,
            total_limit,
            expires_at,
        );
        let policy = SessionPolicyV2 {
            session_signer: session_signer.clone(),
            allowed_destinations,
            allowed_assets,
            per_payment_limit,
            total_limit,
            spent: 0,
            expires_at,
            revoked: false,
            next_nonce: 1,
        };
        env.storage()
            .instance()
            .set(&DataKey::Session(session_signer), &policy);
        bump_ttl(&env);
        policy
    }

    pub fn revoke_session(
        env: Env,
        owner_auth: Address,
        session_signer: Address,
    ) -> SessionPolicyV2 {
        require_owner(&env, &owner_auth);
        let mut policy = read_existing_session(&env, &session_signer);
        policy.revoked = true;
        env.storage()
            .instance()
            .set(&DataKey::Session(session_signer), &policy);
        bump_ttl(&env);
        policy
    }

    pub fn execute_allowed_transfer(
        env: Env,
        session_signer: Address,
        destination: Address,
        asset_contract: Address,
        amount: i128,
        payment_reference: BytesN<32>,
        nonce: u64,
    ) -> TransferReceiptV2 {
        session_signer.require_auth();
        let mut policy = validate_transfer(
            &env,
            &session_signer,
            &destination,
            &asset_contract,
            amount,
            nonce,
        );

        let spent = policy
            .spent
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::SessionBudgetExceeded));
        if spent > policy.total_limit {
            panic_with_error!(&env, EscrowError::SessionBudgetExceeded);
        }
        policy.spent = spent;
        policy.next_nonce = policy
            .next_nonce
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, EscrowError::InvalidNonce));
        env.storage()
            .instance()
            .set(&DataKey::Session(session_signer.clone()), &policy);

        let token_client = token::TokenClient::new(&env, &asset_contract);
        token_client.transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(destination.clone()),
            &amount,
        );

        let receipt = TransferReceiptV2 {
            session_signer: session_signer.clone(),
            destination,
            asset_contract,
            amount,
            payment_reference,
            nonce,
            spent,
            remaining_budget: policy.total_limit - spent,
            executed_at: env.ledger().timestamp(),
        };
        TransferExecutedV2 {
            session_signer,
            receipt: receipt.clone(),
        }
        .publish(&env);
        bump_ttl(&env);
        receipt
    }

    pub fn owner_withdraw(
        env: Env,
        owner_auth: Address,
        destination: Address,
        asset_contract: Address,
        amount: i128,
    ) {
        require_owner(&env, &owner_auth);
        require_positive_amount(&env, amount);
        token::TokenClient::new(&env, &asset_contract).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(destination.clone()),
            &amount,
        );
        OwnerWithdrawalV2 {
            owner: owner_auth,
            destination,
            asset_contract,
            amount,
        }
        .publish(&env);
        bump_ttl(&env);
    }

    pub fn extend_ttl(env: Env, owner_auth: Address) {
        require_owner(&env, &owner_auth);
        bump_ttl(&env);
    }

    pub fn read_session(env: Env, session_signer: Address) -> Option<SessionPolicyV2> {
        env.storage()
            .instance()
            .get(&DataKey::Session(session_signer))
    }
}

fn require_owner(env: &Env, owner_auth: &Address) {
    owner_auth.require_auth();
    let owner: Address = env
        .storage()
        .instance()
        .get(&DataKey::Owner)
        .unwrap_or_else(|| panic_with_error!(env, EscrowError::NotInitialized));
    if owner != *owner_auth {
        panic_with_error!(env, EscrowError::NotOwner);
    }
}

fn validate_policy(
    env: &Env,
    destinations: &Vec<Address>,
    assets: &Vec<Address>,
    per_payment_limit: i128,
    total_limit: i128,
    expires_at: u64,
) {
    if destinations.is_empty()
        || assets.is_empty()
        || per_payment_limit <= 0
        || total_limit < per_payment_limit
        || expires_at <= env.ledger().timestamp()
    {
        panic_with_error!(env, EscrowError::InvalidPolicy);
    }
    if destinations.len() > MAX_ALLOWLIST_ITEMS || assets.len() > MAX_ALLOWLIST_ITEMS {
        panic_with_error!(env, EscrowError::AllowlistTooLarge);
    }
}

fn validate_transfer(
    env: &Env,
    session_signer: &Address,
    destination: &Address,
    asset_contract: &Address,
    amount: i128,
    nonce: u64,
) -> SessionPolicyV2 {
    let policy = read_existing_session(env, session_signer);
    if policy.revoked {
        panic_with_error!(env, EscrowError::RevokedSession);
    }
    if env.ledger().timestamp() > policy.expires_at {
        panic_with_error!(env, EscrowError::ExpiredSession);
    }
    require_positive_amount(env, amount);
    if amount > policy.per_payment_limit {
        panic_with_error!(env, EscrowError::AmountOverLimit);
    }
    if !address_allowed(&policy.allowed_destinations, destination) {
        panic_with_error!(env, EscrowError::DestinationOutsideAllowlist);
    }
    if !address_allowed(&policy.allowed_assets, asset_contract) {
        panic_with_error!(env, EscrowError::AssetOutsideAllowlist);
    }
    if nonce != policy.next_nonce {
        panic_with_error!(env, EscrowError::InvalidNonce);
    }
    policy
}

fn require_positive_amount(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, EscrowError::InvalidAmount);
    }
}

fn read_existing_session(env: &Env, session_signer: &Address) -> SessionPolicyV2 {
    env.storage()
        .instance()
        .get(&DataKey::Session(session_signer.clone()))
        .unwrap_or_else(|| panic_with_error!(env, EscrowError::MissingSession))
}

fn address_allowed(items: &Vec<Address>, item: &Address) -> bool {
    for allowed in items.iter() {
        if allowed == *item {
            return true;
        }
    }
    false
}

fn bump_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
