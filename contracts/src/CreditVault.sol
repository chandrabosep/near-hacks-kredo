// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title CreditVault
/// @notice Holds USDT and every credit balance, app limit, hold, claim and payout.
/// 1 credit = $0.01 = 10,000 USDT units (6 decimals). All amounts are in USDT units.
/// Credits are created only when USDT arrives. There is no admin mint.
///
/// Backing invariant:
///   usdt.balanceOf(vault) >= totalBalances + totalHeld + totalClaims + totalEarnings + protocolFees
contract CreditVault is Ownable2Step, Pausable, EIP712 {
    using SafeERC20 for IERC20Metadata;

    uint256 public constant UNITS_PER_CREDIT = 10_000;
    /// @notice Highest network fee an app can be set to: 20%.
    uint16 public constant MAX_FEE_BPS = 2_000;
    uint256 internal constant BPS = 10_000;
    /// @notice Longest a hold can last. Caps how long even a leaked operator key could freeze credits.
    uint64 public constant MAX_HOLD_DURATION = 1 days;

    bytes32 public constant APPROVE_APP_TYPEHASH =
        keccak256("ApproveApp(address user,address app,uint256 limit,uint64 expiry,bytes32 nonce,uint256 deadline)");
    bytes32 public constant REVOKE_APP_TYPEHASH =
        keccak256("RevokeApp(address user,address app,bytes32 nonce,uint256 deadline)");

    struct Limit {
        uint128 remaining; // units the app may still charge
        uint64 expiry; // unix time the limit stops working (0 = never)
        uint32 version; // bumps on every approve and revoke
    }

    enum HoldStatus {
        None,
        Open,
        Captured,
        Released
    }

    struct Hold {
        address user;
        address app;
        uint128 amount;
        uint64 expiry;
        uint32 limitVersion; // the limit version when the hold was taken
        HoldStatus status;
    }

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

    /// @notice What each app may still charge each user, as signed by the user.
    mapping(address user => mapping(address app => Limit)) internal _limits;

    /// @notice Holds by id. The id is keccak256(app, ref), so the app knows it before the tx lands.
    mapping(bytes32 holdId => Hold) internal _holds;

    /// @notice USDT units each app has earned and not yet been paid out.
    mapping(address app => uint256 units) public earningsOf;

    /// @notice Charge references already used per app, so a retried transaction can't charge twice.
    mapping(address app => mapping(bytes32 ref => bool used)) public refUsed;

    /// @notice Used signature nonces. Unordered, so the relayer can submit in any order.
    mapping(address user => mapping(bytes32 nonce => bool used)) public nonceUsed;

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
    event AppApproved(address indexed user, address indexed app, uint256 limit, uint64 expiry);
    event AppRevoked(address indexed user, address indexed app);
    event Charged(address indexed user, address indexed app, bytes32 indexed ref, uint256 amount, uint256 fee);
    event Held(
        bytes32 indexed holdId, address indexed user, address indexed app, bytes32 ref, uint256 amount, uint64 expiry
    );
    event Captured(bytes32 indexed holdId, uint256 actual, uint256 fee, uint256 returned);
    event Released(bytes32 indexed holdId, uint256 amount, address by);

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
    error LimitTooHigh();
    error SignatureExpired();
    error NonceUsed();
    error BadSignature();
    error OverLimit();
    error LimitExpired();
    error OverMaxCharge();
    error InsufficientBalance();
    error ZeroRef();
    error RefUsed();
    error BadExpiry();
    error HoldNotOpen();
    error HoldExpired();
    error HoldNotExpired();
    error OverHeld();

    modifier onlyOperator() {
        if (!isOperator[msg.sender]) revert NotOperator();
        _;
    }

    modifier onlyOwnerOrOperator() {
        if (msg.sender != owner() && !isOperator[msg.sender]) revert NotOwnerOrOperator();
        _;
    }

    constructor(IERC20Metadata usdt_, address owner_, address operator_, address feeRecipient_)
        Ownable(owner_)
        EIP712("CreditVault", "1")
    {
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

    /// @notice Gasless buy with an EIP-2612 permit. The user signs a permit for this vault and
    /// anyone (normally our relayer) submits it. Credits always go to the signer.
    /// @dev The permit is wrapped in try/catch so a front-run permit doesn't block the deposit:
    /// the allowance is already set, and transferFrom still enforces it. A bad signature with
    /// no allowance fails at transferFrom. Side effect: a user who also gave the vault a
    /// standing allowance can be topped up from it by anyone, always to their own balance.
    /// Our apps only use exact-amount permits, which are spent in the same call.
    function depositWithPermit(address user, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        whenNotPaused
    {
        try IERC20Permit(address(usdt)).permit(user, address(this), amount, deadline, v, r, s) {} catch {}
        _pullAndCredit(user, user, amount);
    }

    /// @notice Gasless buy with an EIP-3009 ReceiveWithAuthorization signed by the user with
    /// `to` set to this vault. The token only lets the payee submit it, so nobody can move the
    /// USDT without crediting the signer, and the nonce can't be replayed.
    function depositWithAuthorization(
        address user,
        uint256 amount,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external whenNotPaused {
        if (user == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 before = usdt.balanceOf(address(this));
        IERC3009(address(usdt))
            .receiveWithAuthorization(user, address(this), amount, validAfter, validBefore, nonce, v, r, s);
        _credit(user, user, usdt.balanceOf(address(this)) - before);
    }

    // ---------------------------------------------------------------------
    // App limits (user-signed)
    // ---------------------------------------------------------------------

    /// @notice Sets how much `app` may charge `user` in total, replacing any earlier limit.
    /// The user calls it directly, or anyone submits it with the user's EIP-712 signature.
    /// @param expiry Unix time the limit stops working. 0 means it never expires.
    function approveApp(
        address user,
        address app,
        uint256 limit,
        uint64 expiry,
        bytes32 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused {
        _requireActiveApp(app);
        if (limit > type(uint128).max) revert LimitTooHigh();
        if (msg.sender != user) {
            _useSignature(
                user,
                keccak256(abi.encode(APPROVE_APP_TYPEHASH, user, app, limit, expiry, nonce, deadline)),
                nonce,
                deadline,
                signature
            );
        }
        Limit storage l = _limits[user][app];
        // forge-lint: disable-next-line(unsafe-typecast)
        l.remaining = uint128(limit);
        l.expiry = expiry;
        ++l.version;
        emit AppApproved(user, app, limit, expiry);
    }

    /// @notice Removes an app's limit. Works even while paused, so a user can always cut an app off.
    function revokeApp(address user, address app, bytes32 nonce, uint256 deadline, bytes calldata signature) external {
        if (msg.sender != user) {
            _useSignature(
                user, keccak256(abi.encode(REVOKE_APP_TYPEHASH, user, app, nonce, deadline)), nonce, deadline, signature
            );
        }
        Limit storage l = _limits[user][app];
        l.remaining = 0;
        l.expiry = 0;
        ++l.version;
        emit AppRevoked(user, app);
    }

    function limitOf(address user, address app) external view returns (Limit memory) {
        return _limits[user][app];
    }

    /// @notice EIP-712 domain separator for signing approve, revoke, send and claim messages.
    // forge-lint: disable-next-line(mixed-case-function)
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ---------------------------------------------------------------------
    // Charges
    // ---------------------------------------------------------------------

    /// @notice Instant charge for a finished action, such as one chat message.
    /// Operator only, and only within the limit the user signed for this app. The contract
    /// rejects anything above that limit, even from our own operator key.
    /// @param ref The app's unique id for this charge. A second charge with the same ref reverts.
    function charge(address user, address app, uint256 amount, bytes32 ref) external onlyOperator whenNotPaused {
        _useRef(app, ref);
        _consumeLimit(user, app, amount);
        _debit(user, amount);
        totalBalances -= amount;
        uint256 fee = _earn(app, amount);
        emit Charged(user, app, ref, amount, fee);
    }

    // ---------------------------------------------------------------------
    // Holds (long jobs)
    // ---------------------------------------------------------------------

    /// @notice Reserves credits at the start of a long job. Uses up the user's limit now.
    /// @param ref The app's unique id for this job. The hold id is keccak256(app, ref).
    /// @param expiry When the hold can be released by anyone. At most MAX_HOLD_DURATION away.
    function hold(address user, address app, uint256 amount, bytes32 ref, uint64 expiry)
        external
        onlyOperator
        whenNotPaused
        returns (bytes32 holdId)
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (expiry <= block.timestamp || expiry > block.timestamp + MAX_HOLD_DURATION) revert BadExpiry();
        _useRef(app, ref);
        _consumeLimit(user, app, amount);
        _debit(user, amount);
        totalBalances -= amount;
        totalHeld += amount;

        holdId = holdIdOf(app, ref);
        _holds[holdId] = Hold({
            user: user,
            app: app,
            // forge-lint: disable-next-line(unsafe-typecast)
            amount: uint128(amount), // fits: _consumeLimit checked it against a uint128 limit
            expiry: expiry,
            limitVersion: _limits[user][app].version,
            status: HoldStatus.Open
        });
        emit Held(holdId, user, app, ref, amount, expiry);
    }

    /// @notice The job succeeded. Charges `actual` (at most the held amount) and returns the rest.
    /// Only before the hold expires: after that the user can take it back.
    function capture(bytes32 holdId, uint256 actual) external onlyOperator whenNotPaused {
        Hold storage h = _holds[holdId];
        if (h.status != HoldStatus.Open) revert HoldNotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp >= h.expiry) revert HoldExpired();
        if (actual == 0) revert ZeroAmount();
        uint256 amount = h.amount;
        if (actual > amount) revert OverHeld();

        h.status = HoldStatus.Captured;
        totalHeld -= amount;
        uint256 returned = amount - actual;
        if (returned != 0) _returnToUser(h, returned);
        uint256 fee = _earn(h.app, actual);
        emit Captured(holdId, actual, fee, returned);
    }

    /// @notice The job failed, or the hold ran out. The operator can release at any time.
    /// After expiry anyone can, even while paused, so held credits always come back.
    function release(bytes32 holdId) external {
        Hold storage h = _holds[holdId];
        if (h.status != HoldStatus.Open) revert HoldNotOpen();
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < h.expiry && !isOperator[msg.sender]) revert HoldNotExpired();

        h.status = HoldStatus.Released;
        uint256 amount = h.amount;
        totalHeld -= amount;
        _returnToUser(h, amount);
        emit Released(holdId, amount, msg.sender);
    }

    function holdIdOf(address app, bytes32 ref) public pure returns (bytes32) {
        return keccak256(abi.encode(app, ref));
    }

    function getHold(bytes32 holdId) external view returns (Hold memory) {
        return _holds[holdId];
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

    /// @dev Marks a charge reference as used for this app.
    function _useRef(address app, bytes32 ref) internal {
        if (ref == bytes32(0)) revert ZeroRef();
        if (refUsed[app][ref]) revert RefUsed();
        refUsed[app][ref] = true;
    }

    /// @dev Checks the app, its per-charge cap and the user's signed limit, then lowers the limit.
    function _consumeLimit(address user, address app, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        App storage a = _requireActiveApp(app);
        if (a.maxCharge != 0 && amount > a.maxCharge) revert OverMaxCharge();
        Limit storage l = _limits[user][app];
        // forge-lint: disable-next-line(block-timestamp)
        if (l.expiry != 0 && block.timestamp >= l.expiry) revert LimitExpired();
        if (amount > l.remaining) revert OverLimit();
        // forge-lint: disable-next-line(unsafe-typecast)
        l.remaining -= uint128(amount);
    }

    /// @dev Gives unused held credits back to the user, and back to the app's limit only if the
    /// user hasn't approved or revoked since the hold. Otherwise a revoked app would regain a limit,
    /// or a new limit would grow past what the user signed.
    function _returnToUser(Hold storage h, uint256 amount) internal {
        balanceOf[h.user] += amount;
        totalBalances += amount;
        Limit storage l = _limits[h.user][h.app];
        // forge-lint: disable-next-line(unsafe-typecast)
        if (l.version == h.limitVersion) l.remaining += uint128(amount);
    }

    function _debit(address user, uint256 amount) internal {
        uint256 bal = balanceOf[user];
        if (amount > bal) revert InsufficientBalance();
        balanceOf[user] = bal - amount;
    }

    /// @dev Splits a captured amount between the app and the network fee. Returns the fee.
    function _earn(address app, uint256 amount) internal returns (uint256 fee) {
        fee = (amount * _apps[app].feeBps) / BPS;
        uint256 net = amount - fee;
        earningsOf[app] += net;
        totalEarnings += net;
        protocolFees += fee;
    }

    /// @dev Checks a user's EIP-712 signature and burns its nonce. Accepts EOA and ERC-1271 signers.
    function _useSignature(address user, bytes32 structHash, bytes32 nonce, uint256 deadline, bytes calldata signature)
        internal
    {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > deadline) revert SignatureExpired();
        if (nonceUsed[user][nonce]) revert NonceUsed();
        if (!SignatureChecker.isValidSignatureNow(user, _hashTypedDataV4(structHash), signature)) {
            revert BadSignature();
        }
        nonceUsed[user][nonce] = true;
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
