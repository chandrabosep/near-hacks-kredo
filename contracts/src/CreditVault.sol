// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title CreditVault
/// @notice Holds USDT and every credit balance, app limit, hold, claim and payout.
/// 1 credit = $0.01 = 10,000 USDT units (6 decimals). All amounts are in USDT units.
/// Credits are created only when USDT arrives. There is no admin mint.
///
/// Backing invariant:
///   usdt.balanceOf(vault) >= totalBalances + totalHeld + totalClaims + totalEarnings + protocolFees
contract CreditVault is Ownable2Step, Pausable {
    uint256 public constant UNITS_PER_CREDIT = 10_000;

    IERC20Metadata public immutable usdt;

    /// @notice Receives the network fees on withdrawFees().
    address public feeRecipient;

    /// @notice Relayer keys allowed to submit user-signed actions and app charges.
    mapping(address account => bool allowed) public isOperator;

    // Running totals of every liability the vault owes.
    uint256 public totalBalances;
    uint256 public totalHeld;
    uint256 public totalClaims;
    uint256 public totalEarnings;
    uint256 public protocolFees;

    event OperatorSet(address indexed account, bool allowed);
    event FeeRecipientSet(address indexed account);

    error NotOperator();
    error NotOwnerOrOperator();
    error ZeroAddress();
    error WrongDecimals();
    error RenounceDisabled();

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
