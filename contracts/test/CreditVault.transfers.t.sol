// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultTransfersTest is VaultTestBase {
    uint256 alicePk = 0xA11CE;
    address alice;
    address bob = makeAddr("bob");
    address relayer = makeAddr("relayer");
    address attacker = makeAddr("attacker");

    uint256 claimKeyPk = 0xC1A1;
    address claimKey;

    uint256 constant FUNDS = 1_000 * CREDIT;
    uint256 constant GIFT = 100 * CREDIT;
    bytes32 constant NONCE = keccak256("n-1");

    function setUp() public override {
        super.setUp();
        alice = vm.addr(alicePk);
        claimKey = vm.addr(claimKeyPk);
        usdt.mint(alice, FUNDS);
        vm.startPrank(alice);
        usdt.approve(address(vault), FUNDS);
        vault.deposit(alice, FUNDS);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- send

    function test_send_direct() public {
        vm.expectEmit(address(vault));
        emit CreditVault.Sent(alice, bob, GIFT);
        vm.prank(alice);
        vault.send(alice, bob, GIFT, NONCE, 0, "");

        assertEq(vault.balanceOf(alice), FUNDS - GIFT);
        assertEq(vault.balanceOf(bob), GIFT);
        assertEq(vault.totalBalances(), FUNDS);
        assertBacked();
    }

    function test_send_signedAndRelayed() public {
        bytes memory sig = _signSend(alicePk, bob, GIFT, NONCE, _deadline());
        vm.prank(relayer);
        vault.send(alice, bob, GIFT, NONCE, _deadline(), sig);

        assertEq(vault.balanceOf(bob), GIFT);
        assertTrue(vault.nonceUsed(alice, NONCE));
        assertBacked();
    }

    function test_send_revertsOnReplay() public {
        bytes memory sig = _signSend(alicePk, bob, GIFT, NONCE, _deadline());
        vm.startPrank(relayer);
        vault.send(alice, bob, GIFT, NONCE, _deadline(), sig);
        vm.expectRevert(CreditVault.NonceUsed.selector);
        vault.send(alice, bob, GIFT, NONCE, _deadline(), sig);
        vm.stopPrank();
    }

    /// The relayer can't change who gets the credits, or how many.
    function test_send_revertsOnTamperedRecipientOrAmount() public {
        bytes memory sig = _signSend(alicePk, bob, GIFT, NONCE, _deadline());
        vm.startPrank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.send(alice, attacker, GIFT, NONCE, _deadline(), sig);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.send(alice, bob, GIFT * 2, NONCE, _deadline(), sig);
        vm.stopPrank();
    }

    function test_send_revertsWithoutSignature() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.send(alice, operator, GIFT, NONCE, _deadline(), "");
    }

    function test_send_revertsAfterDeadline() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signSend(alicePk, bob, GIFT, NONCE, deadline);
        vm.warp(deadline + 1);
        vm.prank(relayer);
        vm.expectRevert(CreditVault.SignatureExpired.selector);
        vault.send(alice, bob, GIFT, NONCE, deadline, sig);
    }

    function test_send_revertsOnInsufficientBalance() public {
        vm.prank(alice);
        vm.expectRevert(CreditVault.InsufficientBalance.selector);
        vault.send(alice, bob, FUNDS + 1, NONCE, 0, "");
    }

    function test_send_revertsOnZeroAmountOrRecipient() public {
        vm.startPrank(alice);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.send(alice, bob, 0, NONCE, 0, "");
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.send(alice, address(0), GIFT, NONCE, 0, "");
        vm.stopPrank();
    }

    function test_send_revertsWhenPaused() public {
        vm.prank(operator);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.send(alice, bob, GIFT, NONCE, 0, "");
    }

    // ---------------------------------------------------------------- create claim

    function test_createClaim_direct() public {
        uint64 expiry = _claimExpiry();
        vm.expectEmit(address(vault));
        emit CreditVault.ClaimCreated(claimKey, alice, GIFT, expiry);
        vm.prank(alice);
        vault.createClaim(alice, GIFT, claimKey, expiry, NONCE, 0, "");

        CreditVault.Claim memory c = vault.getClaim(claimKey);
        assertEq(c.from, alice);
        assertEq(c.amount, GIFT);
        assertEq(c.expiry, expiry);
        assertEq(uint8(c.status), uint8(CreditVault.ClaimStatus.Open));
        assertEq(vault.balanceOf(alice), FUNDS - GIFT);
        assertEq(vault.totalClaims(), GIFT);
        assertBacked();
    }

    function test_createClaim_signedAndRelayed() public {
        bytes memory sig = _signCreateClaim(alicePk, GIFT, claimKey, _claimExpiry(), NONCE, _deadline());
        vm.prank(relayer);
        vault.createClaim(alice, GIFT, claimKey, _claimExpiry(), NONCE, _deadline(), sig);
        assertEq(vault.totalClaims(), GIFT);
        assertBacked();
    }

    function test_createClaim_revertsOnTamperedAmount() public {
        bytes memory sig = _signCreateClaim(alicePk, GIFT, claimKey, _claimExpiry(), NONCE, _deadline());
        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.createClaim(alice, FUNDS, claimKey, _claimExpiry(), NONCE, _deadline(), sig);
    }

    function test_createClaim_revertsOnReusedKey() public {
        _createClaim();
        vm.prank(alice);
        vm.expectRevert(CreditVault.ClaimExists.selector);
        vault.createClaim(alice, GIFT, claimKey, _claimExpiry(), NONCE, 0, "");
    }

    function test_createClaim_revertsOnBadInput() public {
        vm.startPrank(alice);
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.createClaim(alice, GIFT, address(0), _claimExpiry(), NONCE, 0, "");
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.createClaim(alice, 0, claimKey, _claimExpiry(), NONCE, 0, "");
        vm.expectRevert(CreditVault.BadExpiry.selector);
        vault.createClaim(alice, GIFT, claimKey, uint64(block.timestamp), NONCE, 0, "");
        vm.expectRevert(CreditVault.InsufficientBalance.selector);
        vault.createClaim(alice, FUNDS + 1, claimKey, _claimExpiry(), NONCE, 0, "");
        vm.stopPrank();
    }

    function test_createClaim_revertsWhenPaused() public {
        vm.prank(operator);
        vault.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.createClaim(alice, GIFT, claimKey, _claimExpiry(), NONCE, 0, "");
    }

    // ---------------------------------------------------------------- redeem

    function test_claim() public {
        _createClaim();
        bytes memory keySig = _signRedeem(claimKeyPk, claimKey, bob);

        vm.expectEmit(address(vault));
        emit CreditVault.Claimed(claimKey, bob, GIFT);
        vm.prank(relayer);
        vault.claim(claimKey, bob, keySig);

        assertEq(vault.balanceOf(bob), GIFT);
        assertEq(vault.totalClaims(), 0);
        assertEq(uint8(vault.getClaim(claimKey).status), uint8(CreditVault.ClaimStatus.Claimed));
        assertBacked();
    }

    /// Someone copies the claim tx from the mempool and swaps in their own address.
    function test_claim_frontRunnerCannotRedirect() public {
        _createClaim();
        bytes memory keySig = _signRedeem(claimKeyPk, claimKey, bob);

        vm.prank(attacker);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.claim(claimKey, attacker, keySig);

        vm.prank(relayer);
        vault.claim(claimKey, bob, keySig);
        assertEq(vault.balanceOf(bob), GIFT);
        assertEq(vault.balanceOf(attacker), 0);
    }

    function test_claim_revertsWithWrongKey() public {
        _createClaim();
        bytes memory keySig = _signRedeem(0xBAD, claimKey, bob);
        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.claim(claimKey, bob, keySig);
    }

    function test_claim_revertsOnGarbageSignature() public {
        _createClaim();
        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.claim(claimKey, bob, hex"1234");
    }

    function test_claim_revertsTwice() public {
        _createClaim();
        bytes memory keySig = _signRedeem(claimKeyPk, claimKey, bob);
        vm.startPrank(relayer);
        vault.claim(claimKey, bob, keySig);
        vm.expectRevert(CreditVault.ClaimNotOpen.selector);
        vault.claim(claimKey, bob, keySig);
        vm.stopPrank();
    }

    function test_claim_revertsAfterExpiry() public {
        _createClaim();
        bytes memory keySig = _signRedeem(claimKeyPk, claimKey, bob);
        vm.warp(_claimExpiry());
        vm.prank(relayer);
        vm.expectRevert(CreditVault.ClaimExpired.selector);
        vault.claim(claimKey, bob, keySig);
    }

    function test_claim_revertsWhenPaused() public {
        _createClaim();
        bytes memory keySig = _signRedeem(claimKeyPk, claimKey, bob);
        vm.prank(operator);
        vault.pause();
        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.claim(claimKey, bob, keySig);
    }

    // ---------------------------------------------------------------- cancel

    function test_cancelClaim_byCreator() public {
        _createClaim();
        vm.expectEmit(address(vault));
        emit CreditVault.ClaimCancelled(claimKey, alice, GIFT);
        vm.prank(alice);
        vault.cancelClaim(claimKey);

        assertEq(vault.balanceOf(alice), FUNDS);
        assertEq(vault.totalClaims(), 0);
        assertEq(uint8(vault.getClaim(claimKey).status), uint8(CreditVault.ClaimStatus.Cancelled));
        assertBacked();
    }

    function test_cancelClaim_byOperatorReturnsToCreator() public {
        _createClaim();
        vm.prank(operator);
        vault.cancelClaim(claimKey);
        assertEq(vault.balanceOf(alice), FUNDS);
        assertEq(vault.balanceOf(operator), 0);
    }

    function test_cancelClaim_byStrangerBeforeExpiryReverts() public {
        _createClaim();
        vm.prank(stranger);
        vm.expectRevert(CreditVault.ClaimNotExpired.selector);
        vault.cancelClaim(claimKey);
    }

    function test_cancelClaim_byAnyoneAfterExpiryEvenWhenPaused() public {
        _createClaim();
        vm.prank(operator);
        vault.pause();
        vm.warp(_claimExpiry());

        vm.prank(stranger);
        vault.cancelClaim(claimKey);
        assertEq(vault.balanceOf(alice), FUNDS);
        assertBacked();
    }

    function test_cancelClaim_revertsAfterClaim() public {
        _createClaim();
        bytes memory keySig = _signRedeem(claimKeyPk, claimKey, bob);
        vm.prank(relayer);
        vault.claim(claimKey, bob, keySig);

        vm.prank(alice);
        vm.expectRevert(CreditVault.ClaimNotOpen.selector);
        vault.cancelClaim(claimKey);
    }

    // ---------------------------------------------------------------- helpers

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _claimExpiry() internal view returns (uint64) {
        return uint64(block.timestamp + 7 days);
    }

    function _createClaim() internal {
        vm.prank(alice);
        vault.createClaim(alice, GIFT, claimKey, _claimExpiry(), NONCE, 0, "");
    }

    function _signSend(uint256 pk, address to, uint256 amount, bytes32 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return signVault(pk, keccak256(abi.encode(vault.SEND_TYPEHASH(), vm.addr(pk), to, amount, nonce, deadline)));
    }

    function _signCreateClaim(uint256 pk, uint256 amount, address key, uint64 expiry, bytes32 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        return signVault(
            pk, keccak256(abi.encode(vault.CREATE_CLAIM_TYPEHASH(), vm.addr(pk), amount, key, expiry, nonce, deadline))
        );
    }

    function _signRedeem(uint256 keyPk, address key, address to) internal view returns (bytes memory) {
        return signVault(keyPk, keccak256(abi.encode(vault.REDEEM_CLAIM_TYPEHASH(), key, to)));
    }
}
