// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";

contract MockUSDTTest is Test {
    MockUSDT usdt;

    uint256 alicePk = 0xA11CE;
    address alice;
    address payee = makeAddr("payee");

    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function setUp() public {
        usdt = new MockUSDT();
        alice = vm.addr(alicePk);
        usdt.mint(alice, 1_000e6);
        vm.warp(1_000_000);
    }

    function test_metadata() public view {
        assertEq(usdt.name(), "Tether USD");
        assertEq(usdt.symbol(), "USDT");
        assertEq(usdt.decimals(), 6);
    }

    function test_domainMatchesRealToken() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tether USD"),
                keccak256("1"),
                block.chainid,
                address(usdt)
            )
        );
        assertEq(usdt.DOMAIN_SEPARATOR(), expected);
    }

    function test_permit() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, alice, payee, 100e6, 0, deadline));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, _digest(structHash));

        usdt.permit(alice, payee, 100e6, deadline, v, r, s);
        assertEq(usdt.allowance(alice, payee), 100e6);
        assertEq(usdt.nonces(alice), 1);
    }

    function test_receiveWithAuthorization() public {
        (uint8 v, bytes32 r, bytes32 s) = _signReceive(alicePk, payee, 50e6, bytes32("n1"));

        vm.prank(payee);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, block.timestamp + 1 hours, bytes32("n1"), v, r, s);

        assertEq(usdt.balanceOf(payee), 50e6);
        assertTrue(usdt.authorizationState(alice, bytes32("n1")));
    }

    function test_receiveWithAuthorization_revertsWhenCallerIsNotPayee() public {
        (uint8 v, bytes32 r, bytes32 s) = _signReceive(alicePk, payee, 50e6, bytes32("n1"));

        vm.expectRevert(MockUSDT.CallerMustBePayee.selector);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, block.timestamp + 1 hours, bytes32("n1"), v, r, s);
    }

    function test_receiveWithAuthorization_revertsOnReplay() public {
        (uint8 v, bytes32 r, bytes32 s) = _signReceive(alicePk, payee, 50e6, bytes32("n1"));
        uint256 validBefore = block.timestamp + 1 hours;

        vm.startPrank(payee);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, validBefore, bytes32("n1"), v, r, s);
        vm.expectRevert(MockUSDT.AuthorizationAlreadyUsed.selector);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, validBefore, bytes32("n1"), v, r, s);
        vm.stopPrank();
    }

    function test_receiveWithAuthorization_revertsOnBadSignature() public {
        (uint8 v, bytes32 r, bytes32 s) = _signReceive(0xB0B, payee, 50e6, bytes32("n1"));

        vm.prank(payee);
        vm.expectRevert(MockUSDT.InvalidSignature.selector);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, block.timestamp + 1 hours, bytes32("n1"), v, r, s);
    }

    function test_receiveWithAuthorization_revertsWhenExpired() public {
        (uint8 v, bytes32 r, bytes32 s) = _signReceive(alicePk, payee, 50e6, bytes32("n1"));
        uint256 validBefore = block.timestamp + 1 hours;
        vm.warp(validBefore);

        vm.prank(payee);
        vm.expectRevert(MockUSDT.AuthorizationExpired.selector);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, validBefore, bytes32("n1"), v, r, s);
    }

    function test_cancelAuthorization_blocksLaterUse() public {
        (uint8 v, bytes32 r, bytes32 s) = _signReceive(alicePk, payee, 50e6, bytes32("n1"));
        bytes32 cancelHash = keccak256(abi.encode(usdt.CANCEL_AUTHORIZATION_TYPEHASH(), alice, bytes32("n1")));
        (uint8 cv, bytes32 cr, bytes32 cs) = vm.sign(alicePk, _digest(cancelHash));

        usdt.cancelAuthorization(alice, bytes32("n1"), cv, cr, cs);

        vm.prank(payee);
        vm.expectRevert(MockUSDT.AuthorizationAlreadyUsed.selector);
        usdt.receiveWithAuthorization(alice, payee, 50e6, 0, block.timestamp + 1 hours, bytes32("n1"), v, r, s);
    }

    function _signReceive(uint256 pk, address to, uint256 value, bytes32 nonce)
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
