// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultChargeTest is VaultTestBase {
    address alice = makeAddr("alice");

    uint256 constant FUNDS = 1_000 * CREDIT; // $10
    uint256 constant LIMIT = 200 * CREDIT;
    uint256 constant PRICE = 40 * CREDIT; // 5-second video, $0.40

    function setUp() public override {
        super.setUp();
        registerVideoApp();
        fundAndConnect(alice, FUNDS, videoApp, LIMIT);
    }

    function test_charge() public {
        uint256 fee = (PRICE * FEE_BPS) / 10_000;

        vm.expectEmit(address(vault));
        emit CreditVault.Charged(alice, videoApp, "job-1", PRICE, fee);
        vm.prank(operator);
        vault.charge(alice, videoApp, PRICE, "job-1");

        assertEq(vault.balanceOf(alice), FUNDS - PRICE);
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT - PRICE);
        assertEq(vault.earningsOf(videoApp), PRICE - fee);
        assertEq(vault.protocolFees(), fee);
        assertEq(vault.totalBalances(), FUNDS - PRICE);
        assertEq(vault.totalEarnings(), PRICE - fee);
        assertTrue(vault.refUsed(videoApp, "job-1"));
        assertBacked();
    }

    /// 40 credits at 5%: the company earns 38 credits, the network 2. The user pays exactly 40.
    function test_charge_feeSplit() public {
        vm.prank(operator);
        vault.charge(alice, videoApp, PRICE, "job-1");

        assertEq(vault.earningsOf(videoApp), 38 * CREDIT);
        assertEq(vault.protocolFees(), 2 * CREDIT);
    }

    function test_charge_upToExactLimit() public {
        vm.startPrank(operator);
        vault.charge(alice, videoApp, 150 * CREDIT, "a");
        vault.charge(alice, videoApp, 50 * CREDIT, "b");
        vm.stopPrank();

        assertEq(vault.limitOf(alice, videoApp).remaining, 0);
        assertBacked();
    }

    // ---------------------------------------------------------------- anti-drain

    /// The core promise: even our own operator key can't charge above what the user signed.
    function test_charge_overLimitRevertsEvenFromOperator() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.OverLimit.selector);
        vault.charge(alice, videoApp, LIMIT + 1, "job-1");

        assertEq(vault.balanceOf(alice), FUNDS);
        assertBacked();
    }

    function test_charge_overRemainingLimitReverts() public {
        vm.startPrank(operator);
        vault.charge(alice, videoApp, 150 * CREDIT, "a");
        vm.expectRevert(CreditVault.OverLimit.selector);
        vault.charge(alice, videoApp, 51 * CREDIT, "b");
        vm.stopPrank();
    }

    function test_charge_afterRevokeReverts() public {
        vm.prank(alice);
        vault.revokeApp(alice, videoApp, keccak256("revoke"), 0, "");

        vm.prank(operator);
        vm.expectRevert(CreditVault.OverLimit.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    function test_charge_withoutApprovalReverts() public {
        address chatApp = makeAddr("chatApp");
        vm.prank(operator);
        vault.registerApp(chatApp, makeAddr("chatPayout"), FEE_BPS, 0);

        vm.prank(operator);
        vm.expectRevert(CreditVault.OverLimit.selector);
        vault.charge(alice, chatApp, 1, "msg-1");
    }

    function test_charge_afterLimitExpiryReverts() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        vm.prank(alice);
        vault.approveApp(alice, videoApp, LIMIT, expiry, keccak256("again"), 0, "");
        vm.warp(expiry);

        vm.prank(operator);
        vm.expectRevert(CreditVault.LimitExpired.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    function test_charge_overMaxChargeReverts() public {
        vm.prank(owner);
        vault.setAppTerms(videoApp, FEE_BPS, 300_000); // 30 credits

        vm.prank(operator);
        vm.expectRevert(CreditVault.OverMaxCharge.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    /// A retried transaction with the same ref can't charge twice.
    function test_charge_duplicateRefReverts() public {
        vm.startPrank(operator);
        vault.charge(alice, videoApp, PRICE, "job-1");
        vm.expectRevert(CreditVault.RefUsed.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), FUNDS - PRICE);
    }

    function test_charge_sameRefOnOtherAppIsFine() public {
        address chatApp = makeAddr("chatApp");
        vm.prank(operator);
        vault.registerApp(chatApp, makeAddr("chatPayout"), FEE_BPS, 0);
        vm.prank(alice);
        vault.approveApp(alice, chatApp, LIMIT, 0, keccak256("chat"), 0, "");

        vm.startPrank(operator);
        vault.charge(alice, videoApp, PRICE, "id-1");
        vault.charge(alice, chatApp, PRICE, "id-1");
        vm.stopPrank();
        assertBacked();
    }

    // ---------------------------------------------------------------- other reverts

    function test_charge_insufficientBalanceReverts() public {
        address bob = makeAddr("bob");
        fundAndConnect(bob, 10 * CREDIT, videoApp, LIMIT);

        vm.prank(operator);
        vm.expectRevert(CreditVault.InsufficientBalance.selector);
        vault.charge(bob, videoApp, PRICE, "job-1");
    }

    function test_charge_onlyOperator() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.NotOperator.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");

        vm.prank(videoPayout);
        vm.expectRevert(CreditVault.NotOperator.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    function test_charge_inactiveAppReverts() public {
        vm.prank(operator);
        vault.setAppActive(videoApp, false);

        vm.prank(operator);
        vm.expectRevert(CreditVault.AppInactive.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    function test_charge_unknownAppReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.charge(alice, makeAddr("nobody"), PRICE, "job-1");
    }

    function test_charge_zeroAmountReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.charge(alice, videoApp, 0, "job-1");
    }

    function test_charge_zeroRefReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.ZeroRef.selector);
        vault.charge(alice, videoApp, PRICE, bytes32(0));
    }

    function test_charge_whenPausedReverts() public {
        vm.prank(operator);
        vault.pause();

        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_charge_splitsExactlyAndKeepsBacking(uint256 amount, uint16 feeBps) public {
        amount = bound(amount, 1, LIMIT);
        feeBps = uint16(bound(feeBps, 0, vault.MAX_FEE_BPS()));
        vm.prank(owner);
        vault.setAppTerms(videoApp, feeBps, 0);

        vm.prank(operator);
        vault.charge(alice, videoApp, amount, "fuzz");

        assertEq(vault.earningsOf(videoApp) + vault.protocolFees(), amount, "split must add up");
        assertEq(vault.balanceOf(alice), FUNDS - amount);
        assertBacked();
    }
}
