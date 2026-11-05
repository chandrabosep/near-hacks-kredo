// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultPayoutsTest is VaultTestBase {
    address alice = makeAddr("alice");

    uint256 constant FUNDS = 1_000 * CREDIT;
    uint256 constant PRICE = 40 * CREDIT;

    function setUp() public override {
        super.setUp();
        registerVideoApp();
        fundAndConnect(alice, FUNDS, videoApp, 200 * CREDIT);
        vm.prank(operator);
        vault.charge(alice, videoApp, PRICE, "job-1"); // company earns 38, network 2
    }

    // ---------------------------------------------------------------- payout

    function test_payout_byPayoutAddress() public {
        vm.expectEmit(address(vault));
        emit CreditVault.PaidOut(videoApp, videoPayout, 38 * CREDIT);
        vm.prank(videoPayout);
        uint256 paid = vault.payout(videoApp);

        assertEq(paid, 38 * CREDIT);
        assertEq(usdt.balanceOf(videoPayout), 38 * CREDIT);
        assertEq(vault.earningsOf(videoApp), 0);
        assertEq(vault.totalEarnings(), 0);
        assertBacked();
    }

    /// Our backend triggers payouts on a schedule, but the USDT always lands at the company's address.
    function test_payout_byOperatorPaysTheCompany() public {
        vm.prank(operator);
        vault.payout(videoApp);
        assertEq(usdt.balanceOf(videoPayout), 38 * CREDIT);
        assertEq(usdt.balanceOf(operator), 0);
        assertBacked();
    }

    function test_payout_byOwner() public {
        vm.prank(owner);
        vault.payout(videoApp);
        assertEq(usdt.balanceOf(videoPayout), 38 * CREDIT);
    }

    function test_payout_goesToUpdatedPayoutAddress() public {
        address newPayout = makeAddr("newPayout");
        vm.prank(videoPayout);
        vault.setAppPayout(videoApp, newPayout);

        vm.prank(newPayout);
        vault.payout(videoApp);
        assertEq(usdt.balanceOf(newPayout), 38 * CREDIT);
        assertEq(usdt.balanceOf(videoPayout), 0);
    }

    function test_payout_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert(CreditVault.NotAuthorized.selector);
        vault.payout(videoApp);
    }

    function test_payout_revertsWhenNothingEarned() public {
        vm.startPrank(videoPayout);
        vault.payout(videoApp);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.payout(videoApp);
        vm.stopPrank();
    }

    function test_payout_revertsForUnknownApp() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.payout(makeAddr("nobody"));
    }

    /// Companies can always get paid, even when the vault is paused or the app is switched off.
    function test_payout_worksWhenPausedAndInactive() public {
        vm.startPrank(operator);
        vault.setAppActive(videoApp, false);
        vault.pause();
        vm.stopPrank();

        vm.prank(videoPayout);
        vault.payout(videoApp);
        assertEq(usdt.balanceOf(videoPayout), 38 * CREDIT);
        assertBacked();
    }

    // ---------------------------------------------------------------- fees

    function test_withdrawFees() public {
        vm.expectEmit(address(vault));
        emit CreditVault.FeesWithdrawn(feeRecipient, 2 * CREDIT);
        vm.prank(owner);
        uint256 amount = vault.withdrawFees();

        assertEq(amount, 2 * CREDIT);
        assertEq(usdt.balanceOf(feeRecipient), 2 * CREDIT);
        assertEq(vault.protocolFees(), 0);
        assertBacked();
    }

    function test_withdrawFees_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.withdrawFees();
    }

    function test_withdrawFees_revertsWhenEmpty() public {
        vm.startPrank(owner);
        vault.withdrawFees();
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.withdrawFees();
        vm.stopPrank();
    }

    /// After every company and the network are paid, the vault holds exactly the users' credits.
    function test_fullCycle_vaultHoldsExactlyUserBalances() public {
        vm.prank(videoPayout);
        vault.payout(videoApp);
        vm.prank(owner);
        vault.withdrawFees();

        assertEq(usdt.balanceOf(address(vault)), vault.balanceOf(alice));
        assertEq(usdt.balanceOf(videoPayout) + usdt.balanceOf(feeRecipient), PRICE);
        assertBacked();
    }
}
