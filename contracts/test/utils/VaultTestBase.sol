// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreditVault} from "../../src/CreditVault.sol";
import {MockUSDT} from "../../src/mocks/MockUSDT.sol";

/// @notice Deploys a mock USDT and a vault. Tests call assertBacked() after each state change.
abstract contract VaultTestBase is Test {
    uint256 internal constant CREDIT = 10_000;

    MockUSDT internal usdt;
    CreditVault internal vault;

    address internal owner = makeAddr("owner");
    address internal operator = makeAddr("operator");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(1_000_000);
        usdt = new MockUSDT();
        vault = new CreditVault(usdt, owner, operator, feeRecipient);
    }

    /// @dev Exact equality: tests never send USDT to the vault outside the vault's own functions.
    function assertBacked() internal view {
        (bool backed, uint256 held, uint256 owed) = vault.checkBacking();
        assertTrue(backed, "vault under-backed");
        assertEq(held, owed, "vault USDT != liabilities");
    }
}
