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

    address internal videoApp = makeAddr("videoApp");
    address internal videoPayout = makeAddr("videoPayout");
    uint16 internal constant FEE_BPS = 500; // 5%

    function setUp() public virtual {
        vm.warp(1_000_000);
        usdt = new MockUSDT();
        vault = new CreditVault(usdt, owner, operator, feeRecipient);
    }

    function registerVideoApp() internal {
        vm.prank(operator);
        vault.registerApp(videoApp, videoPayout, FEE_BPS, 0);
    }

    /// @dev Signs a CreditVault EIP-712 message and returns the 65-byte signature.
    function signVault(uint256 pk, bytes32 structHash) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Exact equality: tests never send USDT to the vault outside the vault's own functions.
    function assertBacked() internal view {
        (bool backed, uint256 held, uint256 owed) = vault.checkBacking();
        assertTrue(backed, "vault under-backed");
        assertEq(held, owed, "vault USDT != liabilities");
    }
}
