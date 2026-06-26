#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token,
    Address, Env, MuxedAddress, String, Vec,
};

#[contract]
pub struct SorobanSmartWallet;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum SmartWalletError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotOwner = 3,
    MissingSession = 4,
    RevokedSession = 5,
    ExpiredSession = 6,
    OutsideAllowlist = 7,
    AmountOverLimit = 8,
    ReplayNonce = 9,
    AssetOutsideAllowlist = 10,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionPolicy {
    pub session_signer: Address,
    pub allowed_destinations: Vec<Address>,
    pub allowed_providers: Vec<String>,
    pub allowed_assets: Vec<Address>,
    pub per_payment_limit: i128,
    pub expires_at: u64,
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExecutionReceipt {
    pub session_signer: Address,
    pub destination: Address,
    pub amount: i128,
    pub provider_id: String,
    pub nonce: u64,
    pub executed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferReceipt {
    pub session_signer: Address,
    pub destination: Address,
    pub asset_contract: Address,
    pub amount: i128,
    pub provider_id: String,
    pub nonce: u64,
    pub executed_at: u64,
}

#[contractevent(topics = ["spend", "execute"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentExecutedEvent {
    #[topic]
    pub session_signer: Address,
    pub receipt: ExecutionReceipt,
}

#[contractevent(topics = ["spend", "transfer"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferExecutedEvent {
    #[topic]
    pub session_signer: Address,
    pub receipt: TransferReceipt,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Owner,
    Session(Address),
    Nonce(Address, u64),
}

#[contractimpl]
impl SorobanSmartWallet {
    pub fn init(env: Env, owner: Address) {
        owner.require_auth();
        if env.storage().instance().has(&DataKey::Owner) {
            panic_with_error!(&env, SmartWalletError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Owner, &owner);
    }

    pub fn grant_session(
        env: Env,
        owner_auth: Address,
        session_signer: Address,
        allowed_destinations: Vec<Address>,
        allowed_providers: Vec<String>,
        allowed_assets: Vec<Address>,
        per_payment_limit: i128,
        expires_at: u64,
    ) -> SessionPolicy {
        require_owner(&env, &owner_auth);
        let policy = SessionPolicy {
            session_signer: session_signer.clone(),
            allowed_destinations,
            allowed_providers,
            allowed_assets,
            per_payment_limit,
            expires_at,
            revoked: false,
        };
        env.storage()
            .instance()
            .set(&DataKey::Session(session_signer), &policy);
        policy
    }

    pub fn revoke_session(env: Env, owner_auth: Address, session_signer: Address) -> SessionPolicy {
        require_owner(&env, &owner_auth);
        let mut policy = read_existing_session(&env, &session_signer);
        policy.revoked = true;
        env.storage()
            .instance()
            .set(&DataKey::Session(session_signer), &policy);
        policy
    }

    pub fn execute_allowed_payment(
        env: Env,
        session_signer: Address,
        destination: Address,
        amount: i128,
        provider_id: String,
        nonce: u64,
    ) -> ExecutionReceipt {
        session_signer.require_auth();
        validate_session_payment(&env, &session_signer, &destination, amount, &provider_id, nonce);

        let receipt = ExecutionReceipt {
            session_signer: session_signer.clone(),
            destination,
            amount,
            provider_id,
            nonce,
            executed_at: env.ledger().timestamp(),
        };
        PaymentExecutedEvent {
            session_signer,
            receipt: receipt.clone(),
        }
        .publish(&env);
        receipt
    }

    pub fn execute_allowed_transfer(
        env: Env,
        session_signer: Address,
        destination: Address,
        asset_contract: Address,
        amount: i128,
        provider_id: String,
        nonce: u64,
    ) -> TransferReceipt {
        session_signer.require_auth();
        let policy =
            validate_session_payment(&env, &session_signer, &destination, amount, &provider_id, nonce);
        if !address_allowed(&policy.allowed_assets, &asset_contract) {
            panic_with_error!(&env, SmartWalletError::AssetOutsideAllowlist);
        }

        let token_client = token::TokenClient::new(&env, &asset_contract);
        let muxed_destination = MuxedAddress::from(destination.clone());
        token_client.transfer(&env.current_contract_address(), &muxed_destination, &amount);

        let receipt = TransferReceipt {
            session_signer: session_signer.clone(),
            destination,
            asset_contract,
            amount,
            provider_id,
            nonce,
            executed_at: env.ledger().timestamp(),
        };
        TransferExecutedEvent {
            session_signer,
            receipt: receipt.clone(),
        }
        .publish(&env);
        receipt
    }

    pub fn read_session(env: Env, session_signer: Address) -> Option<SessionPolicy> {
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
        .unwrap_or_else(|| panic_with_error!(env, SmartWalletError::NotInitialized));
    if owner != *owner_auth {
        panic_with_error!(env, SmartWalletError::NotOwner);
    }
}

fn read_existing_session(env: &Env, session_signer: &Address) -> SessionPolicy {
    env.storage()
        .instance()
        .get(&DataKey::Session(session_signer.clone()))
        .unwrap_or_else(|| panic_with_error!(env, SmartWalletError::MissingSession))
}

fn validate_session_payment(
    env: &Env,
    session_signer: &Address,
    destination: &Address,
    amount: i128,
    provider_id: &String,
    nonce: u64,
) -> SessionPolicy {
    let policy = read_existing_session(env, session_signer);

    if policy.revoked {
        panic_with_error!(env, SmartWalletError::RevokedSession);
    }
    if env.ledger().timestamp() > policy.expires_at {
        panic_with_error!(env, SmartWalletError::ExpiredSession);
    }
    if amount > policy.per_payment_limit {
        panic_with_error!(env, SmartWalletError::AmountOverLimit);
    }
    if !address_allowed(&policy.allowed_destinations, destination)
        && !provider_allowed(&policy.allowed_providers, provider_id)
    {
        panic_with_error!(env, SmartWalletError::OutsideAllowlist);
    }

    let nonce_key = DataKey::Nonce(session_signer.clone(), nonce);
    if env.storage().instance().has(&nonce_key) {
        panic_with_error!(env, SmartWalletError::ReplayNonce);
    }
    env.storage().instance().set(&nonce_key, &true);
    policy
}

fn address_allowed(items: &Vec<Address>, item: &Address) -> bool {
    for allowed in items.iter() {
        if allowed == *item {
            return true;
        }
    }
    false
}

fn provider_allowed(providers: &Vec<String>, provider_id: &String) -> bool {
    for item in providers.iter() {
        if item == *provider_id {
            return true;
        }
    }
    false
}

mod test;