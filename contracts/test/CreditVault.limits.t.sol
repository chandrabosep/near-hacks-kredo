// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CreditVault} from "../src/CreditVault.sol";
import {VaultTestBase} from "./utils/VaultTestBase.sol";

/// A minimal smart-contract wallet that accepts signatures from one owner key.
contract MockSmartWallet is IERC1271 {
    address immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return ECDSA.recover(hash, signature) == signer ? IERC1271.isValidSignature.selector : bytes4(0);
    }
}

contract CreditVaultLimitsTest is VaultTestBase {
    uint256 alicePk = 0xA11CE;
    address alice;
    address relayer = makeAddr("relayer");

    uint256 constant LIMIT = 200 * CREDIT;
    bytes32 constant NONCE = keccak256("approve-1");

    function setUp() public override {
        super.setUp();
        alice = vm.addr(alicePk);
        registerVideoApp();
    }

    // ---------------------------------------------------------------- domain

    function test_domainSeparator() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("CreditVault"),
                keccak256("1"),
                block.chainid,
                address(vault)
            )
        );
        assertEq(vault.DOMAIN_SEPARATOR(), expected);
    }

    // ---------------------------------------------------------------- approve

    function test_approveApp_direct() public {
        vm.expectEmit(address(vault));
        emit CreditVault.AppApproved(alice, videoApp, LIMIT, 0);
        vm.prank(alice);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");

        CreditVault.Limit memory l = vault.limitOf(alice, videoApp);
        assertEq(l.remaining, LIMIT);
        assertEq(l.expiry, 0);
        assertFalse(vault.nonceUsed(alice, NONCE), "direct call needs no nonce");
    }

    function test_approveApp_signedAndRelayed() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        bytes memory sig = _signApprove(alicePk, videoApp, LIMIT, expiry, NONCE, _deadline());

        vm.prank(relayer);
        vault.approveApp(alice, videoApp, LIMIT, expiry, NONCE, _deadline(), sig);

        CreditVault.Limit memory l = vault.limitOf(alice, videoApp);
        assertEq(l.remaining, LIMIT);
        assertEq(l.expiry, expiry);
        assertTrue(vault.nonceUsed(alice, NONCE));
    }

    function test_approveApp_replacesEarlierLimit() public {
        vm.startPrank(alice);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");
        vault.approveApp(alice, videoApp, 50 * CREDIT, 0, NONCE, 0, "");
        vm.stopPrank();

        assertEq(vault.limitOf(alice, videoApp).remaining, 50 * CREDIT);
    }

    function test_approveApp_revertsOnReplay() public {
        bytes memory sig = _signApprove(alicePk, videoApp, LIMIT, 0, NONCE, _deadline());

        vm.startPrank(relayer);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, _deadline(), sig);
        vm.expectRevert(CreditVault.NonceUsed.selector);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, _deadline(), sig);
        vm.stopPrank();
    }

    function test_approveApp_revertsOnWrongSigner() public {
        bytes memory sig = _signApprove(0xB0B, videoApp, LIMIT, 0, NONCE, _deadline());

        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, _deadline(), sig);
    }

    /// The relayer can't raise the limit the user signed.
    function test_approveApp_revertsOnTamperedLimit() public {
        bytes memory sig = _signApprove(alicePk, videoApp, LIMIT, 0, NONCE, _deadline());

        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.approveApp(alice, videoApp, LIMIT * 10, 0, NONCE, _deadline(), sig);
    }

    /// A signature for one app can't approve another.
    function test_approveApp_revertsOnOtherApp() public {
        address chatApp = makeAddr("chatApp");
        vm.prank(operator);
        vault.registerApp(chatApp, makeAddr("chatPayout"), FEE_BPS, 0);
        bytes memory sig = _signApprove(alicePk, videoApp, LIMIT, 0, NONCE, _deadline());

        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.approveApp(alice, chatApp, LIMIT, 0, NONCE, _deadline(), sig);
    }

    /// A signature for this vault can't be used on another deployment.
    function test_approveApp_revertsOnOtherVault() public {
        CreditVault other = new CreditVault(usdt, owner, operator, feeRecipient);
        vm.prank(operator);
        other.registerApp(videoApp, videoPayout, FEE_BPS, 0);
        bytes memory sig = _signApprove(alicePk, videoApp, LIMIT, 0, NONCE, _deadline());

        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        other.approveApp(alice, videoApp, LIMIT, 0, NONCE, _deadline(), sig);
    }

    function test_approveApp_revertsAfterDeadline() public {
        uint256 deadline = _deadline();
        bytes memory sig = _signApprove(alicePk, videoApp, LIMIT, 0, NONCE, deadline);
        vm.warp(deadline + 1);

        vm.prank(relayer);
        vm.expectRevert(CreditVault.SignatureExpired.selector);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, deadline, sig);
    }

    function test_approveApp_revertsWithoutSignature() public {
        vm.prank(relayer);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, _deadline(), "");
    }

    function test_approveApp_revertsForUnknownApp() public {
        vm.prank(alice);
        vm.expectRevert(CreditVault.UnknownApp.selector);
        vault.approveApp(alice, makeAddr("nobody"), LIMIT, 0, NONCE, 0, "");
    }

    function test_approveApp_revertsForInactiveApp() public {
        vm.prank(operator);
        vault.setAppActive(videoApp, false);

        vm.prank(alice);
        vm.expectRevert(CreditVault.AppInactive.selector);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");
    }

    function test_approveApp_revertsWhenPaused() public {
        vm.prank(operator);
        vault.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");
    }

    function test_approveApp_revertsOnLimitAboveUint128() public {
        vm.prank(alice);
        vm.expectRevert(CreditVault.LimitTooHigh.selector);
        vault.approveApp(alice, videoApp, uint256(type(uint128).max) + 1, 0, NONCE, 0, "");
    }

    function test_approveApp_bySmartWallet() public {
        MockSmartWallet wallet = new MockSmartWallet(alice);
        bytes32 structHash = keccak256(
            abi.encode(vault.APPROVE_APP_TYPEHASH(), address(wallet), videoApp, LIMIT, uint64(0), NONCE, _deadline())
        );
        bytes memory sig = signVault(alicePk, structHash);

        vm.prank(relayer);
        vault.approveApp(address(wallet), videoApp, LIMIT, 0, NONCE, _deadline(), sig);
        assertEq(vault.limitOf(address(wallet), videoApp).remaining, LIMIT);
    }

    // ---------------------------------------------------------------- revoke

    function test_revokeApp_direct() public {
        vm.startPrank(alice);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");

        vm.expectEmit(address(vault));
        emit CreditVault.AppRevoked(alice, videoApp);
        vault.revokeApp(alice, videoApp, NONCE, 0, "");
        vm.stopPrank();

        assertEq(vault.limitOf(alice, videoApp).remaining, 0);
    }

    function test_revokeApp_signedAndRelayed() public {
        vm.prank(alice);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");
        bytes32 revokeNonce = keccak256("revoke-1");
        bytes memory sig = _signRevoke(alicePk, videoApp, revokeNonce, _deadline());

        vm.prank(relayer);
        vault.revokeApp(alice, videoApp, revokeNonce, _deadline(), sig);
        assertEq(vault.limitOf(alice, videoApp).remaining, 0);
    }

    /// Cutting an app off must work even when the vault is paused.
    function test_revokeApp_worksWhenPaused() public {
        vm.prank(alice);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");
        vm.prank(operator);
        vault.pause();

        bytes memory sig = _signRevoke(alicePk, videoApp, keccak256("revoke-1"), _deadline());
        vm.prank(relayer);
        vault.revokeApp(alice, videoApp, keccak256("revoke-1"), _deadline(), sig);
        assertEq(vault.limitOf(alice, videoApp).remaining, 0);
    }

    function test_revokeApp_revertsForStrangerWithoutSignature() public {
        vm.prank(alice);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, 0, "");

        vm.prank(operator);
        vm.expectRevert(CreditVault.BadSignature.selector);
        vault.revokeApp(alice, videoApp, NONCE, _deadline(), "");
        assertEq(vault.limitOf(alice, videoApp).remaining, LIMIT);
    }

    /// Approve and revoke share one nonce space, so one signature can't be reused for the other.
    function test_revokeApp_revertsOnNonceUsedByApprove() public {
        bytes memory approveSig = _signApprove(alicePk, videoApp, LIMIT, 0, NONCE, _deadline());
        vm.prank(relayer);
        vault.approveApp(alice, videoApp, LIMIT, 0, NONCE, _deadline(), approveSig);

        bytes memory revokeSig = _signRevoke(alicePk, videoApp, NONCE, _deadline());
        vm.prank(relayer);
        vm.expectRevert(CreditVault.NonceUsed.selector);
        vault.revokeApp(alice, videoApp, NONCE, _deadline(), revokeSig);
    }

    // ---------------------------------------------------------------- helpers

    function _deadline() internal view returns (uint256) {
        return block.timestamp + 1 hours;
    }

    function _signApprove(uint256 pk, address app, uint256 limit, uint64 expiry, bytes32 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash =
            keccak256(abi.encode(vault.APPROVE_APP_TYPEHASH(), vm.addr(pk), app, limit, expiry, nonce, deadline));
        return signVault(pk, structHash);
    }

    function _signRevoke(uint256 pk, address app, bytes32 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(vault.REVOKE_APP_TYPEHASH(), vm.addr(pk), app, nonce, deadline));
        return signVault(pk, structHash);
    }
}
