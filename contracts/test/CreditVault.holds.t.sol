// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultHoldsTest is VaultTestBase {
    address alice = makeAddr("alice");

    uint256 constant FUNDS = 1_000 * CREDIT;
    uint256 constant LIMIT = 200 * CREDIT;
    uint256 constant HOLD = 80 * CREDIT; // 10-second video, reserved up front
    bytes32 constant REF = "video-job-1";

    function setUp() public override {
        super.setUp();
        registerVideoApp();
        fundAndConnect(alice, FUNDS, videoApp, LIMIT);
    }

    // ---------------------------------------------------------------- hold

    function test_hold() public {
        bytes32 expectedId = keccak256(abi.encode(videoApp, REF));
        uint64 expiry = _expiry();

        vm.expectEmit(address(vault));
        emit CreditVault.Held(expectedId, alice, videoApp, REF, HOLD, expiry);
        bytes32 id = _hold(HOLD);

        assertEq(id, expectedId);
        assertEq(vault.holdIdOf(videoApp, REF), expectedId);
        CreditVault.Hold memory h = vault.getHold(id);
        assertEq(h.user, alice);
        assertEq(h.app, videoApp);
        assertEq(h.amount, HOLD);
        assertEq(h.expiry, expiry);
        assertEq(uint8(h.status), uint8(CreditVault.HoldStatus.Open));

        assertEq(vault.balanceOf(alice), FUNDS - HOLD);
        assertEq(vault.totalHeld(), HOLD);
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT - HOLD);
        assertBacked();
    }

    function test_hold_overLimitRevertsEvenFromOperator() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.OverLimit.selector);
        vault.hold(alice, videoApp, LIMIT + 1, REF, _expiry());
    }

    function test_hold_onlyOperator() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.NotOperator.selector);
        vault.hold(alice, videoApp, HOLD, REF, _expiry());
    }

    function test_hold_revertsOnPastOrTooLongExpiry() public {
        uint64 maxDuration = vault.MAX_HOLD_DURATION();
        vm.startPrank(operator);
        vm.expectRevert(CreditVault.BadExpiry.selector);
        vault.hold(alice, videoApp, HOLD, REF, uint64(block.timestamp));

        vm.expectRevert(CreditVault.BadExpiry.selector);
        vault.hold(alice, videoApp, HOLD, REF, uint64(block.timestamp) + maxDuration + 1);

        vault.hold(alice, videoApp, HOLD, REF, uint64(block.timestamp) + maxDuration);
        vm.stopPrank();
    }

    /// Holds and charges share one ref space per app, so a job can't be both.
    function test_hold_revertsOnRefUsedByCharge() public {
        vm.startPrank(operator);
        vault.charge(alice, videoApp, 10 * CREDIT, REF);
        vm.expectRevert(CreditVault.RefUsed.selector);
        vault.hold(alice, videoApp, HOLD, REF, _expiry());
        vm.stopPrank();
    }

    function test_hold_revertsWhenPaused() public {
        vm.prank(operator);
        vault.pause();
        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.hold(alice, videoApp, HOLD, REF, _expiry());
    }

    // ---------------------------------------------------------------- capture

    function test_capture_full() public {
        bytes32 id = _hold(HOLD);
        uint256 fee = (HOLD * FEE_BPS) / 10_000;

        vm.expectEmit(address(vault));
        emit CreditVault.Captured(id, HOLD, fee, 0);
        vm.prank(operator);
        vault.capture(id, HOLD);

        assertEq(uint8(vault.getHold(id).status), uint8(CreditVault.HoldStatus.Captured));
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.balanceOf(alice), FUNDS - HOLD);
        assertEq(vault.earningsOf(videoApp), HOLD - fee);
        assertEq(vault.protocolFees(), fee);
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT - HOLD);
        assertBacked();
    }

    /// The job used less than it reserved: the rest goes back to the balance and the limit.
    function test_capture_partialReturnsUnusedToBalanceAndLimit() public {
        bytes32 id = _hold(HOLD);
        uint256 actual = 50 * CREDIT;

        vm.prank(operator);
        vault.capture(id, actual);

        assertEq(vault.balanceOf(alice), FUNDS - actual);
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT - actual);
        assertEq(vault.earningsOf(videoApp) + vault.protocolFees(), actual);
        assertEq(vault.totalHeld(), 0);
        assertBacked();
    }

    function test_capture_revertsAboveHeld() public {
        bytes32 id = _hold(HOLD);
        vm.prank(operator);
        vm.expectRevert(CreditVault.OverHeld.selector);
        vault.capture(id, HOLD + 1);
    }

    function test_capture_revertsOnZero() public {
        bytes32 id = _hold(HOLD);
        vm.prank(operator);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.capture(id, 0);
    }

    function test_capture_revertsAfterExpiry() public {
        bytes32 id = _hold(HOLD);
        vm.warp(_expiry());
        vm.prank(operator);
        vm.expectRevert(CreditVault.HoldExpired.selector);
        vault.capture(id, HOLD);
    }

    function test_capture_revertsTwice() public {
        bytes32 id = _hold(HOLD);
        vm.startPrank(operator);
        vault.capture(id, HOLD);
        vm.expectRevert(CreditVault.HoldNotOpen.selector);
        vault.capture(id, HOLD);
        vm.stopPrank();
    }

    function test_capture_revertsAfterRelease() public {
        bytes32 id = _hold(HOLD);
        vm.startPrank(operator);
        vault.release(id);
        vm.expectRevert(CreditVault.HoldNotOpen.selector);
        vault.capture(id, HOLD);
        vm.stopPrank();
    }

    function test_capture_revertsForUnknownHold() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.HoldNotOpen.selector);
        vault.capture(keccak256("nope"), 1);
    }

    function test_capture_onlyOperator() public {
        bytes32 id = _hold(HOLD);
        vm.prank(videoPayout);
        vm.expectRevert(CreditVault.NotOperator.selector);
        vault.capture(id, HOLD);
    }

    // ---------------------------------------------------------------- release

    function test_release_byOperatorBeforeExpiry() public {
        bytes32 id = _hold(HOLD);

        vm.expectEmit(address(vault));
        emit CreditVault.Released(id, HOLD, operator);
        vm.prank(operator);
        vault.release(id);

        assertEq(uint8(vault.getHold(id).status), uint8(CreditVault.HoldStatus.Released));
        assertEq(vault.balanceOf(alice), FUNDS);
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT);
        assertEq(vault.totalHeld(), 0);
        assertEq(vault.earningsOf(videoApp), 0);
        assertBacked();
    }

    function test_release_byStrangerBeforeExpiryReverts() public {
        bytes32 id = _hold(HOLD);
        vm.prank(stranger);
        vm.expectRevert(CreditVault.HoldNotExpired.selector);
        vault.release(id);
    }

    /// The company or our backend disappears: anyone can return the credits after expiry.
    function test_release_byAnyoneAfterExpiry() public {
        bytes32 id = _hold(HOLD);
        vm.warp(_expiry());

        vm.prank(stranger);
        vault.release(id);
        assertEq(vault.balanceOf(alice), FUNDS);
        assertBacked();
    }

    function test_release_afterExpiryWorksWhenPausedAndAppInactive() public {
        bytes32 id = _hold(HOLD);
        vm.startPrank(operator);
        vault.setAppActive(videoApp, false);
        vault.pause();
        vm.stopPrank();
        vm.warp(_expiry());

        vm.prank(alice);
        vault.release(id);
        assertEq(vault.balanceOf(alice), FUNDS);
        assertBacked();
    }

    function test_release_byOperatorWorksWhenPaused() public {
        bytes32 id = _hold(HOLD);
        vm.prank(owner);
        vault.pause();

        vm.prank(operator);
        vault.release(id);
        assertEq(vault.balanceOf(alice), FUNDS);
    }

    function test_release_revertsTwiceAndAfterCapture() public {
        bytes32 id = _hold(HOLD);
        vm.startPrank(operator);
        vault.release(id);
        vm.expectRevert(CreditVault.HoldNotOpen.selector);
        vault.release(id);
        vm.stopPrank();

        bytes32 id2 = _holdRef(HOLD, "video-job-2");
        vm.prank(operator);
        vault.capture(id2, HOLD);
        vm.warp(_expiry());
        vm.prank(stranger);
        vm.expectRevert(CreditVault.HoldNotOpen.selector);
        vault.release(id2);
    }

    // ---------------------------------------------------------------- limit versions

    /// Revoked mid-job: the credits come back, but the revoked app gets no limit back.
    function test_release_afterRevokeDoesNotRestoreLimit() public {
        bytes32 id = _hold(HOLD);
        vm.prank(alice);
        vault.revokeApp(alice, videoApp, keccak256("revoke"), 0, "");

        vm.prank(operator);
        vault.release(id);

        assertEq(vault.balanceOf(alice), FUNDS);
        assertEq(vault.limitOf(alice, videoApp).remaining, 0);

        vm.prank(operator);
        vm.expectRevert(CreditVault.OverLimit.selector);
        vault.charge(alice, videoApp, 1, "after-revoke");
        assertBacked();
    }

    /// Re-approved with a smaller limit mid-job: the new limit stays exactly what the user signed.
    function test_release_afterReapproveKeepsNewLimit() public {
        bytes32 id = _hold(HOLD);
        vm.prank(alice);
        vault.approveApp(alice, videoApp, 30 * CREDIT, 0, keccak256("smaller"), 0, "");

        vm.prank(operator);
        vault.release(id);
        assertEq(vault.limitOf(alice, videoApp).remaining, 30 * CREDIT);
    }

    function test_capture_partialAfterRevokeReturnsToBalanceOnly() public {
        bytes32 id = _hold(HOLD);
        vm.prank(alice);
        vault.revokeApp(alice, videoApp, keccak256("revoke"), 0, "");

        vm.prank(operator);
        vault.capture(id, 50 * CREDIT);

        assertEq(vault.balanceOf(alice), FUNDS - 50 * CREDIT);
        assertEq(vault.limitOf(alice, videoApp).remaining, 0);
        assertBacked();
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_holdThenCapture_keepsBacking(uint256 held, uint256 actual) public {
        held = bound(held, 1, LIMIT);
        actual = bound(actual, 1, held);
        bytes32 id = _hold(held);

        vm.prank(operator);
        vault.capture(id, actual);

        assertEq(vault.balanceOf(alice), FUNDS - actual);
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT - actual);
        assertEq(vault.earningsOf(videoApp) + vault.protocolFees(), actual);
        assertEq(vault.totalHeld(), 0);
        assertBacked();
    }

    // ---------------------------------------------------------------- helpers

    function _expiry() internal view returns (uint64) {
        return uint64(block.timestamp + 1 hours);
    }

    function _hold(uint256 amount) internal returns (bytes32) {
        return _holdRef(amount, REF);
    }

    function _holdRef(uint256 amount, bytes32 ref) internal returns (bytes32 id) {
        vm.prank(operator);
        id = vault.hold(alice, videoApp, amount, ref, _expiry());
    }
}
