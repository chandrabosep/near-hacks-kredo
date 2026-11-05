// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultRefundTest is VaultTestBase {
    address alice = makeAddr("alice");

    uint256 constant FUNDS = 1_000 * CREDIT;
    uint256 constant LIMIT = 200 * CREDIT;
    uint256 constant PRICE = 40 * CREDIT;

    function setUp() public override {
        super.setUp();
        registerVideoApp();
        fundAndConnect(alice, FUNDS, videoApp, LIMIT);
        vm.prank(operator);
        vault.charge(alice, videoApp, PRICE, "job-1");
    }

    /// Full refund: the user gets all 40 credits back, the company pays it from its 38,
    /// and the network keeps its 2.
    function test_refund_full() public {
        // A second 10-credit job, so the company holds 38 + 9.5 = 47.5 credits.
        vm.prank(operator);
        vault.charge(alice, videoApp, 10 * CREDIT, "job-2");
        assertEq(vault.earningsOf(videoApp), 47.5e4);
        assertEq(vault.protocolFees(), 2.5e4);

        vm.expectEmit(address(vault));
        emit CreditVault.Refunded(videoApp, alice, "refund-1", PRICE);
        vm.prank(operator);
        vault.refund(videoApp, alice, PRICE, "refund-1");

        assertEq(vault.balanceOf(alice), FUNDS - 10 * CREDIT, "user gets all 40 back");
        assertEq(vault.earningsOf(videoApp), 7.5e4, "company pays 40 from its 47.5");
        assertEq(vault.protocolFees(), 2.5e4, "fee stays with the network");
        assertEq(vault.spentOf(alice, videoApp), 10 * CREDIT);
        assertBacked();
    }

    function test_refund_partial() public {
        vm.prank(operator);
        vault.refund(videoApp, alice, 10 * CREDIT, "refund-1");

        assertEq(vault.balanceOf(alice), FUNDS - PRICE + 10 * CREDIT);
        assertEq(vault.earningsOf(videoApp), 28 * CREDIT); // 38 earned - 10 refunded
        assertEq(vault.spentOf(alice, videoApp), 30 * CREDIT);
        assertBacked();
    }

    function test_refund_afterCapturedHold() public {
        vm.startPrank(operator);
        bytes32 id = vault.hold(alice, videoApp, 80 * CREDIT, "job-2", uint64(block.timestamp + 1 hours));
        vault.capture(id, 60 * CREDIT);
        assertEq(vault.spentOf(alice, videoApp), PRICE + 60 * CREDIT);

        vault.refund(videoApp, alice, 60 * CREDIT, "refund-1");
        vm.stopPrank();

        assertEq(vault.spentOf(alice, videoApp), PRICE);
        assertBacked();
    }

    // ---------------------------------------------------------------- anti-drain

    /// A leaked operator key can't move a company's earnings to an account that never paid it.
    function test_refund_toUserWhoNeverSpentReverts() public {
        address attacker = makeAddr("attacker");
        vm.prank(operator);
        vm.expectRevert(CreditVault.OverSpent.selector);
        vault.refund(videoApp, attacker, 1, "steal");
    }

    function test_refund_aboveSpentReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.OverSpent.selector);
        vault.refund(videoApp, alice, PRICE + 1, "refund-1");
    }

    function test_refund_cannotExceedSpentAcrossRefunds() public {
        vm.startPrank(operator);
        vault.refund(videoApp, alice, 20 * CREDIT, "refund-1");
        vault.refund(videoApp, alice, 15 * CREDIT, "refund-2");
        vm.expectRevert(CreditVault.OverSpent.selector);
        vault.refund(videoApp, alice, 6 * CREDIT, "refund-3");
        vm.stopPrank();
    }

    /// The company covers the fee, so it can't refund more than it holds.
    function test_refund_aboveEarningsReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.InsufficientEarnings.selector);
        vault.refund(videoApp, alice, PRICE, "refund-1"); // earned only 38
    }

    function test_refund_duplicateRefReverts() public {
        vm.startPrank(operator);
        vault.refund(videoApp, alice, 5 * CREDIT, "refund-1");
        vm.expectRevert(CreditVault.RefUsed.selector);
        vault.refund(videoApp, alice, 5 * CREDIT, "refund-1");

        vm.expectRevert(CreditVault.RefUsed.selector);
        vault.refund(videoApp, alice, 5 * CREDIT, "job-1"); // the charge's ref
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- other

    function test_refund_worksForInactiveApp() public {
        vm.startPrank(operator);
        vault.setAppActive(videoApp, false);
        vault.refund(videoApp, alice, 10 * CREDIT, "refund-1");
        vm.stopPrank();
        assertBacked();
    }

    function test_refund_unknownAppReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.refund(makeAddr("nobody"), alice, 1, "refund-1");
    }

    function test_refund_zeroAmountReverts() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.refund(videoApp, alice, 0, "refund-1");
    }

    function test_refund_onlyOperator() public {
        vm.prank(videoPayout);
        vm.expectRevert(CreditVault.NotOperator.selector);
        vault.refund(videoApp, alice, 1, "refund-1");
    }

    function test_refund_whenPausedReverts() public {
        vm.prank(operator);
        vault.pause();
        vm.prank(operator);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.refund(videoApp, alice, 1, "refund-1");
    }

    function testFuzz_refund_keepsBacking(uint256 amount) public {
        amount = bound(amount, 1, 38 * CREDIT);
        vm.prank(operator);
        vault.refund(videoApp, alice, amount, "refund-fuzz");

        assertEq(vault.balanceOf(alice), FUNDS - PRICE + amount);
        assertEq(vault.earningsOf(videoApp), 38 * CREDIT - amount);
        assertBacked();
    }
}
