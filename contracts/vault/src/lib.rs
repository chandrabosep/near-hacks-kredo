//! Kredo vault on NEAR.
//!
//! Holds the USDT behind every credit, and every balance, app limit, hold, claim link and payout.
//! 1 credit = $0.01 = 10,000 USDT units (6 decimals). All amounts are in USDT units.
//! Credits are created only when USDT arrives through `ft_transfer_call`. There is no admin mint.
//!
//! Backing invariant:
//!   usdt.ft_balance_of(vault) >= total_balances + total_held + total_claims + total_earnings + protocol_fees
//!
//! Users never sign typed data. They call `approve_app`, `revoke_app`, `send` and `create_claim`
//! directly, as NEAR meta transactions (NEP-366) that the Kredo relayer pays gas for, so the
//! contract reads the user from `predecessor_account_id`.
//!
//! Apps sign their own charges the same way. Each app has a signer account, normally a
//! sub-account whose only key is a function-call key for `charge`, `hold`, `capture`, `release`
//! and `refund` on this vault. Only that account can charge for the app; the Kredo operator and
//! owner can't, and only the app's payout account can move it to a new signer.
//!
//! Storage follows NEP-145: an account is registered with a NEAR deposit before the vault holds
//! state for it, and state a call adds is paid from the storage balance of whoever made the call.

use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, CurveType, Gas, NearToken,
    PanicOnDefault, Promise, PromiseError, PromiseOrValue, PublicKey,
};

#[cfg(test)]
mod tests;

pub const UNITS_PER_CREDIT: u128 = 10_000;
/// Highest network fee an app can be set to: 20%.
pub const MAX_FEE_BPS: u16 = 2_000;
const BPS: u128 = 10_000;
/// Longest a hold can last. Caps how long even a leaked app signer key could freeze credits.
pub const MAX_HOLD_SECONDS: u64 = 86_400;
const MAX_ID_LEN: usize = 64;
const MAX_REF_LEN: usize = 128;

const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Operators,
    Apps,
    Balances,
    Limits,
    Holds,
    Claims,
    Earnings,
    Spent,
    Refs,
    Storage,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct App {
    /// Receives the company's USDT earnings.
    pub payout: AccountId,
    /// The only account that can charge, hold, capture or refund for this app: normally a
    /// sub-account whose only key is a function-call key limited to those methods on the vault.
    pub signer: AccountId,
    /// Network fee taken from each charge, in basis points.
    pub fee_bps: u16,
    /// Largest single charge or hold, in units. 0 means no cap.
    pub max_charge: U128,
    pub active: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Limit {
    /// Units the app may still charge this user.
    pub remaining: U128,
    /// Unix seconds when the limit stops working. 0 means never.
    pub expiry: u64,
    /// Bumps on every approve and revoke.
    pub version: u32,
}

impl Limit {
    fn empty() -> Self {
        Self { remaining: U128(0), expiry: 0, version: 0 }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum HoldStatus {
    Open,
    Captured,
    Released,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Hold {
    pub user: AccountId,
    pub app: String,
    pub amount: U128,
    /// Unix seconds after which anyone can release the hold.
    pub expiry: u64,
    /// The user's limit version when the hold was taken.
    pub limit_version: u32,
    pub status: HoldStatus,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ClaimStatus {
    Open,
    Claimed,
    Cancelled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Claim {
    pub from: AccountId,
    pub amount: U128,
    pub expiry: u64,
    pub status: ClaimStatus,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Totals {
    pub balances: U128,
    pub held: U128,
    pub claims: U128,
    pub earnings: U128,
    pub fees: U128,
    pub liabilities: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Config {
    pub owner: AccountId,
    pub pending_owner: Option<AccountId>,
    pub usdt: AccountId,
    pub fee_recipient: AccountId,
    pub paused: bool,
}

/// NEAR an account has put down for its state in the vault (NEP-145), in yoctoNEAR.
/// `total - available` is locked: it paid for the account's record and for the state its calls added.
#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
struct StorageDeposit {
    total: u128,
    available: u128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, Default)]
struct DepositMsg {
    /// Account to credit. Defaults to the sender.
    user: Option<AccountId>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Vault {
    owner: AccountId,
    pending_owner: Option<AccountId>,
    usdt: AccountId,
    fee_recipient: AccountId,
    paused: bool,
    operators: LookupSet<AccountId>,
    apps: LookupMap<String, App>,
    balances: LookupMap<AccountId, u128>,
    limits: LookupMap<(AccountId, String), Limit>,
    holds: LookupMap<String, Hold>,
    claims: LookupMap<String, Claim>,
    earnings: LookupMap<String, u128>,
    /// Credits each user has spent with each app, net of refunds. Caps refunds.
    spent: LookupMap<(AccountId, String), u128>,
    /// Charge, hold and refund references already used per app.
    refs: LookupSet<(String, String)>,
    /// NEP-145 storage deposits. An account must be registered here before the vault holds
    /// any state for it, so the vault never pays for state someone else creates.
    storage: LookupMap<AccountId, StorageDeposit>,
    /// Bytes one account's registration takes (its storage record and its balance entry),
    /// measured at init with the longest possible account id.
    account_storage_bytes: u64,
    total_balances: u128,
    total_held: u128,
    total_claims: u128,
    total_earnings: u128,
    protocol_fees: u128,
}

#[near]
impl Vault {
    #[init]
    pub fn new(usdt: AccountId, owner: AccountId, operator: Option<AccountId>, fee_recipient: AccountId) -> Self {
        let mut v = Self {
            owner,
            pending_owner: None,
            usdt,
            fee_recipient,
            paused: false,
            operators: LookupSet::new(StorageKey::Operators),
            apps: LookupMap::new(StorageKey::Apps),
            balances: LookupMap::new(StorageKey::Balances),
            limits: LookupMap::new(StorageKey::Limits),
            holds: LookupMap::new(StorageKey::Holds),
            claims: LookupMap::new(StorageKey::Claims),
            earnings: LookupMap::new(StorageKey::Earnings),
            spent: LookupMap::new(StorageKey::Spent),
            refs: LookupSet::new(StorageKey::Refs),
            storage: LookupMap::new(StorageKey::Storage),
            account_storage_bytes: 0,
            total_balances: 0,
            total_held: 0,
            total_claims: 0,
            total_earnings: 0,
            protocol_fees: 0,
        };
        v.measure_account_storage();
        if let Some(op) = operator {
            v.operators.insert(op.clone());
            emit("operator_set", json!({ "account": op, "allowed": true }));
        }
        v
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    pub fn set_operator(&mut self, account: AccountId, allowed: bool) {
        self.only_owner();
        if allowed {
            self.operators.insert(account.clone());
        } else {
            self.operators.remove(&account);
        }
        emit("operator_set", json!({ "account": account, "allowed": allowed }));
    }

    pub fn set_fee_recipient(&mut self, account: AccountId) {
        self.only_owner();
        self.fee_recipient = account.clone();
        emit("fee_recipient_set", json!({ "account": account }));
    }

    /// Owner or any operator can pause, so the relayer can stop itself.
    pub fn pause(&mut self) {
        self.only_owner_or_operator();
        self.paused = true;
        emit("paused", json!({ "by": env::predecessor_account_id() }));
    }

    /// Only the owner can resume.
    pub fn unpause(&mut self) {
        self.only_owner();
        self.paused = false;
        emit("unpaused", json!({ "by": env::predecessor_account_id() }));
    }

    /// Two-step ownership transfer: the owner proposes, the new owner accepts.
    pub fn propose_owner(&mut self, account: AccountId) {
        self.only_owner();
        self.pending_owner = Some(account);
    }

    pub fn accept_owner(&mut self) {
        let caller = env::predecessor_account_id();
        require!(self.pending_owner.as_ref() == Some(&caller), "Not the pending owner");
        self.owner = caller.clone();
        self.pending_owner = None;
        emit("owner_set", json!({ "account": caller }));
    }

    // ---------------------------------------------------------------------
    // App registry
    // ---------------------------------------------------------------------

    /// Registers a company's app. A registered app still can't charge anyone until that
    /// user approves a limit for it.
    pub fn register_app(&mut self, app: String, payout: AccountId, signer: AccountId, fee_bps: u16, max_charge: Option<U128>) {
        self.only_owner_or_operator();
        assert_id(&app, "app");
        require!(!self.apps.contains_key(&app), "App exists");
        require!(fee_bps <= MAX_FEE_BPS, "Fee too high");
        let max_charge = max_charge.unwrap_or(U128(0));
        let mark = self.storage_mark();
        self.apps.insert(app.clone(), App { payout: payout.clone(), signer: signer.clone(), fee_bps, max_charge, active: true });
        self.pay_storage(&env::predecessor_account_id(), mark);
        emit("app_registered", json!({ "app": app, "payout": payout, "signer": signer, "fee_bps": fee_bps, "max_charge": max_charge }));
    }

    /// Changes an app's fee and per-charge cap. Owner only, so a leaked operator key can't
    /// raise a company's fee.
    pub fn set_app_terms(&mut self, app: String, fee_bps: u16, max_charge: U128) {
        self.only_owner();
        require!(fee_bps <= MAX_FEE_BPS, "Fee too high");
        let a = self.app_mut(&app);
        a.fee_bps = fee_bps;
        a.max_charge = max_charge;
        emit("app_terms_set", json!({ "app": app, "fee_bps": fee_bps, "max_charge": max_charge }));
    }

    /// Moves an app's payouts to a new account. Only the current payout account: the payout
    /// account also controls the app's signer, so if the owner could set it, Kredo could take
    /// over an app's charges.
    pub fn set_app_payout(&mut self, app: String, payout: AccountId) {
        let caller = env::predecessor_account_id();
        let a = self.app_mut(&app);
        require!(caller == a.payout, "Not authorized");
        a.payout = payout.clone();
        emit("app_payout_set", json!({ "app": app, "payout": payout }));
    }

    /// Moves an app's charges to a new signer, for example after a leaked key. Only the app's
    /// payout account, never the owner or an operator, so Kredo can't take over an app's charges.
    pub fn set_app_signer(&mut self, app: String, signer: AccountId) {
        let caller = env::predecessor_account_id();
        let a = self.app_mut(&app);
        require!(caller == a.payout, "Not authorized");
        a.signer = signer.clone();
        emit("app_signer_set", json!({ "app": app, "signer": signer }));
    }

    /// An inactive app can't charge or hold, but can still refund and be paid out.
    pub fn set_app_active(&mut self, app: String, active: bool) {
        self.only_owner_or_operator();
        self.app_mut(&app).active = active;
        emit("app_active_set", json!({ "app": app, "active": active }));
    }

    // ---------------------------------------------------------------------
    // Deposits (NEP-141 receiver)
    // ---------------------------------------------------------------------

    /// Called by the USDT contract on `ft_transfer_call`. Credits exactly what arrived to the
    /// sender, or to `msg.user` when the sender pays for someone else. This is the only way
    /// credits are created. Returning the full amount refunds it, so a paused vault takes nothing.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdt, "Only USDT");
        if self.paused {
            return PromiseOrValue::Value(amount);
        }
        let parsed: DepositMsg = if msg.trim().is_empty() {
            DepositMsg::default()
        } else {
            near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| env::panic_str("Bad msg"))
        };
        let user = parsed.user.unwrap_or_else(|| sender_id.clone());
        require!(amount.0 >= UNITS_PER_CREDIT, "Below minimum deposit");
        if !self.storage.contains_key(&user) {
            // Nobody paid for this user's state, so the vault won't create it. All of it goes back.
            emit("deposit_refunded", json!({ "user": user, "payer": sender_id, "amount": amount, "reason": "not_registered" }));
            return PromiseOrValue::Value(amount);
        }
        self.add_balance(&user, amount.0);
        self.total_balances += amount.0;
        emit("deposited", json!({ "user": user, "payer": sender_id, "amount": amount }));
        PromiseOrValue::Value(U128(0))
    }

    // ---------------------------------------------------------------------
    // App limits (called by the user)
    // ---------------------------------------------------------------------

    /// Sets how much `app` may charge the caller in total, replacing any earlier limit.
    /// `expiry` is unix seconds; omit or 0 for no expiry.
    pub fn approve_app(&mut self, app: String, limit: U128, expiry: Option<u64>) {
        self.when_not_paused();
        self.active_app(&app);
        let user = env::predecessor_account_id();
        let expiry = expiry.unwrap_or(0);
        let mark = self.storage_mark();
        let key = (user.clone(), app.clone());
        let version = self.limits.get(&key).map(|l| l.version).unwrap_or(0) + 1;
        self.limits.insert(key, Limit { remaining: limit, expiry, version });
        self.pay_storage(&user, mark);
        emit("app_approved", json!({ "user": user, "app": app, "limit": limit, "expiry": expiry }));
    }

    /// Removes an app's limit. Works even while paused, so a user can always cut an app off.
    pub fn revoke_app(&mut self, app: String) {
        require!(self.apps.contains_key(&app), "Unknown app");
        let user = env::predecessor_account_id();
        let key = (user.clone(), app.clone());
        // Nothing approved means nothing to revoke, and no new state for the vault to pay for.
        let Some(version) = self.limits.get(&key).map(|l| l.version + 1) else { return };
        self.limits.insert(key, Limit { remaining: U128(0), expiry: 0, version });
        emit("app_revoked", json!({ "user": user, "app": app }));
    }

    // ---------------------------------------------------------------------
    // Charges (signed by the app's own signer)
    // ---------------------------------------------------------------------

    /// Instant charge for a finished action, such as one chat message. Only within the limit the
    /// user approved for this app, and only from the app's own signer: no Kredo key can charge.
    /// `ref_id` is the app's unique id for this charge; a second charge with it fails.
    pub fn charge(&mut self, user: AccountId, app: String, amount: U128, ref_id: String) -> U128 {
        self.only_app_signer(&app);
        self.when_not_paused();
        let mark = self.storage_mark();
        self.use_ref(&app, &ref_id);
        self.consume_limit(&user, &app, amount.0);
        self.debit(&user, amount.0);
        self.total_balances -= amount.0;
        let fee = self.earn(&user, &app, amount.0);
        self.pay_storage(&env::predecessor_account_id(), mark);
        emit("charged", json!({ "user": user, "app": app, "ref_id": ref_id, "amount": amount, "fee": U128(fee) }));
        U128(fee)
    }

    // ---------------------------------------------------------------------
    // Holds (long jobs)
    // ---------------------------------------------------------------------

    /// Reserves credits at the start of a long job and uses up the user's limit now.
    /// `expiry` is unix seconds, at most `MAX_HOLD_SECONDS` away. Returns the hold id.
    pub fn hold(&mut self, user: AccountId, app: String, amount: U128, ref_id: String, expiry: u64) -> String {
        self.only_app_signer(&app);
        self.when_not_paused();
        let now = now();
        require!(expiry > now && expiry <= now + MAX_HOLD_SECONDS, "Bad expiry");
        let mark = self.storage_mark();
        self.use_ref(&app, &ref_id);
        self.consume_limit(&user, &app, amount.0);
        self.debit(&user, amount.0);
        self.total_balances -= amount.0;
        self.total_held += amount.0;

        let hold_id = derive_hold_id(&app, &ref_id);
        let limit_version = self.limits.get(&(user.clone(), app.clone())).map(|l| l.version).unwrap_or(0);
        self.holds.insert(
            hold_id.clone(),
            Hold { user: user.clone(), app: app.clone(), amount, expiry, limit_version, status: HoldStatus::Open },
        );
        self.pay_storage(&env::predecessor_account_id(), mark);
        emit(
            "held",
            json!({ "hold_id": hold_id, "user": user, "app": app, "ref_id": ref_id, "amount": amount, "expiry": expiry }),
        );
        hold_id
    }

    /// The job succeeded. Charges `actual` (at most the held amount) and returns the rest.
    /// Only before the hold expires: after that the user can take it back.
    pub fn capture(&mut self, hold_id: String, actual: U128) -> U128 {
        self.when_not_paused();
        let h = self.holds.get(&hold_id).cloned().unwrap_or_else(|| env::panic_str("Hold not open"));
        self.only_app_signer(&h.app);
        require!(h.status == HoldStatus::Open, "Hold not open");
        require!(now() < h.expiry, "Hold expired");
        require!(actual.0 > 0, "Zero amount");
        require!(actual.0 <= h.amount.0, "Over held");

        let mark = self.storage_mark();
        self.set_hold_status(&hold_id, HoldStatus::Captured);
        self.total_held -= h.amount.0;
        let returned = h.amount.0 - actual.0;
        if returned > 0 {
            self.return_to_user(&h, returned);
        }
        let fee = self.earn(&h.user, &h.app, actual.0);
        self.pay_storage(&env::predecessor_account_id(), mark);
        emit(
            "captured",
            json!({ "hold_id": hold_id, "actual": actual, "fee": U128(fee), "returned": U128(returned) }),
        );
        U128(fee)
    }

    /// The job failed, or the hold ran out. The app's signer or the operator can release at any
    /// time, since releasing only returns credits to the user. After expiry anyone can, even while
    /// paused, so held credits always come back.
    pub fn release(&mut self, hold_id: String) {
        let h = self.holds.get(&hold_id).cloned().unwrap_or_else(|| env::panic_str("Hold not open"));
        require!(h.status == HoldStatus::Open, "Hold not open");
        let caller = env::predecessor_account_id();
        let app_signer = self.apps.get(&h.app).map(|a| a.signer.clone());
        require!(
            now() >= h.expiry || self.operators.contains(&caller) || app_signer.as_ref() == Some(&caller),
            "Hold not expired"
        );

        self.set_hold_status(&hold_id, HoldStatus::Released);
        self.total_held -= h.amount.0;
        self.return_to_user(&h, h.amount.0);
        emit("released", json!({ "hold_id": hold_id, "amount": h.amount, "by": caller }));
    }

    // ---------------------------------------------------------------------
    // Refunds (signed by the app's own signer)
    // ---------------------------------------------------------------------

    /// Gives credits back to a user out of the app's unpaid earnings. The network fee already
    /// taken stays, so the company covers it. Capped at what this user spent with this app.
    pub fn refund(&mut self, app: String, user: AccountId, amount: U128, ref_id: String) {
        self.only_app_signer(&app);
        self.when_not_paused();
        require!(amount.0 > 0, "Zero amount");
        let mark = self.storage_mark();
        self.use_ref(&app, &ref_id);
        let key = (user.clone(), app.clone());
        let spent = self.spent.get(&key).copied().unwrap_or(0);
        require!(amount.0 <= spent, "Over spent");
        let earned = self.earnings.get(&app).copied().unwrap_or(0);
        require!(amount.0 <= earned, "Insufficient earnings");

        self.spent.insert(key, spent - amount.0);
        self.earnings.insert(app.clone(), earned - amount.0);
        self.total_earnings -= amount.0;
        self.add_balance(&user, amount.0);
        self.total_balances += amount.0;
        self.pay_storage(&env::predecessor_account_id(), mark);
        emit("refunded", json!({ "app": app, "user": user, "ref_id": ref_id, "amount": amount }));
    }

    // ---------------------------------------------------------------------
    // User to user
    // ---------------------------------------------------------------------

    /// Moves credits from the caller to `to`.
    pub fn send(&mut self, to: AccountId, amount: U128) {
        self.when_not_paused();
        require!(amount.0 > 0, "Zero amount");
        let from = env::predecessor_account_id();
        require!(from != to, "Same account");
        require!(self.storage.contains_key(&to), "Recipient not registered");
        self.debit(&from, amount.0);
        self.add_balance(&to, amount.0);
        emit("sent", json!({ "from": from, "to": to, "amount": amount }));
    }

    // ---------------------------------------------------------------------
    // Claim links
    // ---------------------------------------------------------------------

    /// Locks the caller's credits behind a claim link. The link carries a one-time ed25519 key;
    /// `claim_key` is its public key.
    pub fn create_claim(&mut self, amount: U128, claim_key: PublicKey, expiry: u64) {
        self.when_not_paused();
        require!(claim_key.curve_type() == CurveType::ED25519, "Claim key must be ed25519");
        require!(amount.0 > 0, "Zero amount");
        require!(expiry > now(), "Bad expiry");
        let id = String::from(&claim_key);
        require!(!self.claims.contains_key(&id), "Claim exists");
        let from = env::predecessor_account_id();
        let mark = self.storage_mark();
        self.debit(&from, amount.0);
        self.total_balances -= amount.0;
        self.total_claims += amount.0;
        self.claims.insert(id.clone(), Claim { from: from.clone(), amount, expiry, status: ClaimStatus::Open });
        self.pay_storage(&from, mark);
        emit("claim_created", json!({ "claim_key": id, "from": from, "amount": amount, "expiry": expiry }));
    }

    /// Redeems a claim link to `to`. The link's key signs `claim_message(claim_key, to)`, so a
    /// copied transaction can't redirect the credits. Anyone, normally our relayer, can submit it.
    pub fn claim(&mut self, claim_key: PublicKey, to: AccountId, signature: Base64VecU8) {
        self.when_not_paused();
        let id = String::from(&claim_key);
        let c = self.claims.get(&id).cloned().unwrap_or_else(|| env::panic_str("Claim not open"));
        require!(c.status == ClaimStatus::Open, "Claim not open");
        require!(now() < c.expiry, "Claim expired");
        require!(verify_claim(&claim_key, &self.claim_message(id.clone(), to.clone()), &signature.0), "Bad signature");
        require!(self.storage.contains_key(&to), "Recipient not registered");

        self.claims.get_mut(&id).unwrap().status = ClaimStatus::Claimed;
        self.total_claims -= c.amount.0;
        self.add_balance(&to, c.amount.0);
        self.total_balances += c.amount.0;
        emit("claimed", json!({ "claim_key": id, "to": to, "amount": c.amount }));
    }

    /// Returns an unclaimed link's credits to its creator. The creator or an operator can cancel
    /// at any time; anyone can after expiry, even while paused.
    pub fn cancel_claim(&mut self, claim_key: PublicKey) {
        let id = String::from(&claim_key);
        let c = self.claims.get(&id).cloned().unwrap_or_else(|| env::panic_str("Claim not open"));
        require!(c.status == ClaimStatus::Open, "Claim not open");
        let caller = env::predecessor_account_id();
        require!(
            caller == c.from || self.operators.contains(&caller) || now() >= c.expiry,
            "Claim not expired"
        );
        self.claims.get_mut(&id).unwrap().status = ClaimStatus::Cancelled;
        self.total_claims -= c.amount.0;
        self.add_balance(&c.from, c.amount.0);
        self.total_balances += c.amount.0;
        emit("claim_cancelled", json!({ "claim_key": id, "by": caller, "amount": c.amount }));
    }

    // ---------------------------------------------------------------------
    // Payouts
    // ---------------------------------------------------------------------

    /// Pays an app all its unpaid earnings in USDT, always to its own payout account.
    /// Callable by that account, an operator or the owner. Works while paused and for inactive apps.
    /// If the token transfer fails, the callback puts the earnings back.
    pub fn payout(&mut self, app: String) -> Promise {
        let a = self.apps.get(&app).cloned().unwrap_or_else(|| env::panic_str("Unknown app"));
        let caller = env::predecessor_account_id();
        require!(
            caller == a.payout || self.operators.contains(&caller) || caller == self.owner,
            "Not authorized"
        );
        let amount = self.earnings.get(&app).copied().unwrap_or(0);
        require!(amount > 0, "Zero amount");
        self.earnings.insert(app.clone(), 0);
        self.total_earnings -= amount;
        ext_ft::ext(self.usdt.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(a.payout.clone(), U128(amount), Some(format!("kredo payout {app}")))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_payout(
                app,
                a.payout,
                U128(amount),
            ))
    }

    #[private]
    pub fn on_payout(
        &mut self,
        app: String,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> U128 {
        if result.is_ok() {
            emit("paid_out", json!({ "app": app, "to": to, "amount": amount }));
            amount
        } else {
            let earned = self.earnings.get(&app).copied().unwrap_or(0);
            self.earnings.insert(app.clone(), earned + amount.0);
            self.total_earnings += amount.0;
            emit("payout_failed", json!({ "app": app, "to": to, "amount": amount }));
            U128(0)
        }
    }

    /// Sends the collected network fees to the fee recipient.
    pub fn withdraw_fees(&mut self) -> Promise {
        self.only_owner();
        let amount = self.protocol_fees;
        require!(amount > 0, "Zero amount");
        self.protocol_fees = 0;
        let to = self.fee_recipient.clone();
        ext_ft::ext(self.usdt.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(to.clone(), U128(amount), Some("kredo fees".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_fees_withdrawn(to, U128(amount)))
    }

    #[private]
    pub fn on_fees_withdrawn(
        &mut self,
        to: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> U128 {
        if result.is_ok() {
            emit("fees_withdrawn", json!({ "to": to, "amount": amount }));
            amount
        } else {
            self.protocol_fees += amount.0;
            U128(0)
        }
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    pub fn config(&self) -> Config {
        Config {
            owner: self.owner.clone(),
            pending_owner: self.pending_owner.clone(),
            usdt: self.usdt.clone(),
            fee_recipient: self.fee_recipient.clone(),
            paused: self.paused,
        }
    }

    pub fn is_operator(&self, account: AccountId) -> bool {
        self.operators.contains(&account)
    }

    pub fn get_app(&self, app: String) -> Option<App> {
        self.apps.get(&app).cloned()
    }

    pub fn balance_of(&self, user: AccountId) -> U128 {
        U128(self.balances.get(&user).copied().unwrap_or(0))
    }

    pub fn limit_of(&self, user: AccountId, app: String) -> Limit {
        self.limits.get(&(user, app)).cloned().unwrap_or_else(Limit::empty)
    }

    pub fn earnings_of(&self, app: String) -> U128 {
        U128(self.earnings.get(&app).copied().unwrap_or(0))
    }

    pub fn spent_of(&self, user: AccountId, app: String) -> U128 {
        U128(self.spent.get(&(user, app)).copied().unwrap_or(0))
    }

    pub fn is_ref_used(&self, app: String, ref_id: String) -> bool {
        self.refs.contains(&(app, ref_id))
    }

    pub fn hold_id_of(&self, app: String, ref_id: String) -> String {
        derive_hold_id(&app, &ref_id)
    }

    pub fn get_hold(&self, hold_id: String) -> Option<Hold> {
        self.holds.get(&hold_id).cloned()
    }

    pub fn get_claim(&self, claim_key: PublicKey) -> Option<Claim> {
        self.claims.get(&String::from(&claim_key)).cloned()
    }

    /// The exact bytes a claim link's key signs to redeem it to `to`.
    pub fn claim_message(&self, claim_key: String, to: AccountId) -> String {
        format!("kredo-claim:{}:{}:{}", env::current_account_id(), claim_key, to)
    }

    /// Everything the vault owes, in USDT units. Compare `liabilities` with
    /// `usdt.ft_balance_of(vault)` to check backing.
    pub fn totals(&self) -> Totals {
        Totals {
            balances: U128(self.total_balances),
            held: U128(self.total_held),
            claims: U128(self.total_claims),
            earnings: U128(self.total_earnings),
            fees: U128(self.protocol_fees),
            liabilities: U128(self.liabilities()),
        }
    }
}

// -------------------------------------------------------------------------
// Storage (NEP-145)
// -------------------------------------------------------------------------

#[near]
impl StorageManagement for Vault {
    /// Registers `account_id` (default: the caller), or adds to its storage balance. Anyone can
    /// pay for anyone, which is how the Kredo relayer sets up users who never hold NEAR.
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let amount = env::attached_deposit().as_yoctonear();
        let account = account_id.unwrap_or_else(env::predecessor_account_id);
        let min = self.storage_min();
        let registration_only = registration_only.unwrap_or(false);
        let mut refund = 0;
        let deposit = match self.storage.get(&account).cloned() {
            Some(mut d) => {
                if registration_only {
                    refund = amount;
                } else {
                    d.total += amount;
                    d.available += amount;
                }
                d
            }
            None => {
                require!(amount >= min, "Below minimum storage deposit");
                let kept = if registration_only { min } else { amount };
                refund = amount - kept;
                if !self.balances.contains_key(&account) {
                    self.balances.insert(account.clone(), 0);
                }
                emit("storage_registered", json!({ "account": account, "by": env::predecessor_account_id() }));
                StorageDeposit { total: kept, available: kept - min }
            }
        };
        self.storage.insert(account, deposit.clone());
        if refund > 0 {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(refund)).detach();
        }
        to_storage_balance(&deposit)
    }

    #[payable]
    fn storage_withdraw(&mut self, _amount: Option<NearToken>) -> StorageBalance {
        env::panic_str("Not supported")
    }

    #[payable]
    fn storage_unregister(&mut self, _force: Option<bool>) -> bool {
        env::panic_str("Not supported")
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds { min: NearToken::from_yoctonear(self.storage_min()), max: None }
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.storage.get(&account_id).map(to_storage_balance)
    }
}

fn to_storage_balance(d: &StorageDeposit) -> StorageBalance {
    StorageBalance { total: NearToken::from_yoctonear(d.total), available: NearToken::from_yoctonear(d.available) }
}

// -------------------------------------------------------------------------
// Internal
// -------------------------------------------------------------------------

impl Vault {
    /// Starts measuring the state a call adds. Pair with `pay_storage`.
    fn storage_mark(&mut self) -> u64 {
        self.flush_all();
        env::storage_usage()
    }

    /// Takes the cost of the state added since `mark` from `payer`'s storage balance, so the
    /// vault's own NEAR never pays for it. State that shrinks is not refunded.
    fn pay_storage(&mut self, payer: &AccountId, mark: u64) {
        self.flush_all();
        let added = env::storage_usage().saturating_sub(mark);
        if added == 0 {
            return;
        }
        let cost = added as u128 * env::storage_byte_cost().as_yoctonear();
        let mut d = self.storage.get(payer).cloned().unwrap_or_else(|| env::panic_str("Not registered"));
        require!(d.available >= cost, "Insufficient storage");
        d.available -= cost;
        self.storage.insert(payer.clone(), d);
        self.storage.flush();
    }

    /// Writes buffered map entries now, so `env::storage_usage()` counts them.
    /// (`LookupSet` writes straight away.)
    fn flush_all(&mut self) {
        self.apps.flush();
        self.balances.flush();
        self.limits.flush();
        self.holds.flush();
        self.claims.flush();
        self.earnings.flush();
        self.spent.flush();
        self.storage.flush();
    }

    fn storage_min(&self) -> u128 {
        self.account_storage_bytes as u128 * env::storage_byte_cost().as_yoctonear()
    }

    /// Measures one registration with the longest possible account id, then removes it.
    fn measure_account_storage(&mut self) {
        let probe: AccountId = "a".repeat(64).parse().unwrap();
        let before = env::storage_usage();
        self.storage.insert(probe.clone(), StorageDeposit { total: u128::MAX, available: u128::MAX });
        self.balances.insert(probe.clone(), u128::MAX);
        self.storage.flush();
        self.balances.flush();
        self.account_storage_bytes = env::storage_usage() - before;
        self.storage.remove(&probe);
        self.balances.remove(&probe);
        self.storage.flush();
        self.balances.flush();
    }

    fn liabilities(&self) -> u128 {
        self.total_balances + self.total_held + self.total_claims + self.total_earnings + self.protocol_fees
    }

    fn only_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Not owner");
    }

    /// Charges are signed by the app itself. No Kredo key, operator or owner, can make one.
    fn only_app_signer(&self, app: &String) {
        let a = self.apps.get(app).unwrap_or_else(|| env::panic_str("Unknown app"));
        require!(env::predecessor_account_id() == a.signer, "Not app signer");
    }

    fn only_owner_or_operator(&self) {
        let caller = env::predecessor_account_id();
        require!(caller == self.owner || self.operators.contains(&caller), "Not owner or operator");
    }

    fn when_not_paused(&self) {
        require!(!self.paused, "Paused");
    }

    fn app_mut(&mut self, app: &String) -> &mut App {
        self.apps.get_mut(app).unwrap_or_else(|| env::panic_str("Unknown app"))
    }

    fn active_app(&self, app: &String) -> App {
        let a = self.apps.get(app).cloned().unwrap_or_else(|| env::panic_str("Unknown app"));
        require!(a.active, "App inactive");
        a
    }

    fn use_ref(&mut self, app: &str, ref_id: &str) {
        require!(!ref_id.is_empty() && ref_id.len() <= MAX_REF_LEN, "Bad ref");
        require!(self.refs.insert((app.to_string(), ref_id.to_string())), "Ref used");
    }

    /// Checks the app, its per-charge cap and the user's limit, then lowers the limit.
    fn consume_limit(&mut self, user: &AccountId, app: &String, amount: u128) {
        require!(amount > 0, "Zero amount");
        let a = self.active_app(app);
        require!(a.max_charge.0 == 0 || amount <= a.max_charge.0, "Over max charge");
        let l = self.limits.get_mut(&(user.clone(), app.clone())).unwrap_or_else(|| env::panic_str("Over limit"));
        require!(l.expiry == 0 || now() < l.expiry, "Limit expired");
        require!(amount <= l.remaining.0, "Over limit");
        l.remaining = U128(l.remaining.0 - amount);
    }

    /// Gives unused held credits back to the user, and back to the app's limit only if the user
    /// hasn't approved or revoked since the hold.
    fn return_to_user(&mut self, h: &Hold, amount: u128) {
        self.add_balance(&h.user, amount);
        self.total_balances += amount;
        if let Some(l) = self.limits.get_mut(&(h.user.clone(), h.app.clone())) {
            if l.version == h.limit_version {
                l.remaining = U128(l.remaining.0 + amount);
            }
        }
    }

    fn add_balance(&mut self, user: &AccountId, amount: u128) {
        let bal = self.balances.get(user).copied().unwrap_or(0);
        self.balances.insert(user.clone(), bal + amount);
    }

    fn debit(&mut self, user: &AccountId, amount: u128) {
        let bal = self.balances.get(user).copied().unwrap_or(0);
        require!(amount <= bal, "Insufficient balance");
        self.balances.insert(user.clone(), bal - amount);
    }

    /// Splits a captured amount between the app and the network fee. Returns the fee.
    fn earn(&mut self, user: &AccountId, app: &String, amount: u128) -> u128 {
        let key = (user.clone(), app.clone());
        let spent = self.spent.get(&key).copied().unwrap_or(0);
        self.spent.insert(key, spent + amount);
        let fee_bps = self.apps.get(app).map(|a| a.fee_bps).unwrap_or(0) as u128;
        let fee = amount * fee_bps / BPS;
        let net = amount - fee;
        let earned = self.earnings.get(app).copied().unwrap_or(0);
        self.earnings.insert(app.clone(), earned + net);
        self.total_earnings += net;
        self.protocol_fees += fee;
        fee
    }

    fn set_hold_status(&mut self, hold_id: &String, status: HoldStatus) {
        self.holds.get_mut(hold_id).unwrap().status = status;
    }
}

fn now() -> u64 {
    env::block_timestamp_ms() / 1000
}

/// Hold ids are derived from the app and its ref, so the app knows the id before the tx lands.
pub fn derive_hold_id(app: &str, ref_id: &str) -> String {
    let mut data = Vec::with_capacity(app.len() + ref_id.len() + 1);
    data.extend_from_slice(app.as_bytes());
    data.push(0);
    data.extend_from_slice(ref_id.as_bytes());
    to_hex(&env::sha256(&data))
}

fn verify_claim(key: &PublicKey, message: &str, signature: &[u8]) -> bool {
    let Ok(sig): Result<[u8; 64], _> = signature.try_into() else { return false };
    let Ok(pk): Result<[u8; 32], _> = key.as_bytes()[1..].try_into() else { return false };
    env::ed25519_verify(&sig, message.as_bytes(), &pk)
}

fn assert_id(id: &str, what: &str) {
    require!(
        !id.is_empty()
            && id.len() <= MAX_ID_LEN
            && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
        format!("Bad {what} id")
    );
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(HEX[(b >> 4) as usize] as char);
        s.push(HEX[(b & 0xf) as usize] as char);
    }
    s
}

/// NEP-297 event log, so indexers can follow every balance change.
fn emit(event: &str, data: Value) {
    let log = json!({ "standard": "kredo", "version": "1.0.0", "event": event, "data": [data] });
    env::log_str(&format!("EVENT_JSON:{log}"));
}
