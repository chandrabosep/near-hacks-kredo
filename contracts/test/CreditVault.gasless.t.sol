// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

contract CreditVaultGaslessTest is VaultTestBase {
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    uint256 alicePk = 0xA11CE;
    address alice;
    address relayer = makeAddr("relayer");
    address attacker = makeAddr("attacker");

    bytes32 constant NONCE = keccak256("buy-1");

    function setUp() public override {
        super.setUp();
        alice = vm.addr(alicePk);
        usdt.mint(alice, 100e6);
    }

    // ---------------------------------------------------------------- permit

    function test_depositWithPermit_relayedByStranger() public {
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, 10e6, block.timestamp + 1 hours);

        vm.expectEmit(address(vault));
        emit CreditVault.Deposited(alice, alice, 10e6);
        vm.prank(relayer);
        vault.depositWithPermit(alice, 10e6, block.timestamp + 1 hours, v, r, s);

        assertEq(vault.balanceOf(alice), 10e6);
        assertEq(vault.balanceOf(relayer), 0);
        assertEq(usdt.balanceOf(alice), 90e6);
        assertEq(usdt.balanceOf(relayer), 0);
        assertBacked();
    }

    /// Someone copies the permit from the mempool and submits it to the token first.
    /// The deposit must still go through.
    function test_depositWithPermit_afterFrontRunPermit() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, 10e6, deadline);

        vm.prank(attacker);
        usdt.permit(alice, address(vault), 10e6, deadline, v, r, s);

        vm.prank(relayer);
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);

        assertEq(vault.balanceOf(alice), 10e6);
        assertBacked();
    }

    function test_depositWithPermit_revertsOnBadSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(0xB0B, 10e6, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 10e6)
        );
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);
    }

    /// The relayer can't inflate the amount: the permit only covers what the user signed.
    function test_depositWithPermit_revertsOnHigherAmount() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, 10e6, deadline);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 50e6)
        );
        vault.depositWithPermit(alice, 50e6, deadline, v, r, s);
    }

    function test_depositWithPermit_revertsOnReplay() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, 10e6, deadline);

        vm.startPrank(relayer);
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 10e6)
        );
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 10e6);
        assertBacked();
    }

    function test_depositWithPermit_revertsAfterDeadline() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, 10e6, deadline);
        vm.warp(deadline + 1);

        vm.prank(relayer);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(vault), 0, 10e6)
        );
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);
    }

    function test_depositWithPermit_revertsWhenPaused() public {
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, 10e6, deadline);
        vm.prank(owner);
        vault.pause();

        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);
    }

    // ---------------------------------------------------------------- authorization

    function test_depositWithAuthorization_relayedByStranger() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, address(vault), 10e6, NONCE);

        vm.prank(relayer);
        vault.depositWithAuthorization(alice, 10e6, 0, block.timestamp + 1 hours, NONCE, v, r, s);

        assertEq(vault.balanceOf(alice), 10e6);
        assertEq(usdt.balanceOf(alice), 90e6);
        assertTrue(usdt.authorizationState(alice, NONCE));
        assertBacked();
    }

    function test_depositWithAuthorization_revertsOnReplay() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, address(vault), 10e6, NONCE);
        uint256 validBefore = block.timestamp + 1 hours;

        vm.startPrank(relayer);
        vault.depositWithAuthorization(alice, 10e6, 0, validBefore, NONCE, v, r, s);
        vm.expectRevert(MockUSDT.AuthorizationAlreadyUsed.selector);
        vault.depositWithAuthorization(alice, 10e6, 0, validBefore, NONCE, v, r, s);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 10e6);
        assertBacked();
    }

    function test_depositWithAuthorization_revertsOnBadSignature() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(0xB0B, address(vault), 10e6, NONCE);

        vm.prank(relayer);
        vm.expectRevert(MockUSDT.InvalidSignature.selector);
        vault.depositWithAuthorization(alice, 10e6, 0, block.timestamp + 1 hours, NONCE, v, r, s);
    }

    function test_depositWithAuthorization_revertsOnHigherAmount() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, address(vault), 10e6, NONCE);

        vm.prank(relayer);
        vm.expectRevert(MockUSDT.InvalidSignature.selector);
        vault.depositWithAuthorization(alice, 50e6, 0, block.timestamp + 1 hours, NONCE, v, r, s);
    }

    /// Signed to someone else: the vault can't use it.
    function test_depositWithAuthorization_revertsOnWrongTo() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, attacker, 10e6, NONCE);

        vm.prank(relayer);
        vm.expectRevert(MockUSDT.InvalidSignature.selector);
        vault.depositWithAuthorization(alice, 10e6, 0, block.timestamp + 1 hours, NONCE, v, r, s);
    }

    /// Signed to the vault: nobody else can submit it to the token directly.
    function test_depositWithAuthorization_cannotBeFrontRun() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, address(vault), 10e6, NONCE);
        uint256 validBefore = block.timestamp + 1 hours;

        vm.prank(attacker);
        vm.expectRevert(MockUSDT.CallerMustBePayee.selector);
        usdt.receiveWithAuthorization(alice, address(vault), 10e6, 0, validBefore, NONCE, v, r, s);

        vm.prank(relayer);
        vault.depositWithAuthorization(alice, 10e6, 0, validBefore, NONCE, v, r, s);
        assertEq(vault.balanceOf(alice), 10e6);
        assertBacked();
    }

    function test_depositWithAuthorization_revertsWhenExpired() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, address(vault), 10e6, NONCE);
        uint256 validBefore = block.timestamp + 1 hours;
        vm.warp(validBefore);

        vm.prank(relayer);
        vm.expectRevert(MockUSDT.AuthorizationExpired.selector);
        vault.depositWithAuthorization(alice, 10e6, 0, validBefore, NONCE, v, r, s);
    }

    function test_depositWithAuthorization_revertsWhenPaused() public {
        (uint8 v, bytes32 r, bytes32 s) = _signAuth(alicePk, address(vault), 10e6, NONCE);
        vm.prank(operator);
        vault.pause();

        vm.prank(relayer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.depositWithAuthorization(alice, 10e6, 0, block.timestamp + 1 hours, NONCE, v, r, s);
    }

    function test_depositWithAuthorization_revertsOnZeroAmount() public {
        vm.prank(relayer);
        vm.expectRevert(CreditVault.ZeroAmount.selector);
        vault.depositWithAuthorization(alice, 0, 0, block.timestamp + 1 hours, NONCE, 0, 0, 0);
    }

    function testFuzz_gaslessDeposits_keepBacking(uint256 a, uint256 b) public {
        a = bound(a, 1, 50e6);
        b = bound(b, 1, 50e6);
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signPermit(alicePk, a, deadline);
        vm.prank(relayer);
        vault.depositWithPermit(alice, a, deadline, v, r, s);

        (v, r, s) = _signAuth(alicePk, address(vault), b, NONCE);
        vm.prank(relayer);
        vault.depositWithAuthorization(alice, b, 0, deadline, NONCE, v, r, s);

        assertEq(vault.balanceOf(alice), a + b);
        assertBacked();
    }

    // ---------------------------------------------------------------- helpers

    function _signPermit(uint256 pk, uint256 value, uint256 deadline) internal view returns (uint8, bytes32, bytes32) {
        address signer = vm.addr(pk);
        bytes32 structHash =
            keccak256(abi.encode(PERMIT_TYPEHASH, signer, address(vault), value, usdt.nonces(signer), deadline));
        return vm.sign(pk, _digest(structHash));
    }

    function _signAuth(uint256 pk, address to, uint256 value, bytes32 nonce)
        internal
        view
        returns (uint8, bytes32, bytes32)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                usdt.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), vm.addr(pk), to, value, 0, block.timestamp + 1 hours, nonce
            )
        );
        return vm.sign(pk, _digest(structHash));
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", usdt.DOMAIN_SEPARATOR(), structHash));
    }
}
