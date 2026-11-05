// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultAppsTest is VaultTestBase {
    function test_registerApp() public {
        vm.expectEmit(address(vault));
        emit CreditVault.AppRegistered(videoApp, videoPayout, FEE_BPS, 0);
        registerVideoApp();

        CreditVault.App memory a = vault.getApp(videoApp);
        assertEq(a.payout, videoPayout);
        assertEq(a.feeBps, FEE_BPS);
        assertEq(a.maxCharge, 0);
        assertTrue(a.active);
    }

    function test_registerApp_byOwner() public {
        vm.prank(owner);
        vault.registerApp(videoApp, videoPayout, FEE_BPS, 5_000_000); // 500 credits
        assertEq(vault.getApp(videoApp).maxCharge, 500 * CREDIT);
    }

    function test_registerApp_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert(CreditVault.NotOwnerOrOperator.selector);
        vault.registerApp(videoApp, videoPayout, FEE_BPS, 0);
    }

    function test_registerApp_revertsWhenAlreadyRegistered() public {
        registerVideoApp();
        vm.prank(operator);
        vm.expectRevert(CreditVault.AppExists.selector);
        vault.registerApp(videoApp, stranger, 0, 0);
    }

    function test_registerApp_revertsOnZeroAddresses() public {
        vm.startPrank(operator);
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.registerApp(address(0), videoPayout, FEE_BPS, 0);
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.registerApp(videoApp, address(0), FEE_BPS, 0);
        vm.stopPrank();
    }

    function test_registerApp_revertsWhenFeeTooHigh() public {
        uint16 maxFee = vault.MAX_FEE_BPS();
        vm.startPrank(operator);
        vm.expectRevert(CreditVault.FeeTooHigh.selector);
        vault.registerApp(videoApp, videoPayout, maxFee + 1, 0);

        vault.registerApp(videoApp, videoPayout, maxFee, 0);
        vm.stopPrank();
        assertEq(vault.getApp(videoApp).feeBps, maxFee);
    }

    function test_setAppTerms() public {
        registerVideoApp();
        vm.prank(owner);
        vault.setAppTerms(videoApp, 300, 1_000_000); // 100 credits

        CreditVault.App memory a = vault.getApp(videoApp);
        assertEq(a.feeBps, 300);
        assertEq(a.maxCharge, 100 * CREDIT);
    }

    function test_setAppTerms_onlyOwner() public {
        registerVideoApp();
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.setAppTerms(videoApp, 2_000, 0);
    }

    function test_setAppTerms_revertsWhenFeeTooHigh() public {
        registerVideoApp();
        vm.prank(owner);
        vm.expectRevert(CreditVault.FeeTooHigh.selector);
        vault.setAppTerms(videoApp, 2_001, 0);
    }

    function test_setAppTerms_revertsForUnknownApp() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.setAppTerms(videoApp, 100, 0);
    }

    function test_setAppPayout_byCurrentPayout() public {
        registerVideoApp();
        address newPayout = makeAddr("newPayout");

        vm.prank(videoPayout);
        vault.setAppPayout(videoApp, newPayout);
        assertEq(vault.getApp(videoApp).payout, newPayout);

        // The old address loses control.
        vm.prank(videoPayout);
        vm.expectRevert(CreditVault.NotAuthorized.selector);
        vault.setAppPayout(videoApp, videoPayout);
    }

    function test_setAppPayout_byOwner() public {
        registerVideoApp();
        vm.prank(owner);
        vault.setAppPayout(videoApp, stranger);
        assertEq(vault.getApp(videoApp).payout, stranger);
    }

    /// A leaked operator key must not be able to redirect a company's earnings.
    function test_setAppPayout_revertsForOperator() public {
        registerVideoApp();
        vm.prank(operator);
        vm.expectRevert(CreditVault.NotAuthorized.selector);
        vault.setAppPayout(videoApp, operator);
    }

    function test_setAppPayout_revertsOnZeroAddress() public {
        registerVideoApp();
        vm.prank(videoPayout);
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.setAppPayout(videoApp, address(0));
    }

    function test_setAppPayout_revertsForUnknownApp() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.setAppPayout(videoApp, stranger);
    }

    function test_setAppActive() public {
        registerVideoApp();
        vm.prank(operator);
        vault.setAppActive(videoApp, false);
        assertFalse(vault.getApp(videoApp).active);

        vm.prank(owner);
        vault.setAppActive(videoApp, true);
        assertTrue(vault.getApp(videoApp).active);
    }

    function test_setAppActive_revertsForStranger() public {
        registerVideoApp();
        vm.prank(stranger);
        vm.expectRevert(CreditVault.NotOwnerOrOperator.selector);
        vault.setAppActive(videoApp, false);
    }

    function test_setAppActive_revertsForUnknownApp() public {
        vm.prank(operator);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.setAppActive(videoApp, false);
    }

    function test_getApp_unknownIsEmpty() public view {
        CreditVault.App memory a = vault.getApp(videoApp);
        assertEq(a.payout, address(0));
        assertFalse(a.active);
    }
}
