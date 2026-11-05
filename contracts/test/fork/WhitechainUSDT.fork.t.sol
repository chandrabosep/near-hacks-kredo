// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {CreditVault} from "../../src/CreditVault.sol";

/// @notice Runs the vault against the real Whitechain Sepolia test USDT (TetherTokenV2 proxy),
/// to prove the domain and typehashes we sign are the ones the token checks.
///   FORK=1 forge test --match-path "test/fork/*" -vv
contract WhitechainUSDTForkTest is Test {
    address constant USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    uint256 constant CHAIN_ID = 1874;
    bytes32 constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    bytes32 constant RECEIVE_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bool enabled;
    CreditVault vault;
    IERC20Metadata usdt = IERC20Metadata(USDT);

    uint256 alicePk = 0xA11CE;
    address alice = vm.addr(alicePk);
    address operator = makeAddr("operator");
    address relayer = makeAddr("relayer");
    address app = makeAddr("videoApp");
    address payout = makeAddr("videoPayout");

    function setUp() public {
        enabled = vm.envOr("FORK", false);
        if (!enabled) return;
        vm.createSelectFork("whitechain_sepolia");
        vault = new CreditVault(usdt, address(this), operator, makeAddr("fees"));
        vm.prank(operator);
        vault.registerApp(app, payout, 500, 0);
    }

    function test_tokenFacts() public {
        vm.skip(!enabled);
        assertEq(block.chainid, CHAIN_ID);
        assertEq(usdt.name(), "Tether USD");
        assertEq(usdt.symbol(), "USDT");
        assertEq(usdt.decimals(), 6);
    }

    function test_domainSeparatorMatchesWhatWeSign() public {
        vm.skip(!enabled);
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tether USD"),
                keccak256("1"),
                CHAIN_ID,
                USDT
            )
        );
        assertEq(IERC20Permit(USDT).DOMAIN_SEPARATOR(), expected);
    }

    function test_depositWithPermit() public {
        vm.skip(!enabled);
        deal(USDT, alice, 10e6);
        uint256 deadline = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(
            abi.encode(PERMIT_TYPEHASH, alice, address(vault), 10e6, IERC20Permit(USDT).nonces(alice), deadline)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, _digest(structHash));

        vm.prank(relayer);
        vault.depositWithPermit(alice, 10e6, deadline, v, r, s);

        assertEq(vault.balanceOf(alice), 10e6);
        assertEq(usdt.balanceOf(alice), 0);
        _assertBacked();
    }

    function test_depositWithAuthorization() public {
        vm.skip(!enabled);
        deal(USDT, alice, 10e6);
        bytes32 nonce = keccak256("fork-buy-1");
        uint256 validBefore = block.timestamp + 1 hours;
        bytes32 structHash = keccak256(abi.encode(RECEIVE_TYPEHASH, alice, address(vault), 10e6, 0, validBefore, nonce));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(alicePk, _digest(structHash));

        vm.prank(relayer);
        vault.depositWithAuthorization(alice, 10e6, 0, validBefore, nonce, v, r, s);

        assertEq(vault.balanceOf(alice), 10e6);
        _assertBacked();
    }

    /// Buy, connect, charge and pay the company out in real test USDT.
    function test_fullCycle() public {
        vm.skip(!enabled);
        deal(USDT, alice, 10e6);
        vm.startPrank(alice);
        usdt.approve(address(vault), 10e6);
        vault.deposit(alice, 10e6);
        vault.approveApp(alice, app, 2e6, 0, keccak256("connect"), 0, "");
        vm.stopPrank();

        vm.prank(operator);
        vault.charge(alice, app, 400_000, "job-1"); // 40 credits, $0.40
        vm.prank(payout);
        vault.payout(app);

        assertEq(usdt.balanceOf(payout), 380_000); // $0.38 after the 5% fee
        _assertBacked();
    }

    function _digest(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", IERC20Permit(USDT).DOMAIN_SEPARATOR(), structHash));
    }

    function _assertBacked() internal view {
        (bool backed, uint256 held, uint256 owed) = vault.checkBacking();
        assertTrue(backed);
        assertEq(held, owed);
    }
}
