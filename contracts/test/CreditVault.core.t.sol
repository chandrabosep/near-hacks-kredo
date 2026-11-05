// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultCoreTest is VaultTestBase {
    function test_constructor() public view {
        assertEq(address(vault.usdt()), address(usdt));
        assertEq(vault.owner(), owner);
        assertTrue(vault.isOperator(operator));
        assertEq(vault.feeRecipient(), feeRecipient);
        assertEq(vault.UNITS_PER_CREDIT(), CREDIT);
        assertEq(vault.totalLiabilities(), 0);
        assertBacked();
    }

    function test_constructor_revertsOnZeroUsdt() public {
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        new CreditVault(IERC20Metadata(address(0)), owner, operator, feeRecipient);
    }

    function test_constructor_revertsOnWrongDecimals() public {
        vm.mockCall(address(usdt), abi.encodeWithSelector(IERC20Metadata.decimals.selector), abi.encode(uint8(18)));
        vm.expectRevert(CreditVault.WrongDecimals.selector);
        new CreditVault(usdt, owner, operator, feeRecipient);
    }

    function test_constructor_revertsOnZeroFeeRecipient() public {
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        new CreditVault(usdt, owner, operator, address(0));
    }

    function test_setFeeRecipient() public {
        vm.prank(owner);
        vault.setFeeRecipient(stranger);
        assertEq(vault.feeRecipient(), stranger);
    }

    function test_setFeeRecipient_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.setFeeRecipient(stranger);
    }

    function test_setOperator() public {
        vm.prank(owner);
        vault.setOperator(stranger, true);
        assertTrue(vault.isOperator(stranger));

        vm.prank(owner);
        vault.setOperator(stranger, false);
        assertFalse(vault.isOperator(stranger));
    }

    function test_setOperator_onlyOwner() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.setOperator(stranger, true);
    }

    function test_setOperator_revertsOnZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.setOperator(address(0), true);
    }

    function test_pause_byOwnerOrOperator() public {
        vm.prank(operator);
        vault.pause();
        assertTrue(vault.paused());

        vm.prank(owner);
        vault.unpause();

        vm.prank(owner);
        vault.pause();
        assertTrue(vault.paused());
    }

    function test_pause_revertsForStranger() public {
        vm.prank(stranger);
        vm.expectRevert(CreditVault.NotOwnerOrOperator.selector);
        vault.pause();
    }

    function test_unpause_onlyOwner() public {
        vm.prank(operator);
        vault.pause();

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, operator));
        vault.unpause();

        vm.prank(owner);
        vault.unpause();
        assertFalse(vault.paused());
    }

    function test_unpause_revertsWhenNotPaused() public {
        vm.prank(owner);
        vm.expectRevert(Pausable.ExpectedPause.selector);
        vault.unpause();
    }

    function test_ownershipTransfer_isTwoStep() public {
        vm.prank(owner);
        vault.transferOwnership(stranger);
        assertEq(vault.owner(), owner);

        vm.prank(stranger);
        vault.acceptOwnership();
        assertEq(vault.owner(), stranger);
    }

    function test_renounceOwnership_isDisabled() public {
        vm.prank(owner);
        vm.expectRevert(CreditVault.RenounceDisabled.selector);
        vault.renounceOwnership();
        assertEq(vault.owner(), owner);
    }

    function test_renounceOwnership_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vault.renounceOwnership();
    }

    function test_checkBacking_reportsDonationAsSurplus() public {
        usdt.mint(address(vault), 5 * CREDIT);
        (bool backed, uint256 held, uint256 owed) = vault.checkBacking();
        assertTrue(backed);
        assertEq(held, 5 * CREDIT);
        assertEq(owed, 0);
    }
}
