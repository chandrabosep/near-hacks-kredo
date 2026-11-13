use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult, RuntimeFeesConfig};

const CREDIT: u128 = UNITS_PER_CREDIT;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn usdt() -> AccountId {
    acc("usdt.testnet")
}
fn owner() -> AccountId {
    acc("owner.testnet")
}
fn operator() -> AccountId {
    acc("relayer.testnet")
}
fn alice() -> AccountId {
    acc("alice.testnet")
}
fn bob() -> AccountId {
    acc("bob.testnet")
}
fn payout_acc() -> AccountId {
    acc("parley-payout.testnet")
}
const APP: &str = "parley";

/// Sets the caller and the block time (unix seconds).
fn ctx(caller: AccountId, at: u64) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("vault.testnet"))
        .predecessor_account_id(caller.clone())
        .signer_account_id(caller)
        .block_timestamp(at * 1_000_000_000);
    testing_env!(b.build());
}

const T0: u64 = 1_800_000_000;

fn setup() -> Vault {
    ctx(owner(), T0);
    let mut v = Vault::new(usdt(), owner(), Some(operator()), acc("fees.testnet"));
    ctx(operator(), T0);
    v.register_app(APP.into(), payout_acc(), 500, None);
    v
}

fn deposit(v: &mut Vault, user: &AccountId, amount: u128) {
    ctx(usdt(), T0);
    let r = v.ft_on_transfer(user.clone(), U128(amount), String::new());
    assert!(matches!(r, PromiseOrValue::Value(U128(0))));
}

fn approve(v: &mut Vault, user: &AccountId, limit: u128, expiry: Option<u64>) {
    ctx(user.clone(), T0);
    v.approve_app(APP.into(), U128(limit), expiry);
}

fn funded() -> Vault {
    let mut v = setup();
    deposit(&mut v, &alice(), 100 * CREDIT);
    approve(&mut v, &alice(), 50 * CREDIT, None);
    v
}

/// Liabilities must always equal what came in minus what was paid out.
fn assert_backed(v: &Vault, usdt_held: u128) {
    assert_eq!(v.totals().liabilities.0, usdt_held);
}

// --- deposits -------------------------------------------------------------

#[test]
fn deposit_credits_sender() {
    let mut v = setup();
    deposit(&mut v, &alice(), 5 * CREDIT);
    assert_eq!(v.balance_of(alice()).0, 5 * CREDIT);
    assert_backed(&v, 5 * CREDIT);
    assert!(get_logs().iter().any(|l| l.contains("\"event\":\"deposited\"")));
}

#[test]
fn deposit_for_someone_else() {
    let mut v = setup();
    ctx(usdt(), T0);
    let _ = v.ft_on_transfer(bob(), U128(2 * CREDIT), r#"{"user":"alice.testnet"}"#.into());
    assert_eq!(v.balance_of(alice()).0, 2 * CREDIT);
    assert_eq!(v.balance_of(bob()).0, 0);
}

#[test]
#[should_panic(expected = "Only USDT")]
fn deposit_rejects_other_tokens() {
    let mut v = setup();
    ctx(acc("fake.testnet"), T0);
    let _ = v.ft_on_transfer(alice(), U128(CREDIT), String::new());
}

#[test]
#[should_panic(expected = "Below minimum deposit")]
fn deposit_rejects_dust() {
    let mut v = setup();
    ctx(usdt(), T0);
    let _ = v.ft_on_transfer(alice(), U128(CREDIT - 1), String::new());
}

#[test]
fn paused_vault_refunds_deposits() {
    let mut v = setup();
    ctx(operator(), T0);
    v.pause();
    ctx(usdt(), T0);
    let r = v.ft_on_transfer(alice(), U128(CREDIT), String::new());
    assert!(matches!(r, PromiseOrValue::Value(U128(n)) if n == CREDIT));
    assert_eq!(v.balance_of(alice()).0, 0);
}

// --- limits and charges ---------------------------------------------------

#[test]
fn charge_splits_fee_and_lowers_limit() {
    let mut v = funded();
    ctx(operator(), T0);
    let fee = v.charge(alice(), APP.into(), U128(10 * CREDIT), "msg-1".into());
    assert_eq!(fee.0, 10 * CREDIT * 500 / 10_000);
    assert_eq!(v.balance_of(alice()).0, 90 * CREDIT);
    assert_eq!(v.limit_of(alice(), APP.into()).remaining.0, 40 * CREDIT);
    assert_eq!(v.earnings_of(APP.into()).0, 10 * CREDIT - fee.0);
    assert_eq!(v.spent_of(alice(), APP.into()).0, 10 * CREDIT);
    assert!(v.is_ref_used(APP.into(), "msg-1".into()));
    assert_backed(&v, 100 * CREDIT);
}

#[test]
#[should_panic(expected = "Over limit")]
fn charge_above_limit_fails() {
    let mut v = funded();
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(51 * CREDIT), "big".into());
}

#[test]
#[should_panic(expected = "Over limit")]
fn charge_without_approval_fails() {
    let mut v = setup();
    deposit(&mut v, &alice(), 10 * CREDIT);
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(CREDIT), "x".into());
}

#[test]
#[should_panic(expected = "Ref used")]
fn charge_ref_is_single_use() {
    let mut v = funded();
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(CREDIT), "same".into());
    v.charge(alice(), APP.into(), U128(CREDIT), "same".into());
}

#[test]
#[should_panic(expected = "Not operator")]
fn only_operator_charges() {
    let mut v = funded();
    ctx(payout_acc(), T0);
    v.charge(alice(), APP.into(), U128(CREDIT), "x".into());
}

#[test]
#[should_panic(expected = "Limit expired")]
fn expired_limit_fails() {
    let mut v = setup();
    deposit(&mut v, &alice(), 10 * CREDIT);
    approve(&mut v, &alice(), 10 * CREDIT, Some(T0 + 60));
    ctx(operator(), T0 + 60);
    v.charge(alice(), APP.into(), U128(CREDIT), "x".into());
}

#[test]
#[should_panic(expected = "Over limit")]
fn revoke_stops_charges() {
    let mut v = funded();
    ctx(alice(), T0);
    v.revoke_app(APP.into());
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(CREDIT), "x".into());
}

#[test]
fn revoke_works_while_paused() {
    let mut v = funded();
    ctx(owner(), T0);
    v.pause();
    ctx(alice(), T0);
    v.revoke_app(APP.into());
    assert_eq!(v.limit_of(alice(), APP.into()).remaining.0, 0);
}

#[test]
#[should_panic(expected = "Over max charge")]
fn max_charge_caps_single_charge() {
    let mut v = funded();
    ctx(owner(), T0);
    v.set_app_terms(APP.into(), 500, U128(5 * CREDIT));
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(6 * CREDIT), "x".into());
}

#[test]
#[should_panic(expected = "App inactive")]
fn inactive_app_cannot_charge() {
    let mut v = funded();
    ctx(operator(), T0);
    v.set_app_active(APP.into(), false);
    v.charge(alice(), APP.into(), U128(CREDIT), "x".into());
}

#[test]
#[should_panic(expected = "Not owner")]
fn operator_cannot_raise_fee() {
    let mut v = setup();
    ctx(operator(), T0);
    v.set_app_terms(APP.into(), 2_000, U128(0));
}

#[test]
#[should_panic(expected = "Fee too high")]
fn fee_is_capped() {
    let mut v = setup();
    ctx(operator(), T0);
    v.register_app("other".into(), payout_acc(), MAX_FEE_BPS + 1, None);
}

#[test]
#[should_panic(expected = "Bad app id")]
fn app_id_is_validated() {
    let mut v = setup();
    ctx(operator(), T0);
    v.register_app("has space".into(), payout_acc(), 0, None);
}

// --- holds ----------------------------------------------------------------

#[test]
fn hold_then_capture_returns_the_rest() {
    let mut v = funded();
    ctx(operator(), T0);
    let id = v.hold(alice(), APP.into(), U128(20 * CREDIT), "job-1".into(), T0 + 600);
    assert_eq!(id, v.hold_id_of(APP.into(), "job-1".into()));
    assert_eq!(v.balance_of(alice()).0, 80 * CREDIT);
    assert_eq!(v.totals().held.0, 20 * CREDIT);

    v.capture(id.clone(), U128(12 * CREDIT));
    assert_eq!(v.balance_of(alice()).0, 88 * CREDIT);
    assert_eq!(v.limit_of(alice(), APP.into()).remaining.0, 38 * CREDIT);
    assert_eq!(v.get_hold(id).unwrap().status, HoldStatus::Captured);
    assert_eq!(v.totals().held.0, 0);
    assert_backed(&v, 100 * CREDIT);
}

#[test]
fn anyone_releases_after_expiry() {
    let mut v = funded();
    ctx(operator(), T0);
    let id = v.hold(alice(), APP.into(), U128(20 * CREDIT), "job".into(), T0 + 600);
    ctx(owner(), T0);
    v.pause();
    ctx(bob(), T0 + 600);
    v.release(id.clone());
    assert_eq!(v.balance_of(alice()).0, 100 * CREDIT);
    assert_eq!(v.limit_of(alice(), APP.into()).remaining.0, 50 * CREDIT);
    assert_eq!(v.get_hold(id).unwrap().status, HoldStatus::Released);
}

#[test]
#[should_panic(expected = "Hold not expired")]
fn stranger_cannot_release_early() {
    let mut v = funded();
    ctx(operator(), T0);
    let id = v.hold(alice(), APP.into(), U128(CREDIT), "job".into(), T0 + 600);
    ctx(bob(), T0 + 599);
    v.release(id);
}

#[test]
#[should_panic(expected = "Hold expired")]
fn capture_after_expiry_fails() {
    let mut v = funded();
    ctx(operator(), T0);
    let id = v.hold(alice(), APP.into(), U128(CREDIT), "job".into(), T0 + 600);
    ctx(operator(), T0 + 600);
    v.capture(id, U128(CREDIT));
}

#[test]
#[should_panic(expected = "Bad expiry")]
fn hold_longer_than_a_day_fails() {
    let mut v = funded();
    ctx(operator(), T0);
    v.hold(alice(), APP.into(), U128(CREDIT), "job".into(), T0 + MAX_HOLD_SECONDS + 1);
}

#[test]
fn release_after_revoke_does_not_restore_limit() {
    let mut v = funded();
    ctx(operator(), T0);
    let id = v.hold(alice(), APP.into(), U128(20 * CREDIT), "job".into(), T0 + 600);
    ctx(alice(), T0);
    v.revoke_app(APP.into());
    ctx(operator(), T0);
    v.release(id);
    assert_eq!(v.balance_of(alice()).0, 100 * CREDIT);
    assert_eq!(v.limit_of(alice(), APP.into()).remaining.0, 0);
}

// --- refunds --------------------------------------------------------------

#[test]
fn refund_moves_earnings_back_to_user() {
    let mut v = funded();
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(10 * CREDIT), "c".into());
    let earned = v.earnings_of(APP.into()).0;
    v.refund(APP.into(), alice(), U128(5 * CREDIT), "r".into());
    assert_eq!(v.balance_of(alice()).0, 95 * CREDIT);
    assert_eq!(v.earnings_of(APP.into()).0, earned - 5 * CREDIT);
    assert_backed(&v, 100 * CREDIT);
}

#[test]
#[should_panic(expected = "Over spent")]
fn refund_capped_at_spent() {
    let mut v = funded();
    deposit(&mut v, &bob(), 10 * CREDIT);
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(10 * CREDIT), "c".into());
    v.refund(APP.into(), bob(), U128(CREDIT), "r".into());
}

// --- send and claims ------------------------------------------------------

#[test]
fn send_moves_credits() {
    let mut v = funded();
    ctx(alice(), T0);
    v.send(bob(), U128(30 * CREDIT));
    assert_eq!(v.balance_of(alice()).0, 70 * CREDIT);
    assert_eq!(v.balance_of(bob()).0, 30 * CREDIT);
    assert_backed(&v, 100 * CREDIT);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn send_more_than_balance_fails() {
    let mut v = funded();
    ctx(alice(), T0);
    v.send(bob(), U128(101 * CREDIT));
}

fn claim_key() -> (SigningKey, PublicKey) {
    let sk = SigningKey::from_bytes(&[7u8; 32]);
    let mut bytes = vec![0u8];
    bytes.extend_from_slice(sk.verifying_key().as_bytes());
    (sk, PublicKey::try_from(bytes).unwrap())
}

fn sign_claim(v: &Vault, sk: &SigningKey, pk: &PublicKey, to: &AccountId) -> Base64VecU8 {
    let msg = v.claim_message(String::from(pk), to.clone());
    Base64VecU8(sk.sign(msg.as_bytes()).to_bytes().to_vec())
}

#[test]
fn claim_link_round_trip() {
    let mut v = funded();
    let (sk, pk) = claim_key();
    ctx(alice(), T0);
    v.create_claim(U128(25 * CREDIT), pk.clone(), T0 + 3600);
    assert_eq!(v.balance_of(alice()).0, 75 * CREDIT);
    assert_eq!(v.totals().claims.0, 25 * CREDIT);
    assert_backed(&v, 100 * CREDIT);

    let sig = sign_claim(&v, &sk, &pk, &bob());
    ctx(operator(), T0 + 10);
    v.claim(pk.clone(), bob(), sig);
    assert_eq!(v.balance_of(bob()).0, 25 * CREDIT);
    assert_eq!(v.get_claim(pk).unwrap().status, ClaimStatus::Claimed);
    assert_backed(&v, 100 * CREDIT);
}

#[test]
#[should_panic(expected = "Bad signature")]
fn claim_cannot_be_redirected() {
    let mut v = funded();
    let (sk, pk) = claim_key();
    ctx(alice(), T0);
    v.create_claim(U128(CREDIT), pk.clone(), T0 + 3600);
    let sig = sign_claim(&v, &sk, &pk, &bob());
    ctx(acc("thief.testnet"), T0);
    v.claim(pk, acc("thief.testnet"), sig);
}

#[test]
#[should_panic(expected = "Claim not open")]
fn claim_is_single_use() {
    let mut v = funded();
    let (sk, pk) = claim_key();
    ctx(alice(), T0);
    v.create_claim(U128(CREDIT), pk.clone(), T0 + 3600);
    let sig = sign_claim(&v, &sk, &pk, &bob());
    v.claim(pk.clone(), bob(), sig.clone());
    v.claim(pk, bob(), sig);
}

#[test]
fn creator_cancels_claim() {
    let mut v = funded();
    let (_, pk) = claim_key();
    ctx(alice(), T0);
    v.create_claim(U128(10 * CREDIT), pk.clone(), T0 + 3600);
    v.cancel_claim(pk.clone());
    assert_eq!(v.balance_of(alice()).0, 100 * CREDIT);
    assert_eq!(v.get_claim(pk).unwrap().status, ClaimStatus::Cancelled);
}

#[test]
#[should_panic(expected = "Claim not expired")]
fn stranger_cannot_cancel_early() {
    let mut v = funded();
    let (_, pk) = claim_key();
    ctx(alice(), T0);
    v.create_claim(U128(CREDIT), pk.clone(), T0 + 3600);
    ctx(bob(), T0 + 10);
    v.cancel_claim(pk);
}

// --- payouts --------------------------------------------------------------

fn with_promise_result(caller: AccountId, result: PromiseResult) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("vault.testnet"))
        .predecessor_account_id(caller.clone())
        .signer_account_id(caller)
        .block_timestamp(T0 * 1_000_000_000);
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

#[test]
fn payout_zeroes_earnings_and_failed_transfer_restores_them() {
    let mut v = funded();
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(10 * CREDIT), "c".into());
    let earned = v.earnings_of(APP.into()).0;

    ctx(payout_acc(), T0);
    let _ = v.payout(APP.into());
    assert_eq!(v.earnings_of(APP.into()).0, 0);
    assert_backed(&v, 100 * CREDIT - earned);

    with_promise_result(acc("vault.testnet"), PromiseResult::Failed);
    let paid = v.on_payout(APP.into(), payout_acc(), U128(earned), Err(PromiseError::Failed));
    assert_eq!(paid.0, 0);
    assert_eq!(v.earnings_of(APP.into()).0, earned);
    assert_backed(&v, 100 * CREDIT);
}

#[test]
#[should_panic(expected = "Not authorized")]
fn stranger_cannot_trigger_payout() {
    let mut v = funded();
    ctx(operator(), T0);
    v.charge(alice(), APP.into(), U128(CREDIT), "c".into());
    ctx(bob(), T0);
    let _ = v.payout(APP.into());
}

#[test]
#[should_panic(expected = "Not authorized")]
fn operator_cannot_redirect_payout() {
    let mut v = setup();
    ctx(operator(), T0);
    v.set_app_payout(APP.into(), acc("attacker.testnet"));
}

// --- ownership ------------------------------------------------------------

#[test]
fn ownership_is_two_step() {
    let mut v = setup();
    ctx(owner(), T0);
    v.propose_owner(bob());
    assert_eq!(v.config().owner, owner());
    ctx(bob(), T0);
    v.accept_owner();
    assert_eq!(v.config().owner, bob());
}
