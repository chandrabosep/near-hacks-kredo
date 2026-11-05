// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreditVault} from "../../src/CreditVault.sol";
import {MockUSDT} from "../../src/mocks/MockUSDT.sol";
import {VaultHandler} from "./VaultHandler.sol";

/// @notice Every credit is backed, after any sequence of deposits, limits, charges, holds,
/// captures, releases, refunds, sends, claims, payouts and fee withdrawals.
contract CreditVaultInvariantTest is Test {
    CreditVault vault;
    MockUSDT usdt;
    VaultHandler handler;

    function setUp() public {
        vm.warp(1_000_000);
        address owner = makeAddr("owner");
        address operator = makeAddr("operator");
        usdt = new MockUSDT();
        vault = new CreditVault(usdt, owner, operator, makeAddr("feeRecipient"));
        handler = new VaultHandler(vault, usdt, owner, operator);
        targetContract(address(handler));
    }

    /// The headline promise: the vault's USDT equals everything it owes, to the unit.
    function invariant_vaultUsdtEqualsLiabilities() public view {
        (bool backed, uint256 held, uint256 owed) = vault.checkBacking();
        assertTrue(backed);
        assertEq(held, owed);
    }

    /// USDT in = USDT still in the vault + USDT paid to companies + fees withdrawn.
    function invariant_usdtConserved() public view {
        assertEq(
            handler.ghostDeposited(),
            usdt.balanceOf(address(vault)) + handler.ghostPaidOut() + handler.ghostFeesWithdrawn()
        );
    }

    function invariant_totalBalancesMatchesUsers() public view {
        uint256 sum;
        for (uint256 i; i < handler.usersLength(); ++i) {
            sum += vault.balanceOf(handler.users(i));
        }
        assertEq(sum, vault.totalBalances());
    }

    function invariant_totalEarningsMatchesApps() public view {
        uint256 sum;
        for (uint256 i; i < handler.appsLength(); ++i) {
            sum += vault.earningsOf(handler.apps(i));
        }
        assertEq(sum, vault.totalEarnings());
    }

    function invariant_totalHeldMatchesOpenHolds() public view {
        uint256 sum;
        for (uint256 i; i < handler.holdsLength(); ++i) {
            CreditVault.Hold memory h = vault.getHold(handler.holdIds(i));
            if (h.status == CreditVault.HoldStatus.Open) sum += h.amount;
        }
        assertEq(sum, vault.totalHeld());
    }

    function invariant_totalClaimsMatchesOpenClaims() public view {
        uint256 sum;
        for (uint256 i; i < handler.claimsLength(); ++i) {
            CreditVault.Claim memory c = vault.getClaim(vm.addr(handler.claimKeyPks(i)));
            if (c.status == CreditVault.ClaimStatus.Open) sum += c.amount;
        }
        assertEq(sum, vault.totalClaims());
    }
}
