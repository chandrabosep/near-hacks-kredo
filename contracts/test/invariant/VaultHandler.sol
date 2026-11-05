// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CreditVault} from "../../src/CreditVault.sol";
import {MockUSDT} from "../../src/mocks/MockUSDT.sol";

/// @notice Drives random sequences of every vault action. Inputs are bounded to valid values
/// so most calls land, and ghost variables track what the totals should be.
contract VaultHandler is Test {
    CreditVault public vault;
    MockUSDT public usdt;
    address operator;
    address owner;

    address[] public users;
    address[] public apps;
    address[] public payouts;

    bytes32[] public holdIds;
    uint256[] public claimKeyPks;

    uint256 public ghostDeposited;
    uint256 public ghostPaidOut;
    uint256 public ghostFeesWithdrawn;
    uint256 nonceCounter;

    constructor(CreditVault vault_, MockUSDT usdt_, address owner_, address operator_) {
        vault = vault_;
        usdt = usdt_;
        owner = owner_;
        operator = operator_;
        for (uint256 i; i < 4; ++i) {
            users.push(makeAddr(string.concat("user", vm.toString(i))));
        }
        for (uint256 i; i < 2; ++i) {
            address app = makeAddr(string.concat("app", vm.toString(i)));
            address payout = makeAddr(string.concat("payout", vm.toString(i)));
            apps.push(app);
            payouts.push(payout);
            vm.prank(operator);
            vault.registerApp(app, payout, uint16(300 + i * 700), 0); // 3% and 10%
        }
    }

    function usersLength() external view returns (uint256) {
        return users.length;
    }

    function appsLength() external view returns (uint256) {
        return apps.length;
    }

    function holdsLength() external view returns (uint256) {
        return holdIds.length;
    }

    function claimsLength() external view returns (uint256) {
        return claimKeyPks.length;
    }

    // ---------------------------------------------------------------- actions

    function deposit(uint256 userSeed, uint256 amount) external {
        address user = _user(userSeed);
        amount = bound(amount, 1, 100e6);
        usdt.mint(user, amount);
        vm.startPrank(user);
        usdt.approve(address(vault), amount);
        vault.deposit(user, amount);
        vm.stopPrank();
        ghostDeposited += amount;
    }

    function approve(uint256 userSeed, uint256 appSeed, uint256 limit) external {
        address user = _user(userSeed);
        limit = bound(limit, 0, 1_000e6);
        vm.prank(user);
        vault.approveApp(user, _app(appSeed), limit, 0, _nonce(), 0, "");
    }

    function revoke(uint256 userSeed, uint256 appSeed) external {
        address user = _user(userSeed);
        vm.prank(user);
        vault.revokeApp(user, _app(appSeed), _nonce(), 0, "");
    }

    function charge(uint256 userSeed, uint256 appSeed, uint256 amount) external {
        address user = _user(userSeed);
        address app = _app(appSeed);
        uint256 max = _spendable(user, app);
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(operator);
        vault.charge(user, app, amount, _nonce());
    }

    function hold(uint256 userSeed, uint256 appSeed, uint256 amount) external {
        address user = _user(userSeed);
        address app = _app(appSeed);
        uint256 max = _spendable(user, app);
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(operator);
        holdIds.push(vault.hold(user, app, amount, _nonce(), uint64(block.timestamp + 1 hours)));
    }

    function capture(uint256 holdSeed, uint256 actual) external {
        if (holdIds.length == 0) return;
        bytes32 id = holdIds[holdSeed % holdIds.length];
        CreditVault.Hold memory h = vault.getHold(id);
        if (h.status != CreditVault.HoldStatus.Open || block.timestamp >= h.expiry) return;
        actual = bound(actual, 1, h.amount);
        vm.prank(operator);
        vault.capture(id, actual);
    }

    function release(uint256 holdSeed, bool byStranger) external {
        if (holdIds.length == 0) return;
        bytes32 id = holdIds[holdSeed % holdIds.length];
        CreditVault.Hold memory h = vault.getHold(id);
        if (h.status != CreditVault.HoldStatus.Open) return;
        if (byStranger && block.timestamp < h.expiry) vm.warp(h.expiry);
        vm.prank(byStranger ? address(0xBEEF) : operator);
        vault.release(id);
    }

    function refund(uint256 userSeed, uint256 appSeed, uint256 amount) external {
        address user = _user(userSeed);
        address app = _app(appSeed);
        uint256 max = _min(vault.spentOf(user, app), vault.earningsOf(app));
        if (max == 0) return;
        amount = bound(amount, 1, max);
        vm.prank(operator);
        vault.refund(app, user, amount, _nonce());
    }

    function send(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _user(fromSeed);
        uint256 bal = vault.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(from);
        vault.send(from, _user(toSeed), amount, _nonce(), 0, "");
    }

    function createClaim(uint256 userSeed, uint256 amount) external {
        address from = _user(userSeed);
        uint256 bal = vault.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        uint256 pk = uint256(keccak256(abi.encode("claim", claimKeyPks.length))) % (2 ** 128) + 1;
        vm.prank(from);
        vault.createClaim(from, amount, vm.addr(pk), uint64(block.timestamp + 7 days), _nonce(), 0, "");
        claimKeyPks.push(pk);
    }

    function claim(uint256 claimSeed, uint256 toSeed) external {
        if (claimKeyPks.length == 0) return;
        uint256 pk = claimKeyPks[claimSeed % claimKeyPks.length];
        address key = vm.addr(pk);
        CreditVault.Claim memory c = vault.getClaim(key);
        if (c.status != CreditVault.ClaimStatus.Open || block.timestamp >= c.expiry) return;
        address to = _user(toSeed);
        bytes32 structHash = keccak256(abi.encode(vault.REDEEM_CLAIM_TYPEHASH(), key, to));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", vault.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        vault.claim(key, to, abi.encodePacked(r, s, v));
    }

    function cancelClaim(uint256 claimSeed) external {
        if (claimKeyPks.length == 0) return;
        address key = vm.addr(claimKeyPks[claimSeed % claimKeyPks.length]);
        CreditVault.Claim memory c = vault.getClaim(key);
        if (c.status != CreditVault.ClaimStatus.Open) return;
        vm.prank(c.from);
        vault.cancelClaim(key);
    }

    function payout(uint256 appSeed) external {
        uint256 i = appSeed % apps.length;
        if (vault.earningsOf(apps[i]) == 0) return;
        vm.prank(payouts[i]);
        ghostPaidOut += vault.payout(apps[i]);
    }

    function withdrawFees() external {
        if (vault.protocolFees() == 0) return;
        vm.prank(owner);
        ghostFeesWithdrawn += vault.withdrawFees();
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 hours));
    }

    // ---------------------------------------------------------------- helpers

    function _spendable(address user, address app) internal view returns (uint256) {
        CreditVault.Limit memory l = vault.limitOf(user, app);
        return _min(l.remaining, vault.balanceOf(user));
    }

    function _user(uint256 seed) internal view returns (address) {
        return users[seed % users.length];
    }

    function _app(uint256 seed) internal view returns (address) {
        return apps[seed % apps.length];
    }

    function _nonce() internal returns (bytes32) {
        return keccak256(abi.encode("nonce", ++nonceCounter));
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
