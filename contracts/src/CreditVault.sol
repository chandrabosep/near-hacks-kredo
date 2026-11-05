// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title CreditVault
/// @notice Holds USDT and every credit balance, app limit, hold, claim and payout.
/// 1 credit = $0.01 = 10,000 USDT units (6 decimals). All amounts are in USDT units.
/// Credits are created only when USDT arrives. There is no admin mint.
///
/// Backing invariant:
///   usdt.balanceOf(vault) >= totalBalances + totalHeld + totalClaims + totalEarnings + protocolFees
contract CreditVault is Ownable2Step, Pausable {
    using SafeERC20 for IERC20Metadata;

    uint256 public constant UNITS_PER_CREDIT = 10_000;
    /// @notice Highest network fee an app can be set to: 20%.
    uint16 public constant MAX_FEE_BPS = 2_000;

    struct App {
        address payout; // receives the company's USDT earnings
        uint16 feeBps; // network fee taken from the company's share of each charge
        uint128 maxCharge; // largest single charge or hold, in units (0 = no cap)
        bool active;
    }

    IERC20Metadata public immutable usdt;

    /// @notice Receives the network fees on withdrawFees().
    address public feeRecipient;

    /// @notice Relayer keys allowed to submit user-signed actions and app charges.
    mapping(address account => bool allowed) public isOperator;

    /// @notice Registered apps, keyed by the app's id address.
    mapping(address app => App) internal _apps;

    /// @notice Spendable credits per user, in units.
    mapping(address user => uint256 units) public balanceOf;

    // Running totals of every liability the vault owes.
    uint256 public totalBalances;
    uint256 public totalHeld;
    uint256 public totalClaims;
    uint256 public totalEarnings;
    uint256 public protocolFees;

    event OperatorSet(address indexed account, bool allowed);
    event FeeRecipientSet(address indexed account);
    event AppRegistered(address indexed app, address payout, uint16 feeBps, uint128 maxCharge);
    event AppTermsSet(address indexed app, uint16 feeBps, uint128 maxCharge);
    event AppPayoutSet(address indexed app, address payout);
    event AppActiveSet(address indexed app, bool active);
    event Deposited(address indexed user, address indexed payer, uint256 amount);

    error NotOperator();
    error NotOwnerOrOperator();
    error ZeroAddress();
    error WrongDecimals();
    error RenounceDisabled();
    error AppExists();
    error UnknownApp();
    error AppInactive();
    error FeeTooHigh();
    error NotAuthorized();
    error ZeroAmount();

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    modifier onlyOwnerOrOperator() {
        if (msg.sender != owner() && !isOperator[msg.sender]) revert NotOwnerOrOperator();
        _;
    }

    constructor(IERC20Metadata usdt_, address owner_, address operator_, address feeRecipient_) Ownable(owner_) {
        if (address(usdt_) == address(0)) revert ZeroAddress();
        // UNITS_PER_CREDIT assumes 6 decimals. Refuse any other token.
        if (usdt_.decimals() != 6) revert WrongDecimals();
        usdt = usdt_;
        if (operator_ != address(0)) _setOperator(operator_, true);
        _setFeeRecipient(feeRecipient_);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setOperator(address account, bool allowed) external onlyOwner {
        _setOperator(account, allowed);
    }

    function setFeeRecipient(address account) external onlyOwner {
        _setFeeRecipient(account);
    }

    /// @notice Owner or any operator can pause, so the relayer can stop itself.
    function pause() external onlyOwnerOrOperator {
        _pause();
    }

    /// @notice Only the owner can resume.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Disabled. Without an owner nobody could unpause or rotate operators.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------------
    // App registry
    // ---------------------------------------------------------------------

    /// @notice Registers a company's app. The backend calls this when a company signs up.
    /// A registered app still can't charge anyone until that user signs a limit for it.
    function registerApp(address app, address payout, uint16 feeBps, uint128 maxCharge) external onlyOwnerOrOperator {
        if (app == address(0) || payout == address(0)) revert ZeroAddress();
        if (_apps[app].payout != address(0)) revert AppExists();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        _apps[app] = App({payout: payout, feeBps: feeBps, maxCharge: maxCharge, active: true});
        emit AppRegistered(app, payout, feeBps, maxCharge);
    }

    /// @notice Changes an app's fee and per-charge cap. Owner only, so a leaked operator
    /// key can't raise a company's fee.
    function setAppTerms(address app, uint16 feeBps, uint128 maxCharge) external onlyOwner {
        App storage a = _requireApp(app);
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        a.feeBps = feeBps;
        a.maxCharge = maxCharge;
        emit AppTermsSet(app, feeBps, maxCharge);
    }

    /// @notice Moves an app's payouts to a new address. Only the current payout address
    /// or the owner can do this, never an operator.
    function setAppPayout(address app, address payout) external {
        App storage a = _requireApp(app);
        if (msg.sender != a.payout && msg.sender != owner()) revert NotAuthorized();
        if (payout == address(0)) revert ZeroAddress();
        a.payout = payout;
        emit AppPayoutSet(app, payout);
    }

    /// @notice An inactive app can't charge or hold, but can still refund and be paid out.
    function setAppActive(address app, bool active) external onlyOwnerOrOperator {
        _requireApp(app).active = active;
        emit AppActiveSet(app, active);
    }

    function getApp(address app) external view returns (App memory) {
        return _apps[app];
    }

    // ---------------------------------------------------------------------
    // Deposits
    // ---------------------------------------------------------------------

    /// @notice Pulls `amount` USDT from the caller and credits `user`. Anyone can pay for anyone.
    /// This is the only way credits are created.
    function deposit(address user, uint256 amount) external whenNotPaused {
        _pullAndCredit(msg.sender, user, amount);
    }

    // ---------------------------------------------------------------------
    // Backing
    // ---------------------------------------------------------------------

    /// @notice Everything the vault owes, in USDT units.
    function totalLiabilities() public view returns (uint256) {
        return totalBalances + totalHeld + totalClaims + totalEarnings + protocolFees;
    }

    /// @notice True when the vault holds at least as much USDT as it owes.
    /// USDT sent to the vault directly, outside a deposit, shows up as surplus.
    function checkBacking() external view returns (bool backed, uint256 held, uint256 owed) {
        held = usdt.balanceOf(address(this));
        owed = totalLiabilities();
        backed = held >= owed;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Credits are only created after the USDT is in the vault.
    function _pullAndCredit(address payer, address user, uint256 amount) internal {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 before = usdt.balanceOf(address(this));
        usdt.safeTransferFrom(payer, address(this), amount);
        _credit(user, payer, usdt.balanceOf(address(this)) - before);
    }

    /// @dev Credits exactly what arrived, so a token-side transfer fee can never under-back credits.
    function _credit(address user, address payer, uint256 received) internal {
        if (received == 0) revert ZeroAmount();
        balanceOf[user] += received;
        totalBalances += received;
        emit Deposited(user, payer, received);
    }

    function _requireApp(address app) internal view returns (App storage a) {
        a = _apps[app];
        if (a.payout == address(0)) revert UnknownApp();
    }

    function _requireActiveApp(address app) internal view returns (App storage a) {
        a = _requireApp(app);
        if (!a.active) revert AppInactive();
    }

    function _setFeeRecipient(address account) private {
        if (account == address(0)) revert ZeroAddress();
        feeRecipient = account;
        emit FeeRecipientSet(account);
    }

    function _setOperator(address account, bool allowed) private {
        if (account == address(0)) revert ZeroAddress();
        isOperator[account] = allowed;
        emit OperatorSet(account, allowed);
    }
}
