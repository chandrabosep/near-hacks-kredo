// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Test} from "forge-std/Test.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultDepositTest is VaultTestBase {
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public override {
        super.setUp();
        usdt.mint(alice, 100e6);
        vm.prank(alice);
        usdt.approve(address(vault), type(uint256).max);
    }

    function test_deposit() public {
        vm.expectEmit(address(vault));
        emit CreditVault.Deposited(alice, alice, 10e6);
        vm.prank(alice);
        vault.deposit(alice, 10e6); // $10 = 1,000 credits

        assertEq(vault.balanceOf(alice), 1_000 * CREDIT);
        assertEq(vault.totalBalances(), 10e6);
        assertEq(usdt.balanceOf(address(vault)), 10e6);
        assertEq(usdt.balanceOf(alice), 90e6);
        assertBacked();
    }

    function test_deposit_forAnotherUser() public {
        vm.prank(alice);
        vault.deposit(bob, 5e6);

        assertEq(vault.balanceOf(bob), 5e6);
        assertEq(vault.balanceOf(alice), 0);
        assertBacked();
    }

    function test_deposit_addsUp() public {
        vm.startPrank(alice);
        vault.deposit(alice, 3e6);
        vault.deposit(alice, 2e6);
        vault.deposit(bob, 1e6);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 5e6);
        assertEq(vault.balanceOf(bob), 1e6);
        assertEq(vault.totalBalances(), 6e6);
        assertBacked();
    }

    function test_deposit_revertsOnZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.deposit(alice, 0);
    }

    function test_deposit_revertsOnZeroUser() public {
        vm.prank(alice);
        vm.expectRevert(CreditVault.ZeroAddress.selector);
        vault.deposit(address(0), 1e6);
    }

    function test_deposit_revertsWhenPaused() public {
        vm.prank(operator);
        vault.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.deposit(alice, 1e6);
    }

    function test_deposit_revertsWithoutAllowance() public {
        usdt.mint(bob, 1e6);
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 1e6)
        );
        vault.deposit(bob, 1e6);
    }

    function test_deposit_revertsWithoutBalance() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, alice, 100e6, 101e6));
        vault.deposit(alice, 101e6);
    }

    /// Credits created always equal USDT received, for any amount.
    function testFuzz_deposit_keepsBacking(uint256 amount) public {
        amount = bound(amount, 1, 100e6);
        vm.prank(alice);
        vault.deposit(bob, amount);

        assertEq(vault.balanceOf(bob), amount);
        assertBacked();
    }
}

/// A USDT that keeps 1% of every transfer, like Tether's fee switch turned on.
contract FeeOnTransferUSDT is MockUSDT {
    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) return super._update(from, to, value);
        uint256 fee = value / 100;
        super._update(from, address(0xFEE), fee);
        super._update(from, to, value - fee);
    }
}

contract CreditVaultFeeTokenTest is Test {
    function test_deposit_creditsOnlyWhatArrived() public {
        FeeOnTransferUSDT token = new FeeOnTransferUSDT();
        CreditVault vault = new CreditVault(token, address(this), address(0), address(this));
        address alice = makeAddr("alice");
        token.mint(alice, 100e6);

        vm.startPrank(alice);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(alice, 10e6);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 9.9e6);
        (bool backed, uint256 held, uint256 owed) = vault.checkBacking();
        assertTrue(backed);
        assertEq(held, owed);
    }
}
