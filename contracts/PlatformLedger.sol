// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PlatformLedger
 * @notice Centralized RMB ledger (amounts in fen: 1 RMB = 100 fen) + username/password auth.
 *         Passwords are NEVER stored in plaintext. Stored as:
 *           usernameHash = keccak256(bytes(username))
 *           passwordHash = keccak256(abi.encodePacked(username, bytes1(0), password))
 *
 * Dual roles (set in constructor, transferable):
 * - operator: registerUser, depositByAdmin, consume, setRate, pause/unpause, role transfer
 * - withdrawer: only withdrawToken / withdrawUSDT (cannot credit/debit/rate/register)
 *
 * USDT deposit math (rateScaled = 660 means 6.60 RMB per 1 whole USDT):
 *   rmbFen = usdtAmount * rateScaled / (10 ** usdtDecimals)
 */

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract PlatformLedger {
    address public operator;
    address public withdrawer;

    IERC20 public immutable usdt;
    uint8 public immutable usdtDecimals;

    /// @notice RMB fen per 1 whole USDT, scaled by 100. Default 660 => 6.60 RMB/USDT.
    uint256 public rateScaled;

    bool public paused;

    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    /// @notice usernameHash => passwordHash (never plaintext)
    mapping(bytes32 => bytes32) public passwordOf;

    /// @notice usernameHash => registered flag
    mapping(bytes32 => bool) public isRegistered;

    /// @notice Backend account hash (usernameHash) => balance in fen
    mapping(bytes32 => uint256) public balanceOf;

    /// @notice Wallet users (USDT depositors) => balance in fen
    mapping(address => uint256) public walletBalanceOf;

    /// @notice Prevents duplicate deposit/consume by order id
    mapping(bytes32 => bool) public usedOrderIds;

    // -------------------------------------------------------------------------
    // Membership (permanent, keyed by usernameHash / account bytes32)
    // None=0, Basic=1, Gold=2, Diamond=3, Supreme=4
    // -------------------------------------------------------------------------

    enum MembershipLevel { None, Basic, Gold, Diamond, Supreme }

    /// @notice account (usernameHash) => membership level (0..4)
    mapping(bytes32 => uint8) public membershipLevel;

    event MembershipPurchased(
        bytes32 indexed userId,
        uint8 level,
        uint256 priceFen,
        bytes32 indexed orderId,
        address indexed caller
    );
    event MembershipSet(bytes32 indexed userId, uint8 level, address indexed caller);

    error InvalidMembershipLevel(uint8 level);
    error MembershipAlreadyAtOrAbove(uint8 current, uint8 requested);

    event Registered(bytes32 indexed usernameHash, address indexed caller);
    event Deposited(bytes32 indexed userId, uint256 amountFen, bytes32 indexed orderId, address indexed caller);
    event Consumed(bytes32 indexed userId, uint256 amountFen, bytes32 indexed orderId, address indexed caller);
    event UsdtDeposited(address indexed wallet, uint256 usdtAmount, uint256 rmbFen, uint256 rateScaledUsed);
    event UsdtDepositedToAccount(bytes32 indexed userId, address indexed payer, uint256 usdtAmount, uint256 rmbFen, uint256 rateScaledUsed);
    event Withdrawn(address indexed token, address indexed to, uint256 amount, address indexed caller);
    event RateUpdated(uint256 oldRate, uint256 newRate, address indexed caller);
    event Paused(address indexed caller);
    event Unpaused(address indexed caller);
    event RoleTransferred(bytes32 indexed role, address indexed previous, address indexed next);

    bytes32 public constant ROLE_OPERATOR = keccak256("OPERATOR");
    bytes32 public constant ROLE_WITHDRAWER = keccak256("WITHDRAWER");

    error ZeroAddress();
    error Unauthorized();
    error ContractPaused();
    error ContractNotPaused();
    error OrderAlreadyUsed(bytes32 orderId);
    error InsufficientBalance(uint256 have, uint256 need);
    error InvalidAmount();
    error InvalidRate();
    error TransferFailed();
    error Reentrant();
    error EmptyUsername();
    error EmptyPassword();
    error AlreadyRegistered(bytes32 usernameHash);
    error NotRegistered(bytes32 usernameHash);

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier onlyWithdrawer() {
        if (msg.sender != withdrawer) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier nonReentrant() {
        if (_status == _ENTERED) revert Reentrant();
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    constructor(
        address _operator,
        address _withdrawer,
        address _usdt,
        uint8 _usdtDecimals
    ) {
        if (_operator == address(0) || _withdrawer == address(0) || _usdt == address(0)) {
            revert ZeroAddress();
        }
        operator = _operator;
        withdrawer = _withdrawer;
        usdt = IERC20(_usdt);
        usdtDecimals = _usdtDecimals;
        rateScaled = 660; // 6.60 RMB per USDT
        _status = _NOT_ENTERED;
    }

    // -------------------------------------------------------------------------
    // Auth / registration
    // -------------------------------------------------------------------------

    function hashUsername(string calldata username) public pure returns (bytes32) {
        return keccak256(bytes(username));
    }

    function hashPassword(string calldata username, string calldata password) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(username, bytes1(0), password));
    }

    /**
     * @notice Operator-assisted registration (backend pays gas). Hashes must be precomputed.
     */
    function registerUser(bytes32 usernameHash, bytes32 passwordHash) external onlyOperator whenNotPaused {
        if (usernameHash == bytes32(0)) revert EmptyUsername();
        if (passwordHash == bytes32(0)) revert EmptyPassword();
        if (isRegistered[usernameHash]) revert AlreadyRegistered(usernameHash);
        isRegistered[usernameHash] = true;
        passwordOf[usernameHash] = passwordHash;
        emit Registered(usernameHash, msg.sender);
    }

    /**
     * @notice Public self-registration (caller pays gas). Hashes internally — no plaintext stored.
     */
    function register(string calldata username, string calldata password) external whenNotPaused {
        if (bytes(username).length == 0) revert EmptyUsername();
        if (bytes(password).length == 0) revert EmptyPassword();
        bytes32 usernameHash = hashUsername(username);
        if (isRegistered[usernameHash]) revert AlreadyRegistered(usernameHash);
        bytes32 passwordHash = hashPassword(username, password);
        isRegistered[usernameHash] = true;
        passwordOf[usernameHash] = passwordHash;
        emit Registered(usernameHash, msg.sender);
    }

    /**
     * @notice View login check. Returns true iff username is registered and password matches.
     */
    function verifyLogin(string calldata username, string calldata password) external view returns (bool) {
        if (bytes(username).length == 0 || bytes(password).length == 0) return false;
        bytes32 usernameHash = hashUsername(username);
        if (!isRegistered[usernameHash]) return false;
        return passwordOf[usernameHash] == hashPassword(username, password);
    }

    function verifyLoginHash(bytes32 usernameHash, bytes32 passwordHash) external view returns (bool) {
        if (usernameHash == bytes32(0) || passwordHash == bytes32(0)) return false;
        if (!isRegistered[usernameHash]) return false;
        return passwordOf[usernameHash] == passwordHash;
    }

    function getBalance(bytes32 usernameHash) external view returns (uint256) {
        return balanceOf[usernameHash];
    }

    function balanceOfUsername(string calldata username) external view returns (uint256) {
        return balanceOf[hashUsername(username)];
    }

    // -------------------------------------------------------------------------
    // Operator: fiat deposit / consume / rate / pause
    // -------------------------------------------------------------------------

    function depositByAdmin(
        bytes32 userId,
        uint256 amountFen,
        bytes32 orderId
    ) external onlyOperator whenNotPaused {
        if (amountFen == 0) revert InvalidAmount();
        if (usedOrderIds[orderId]) revert OrderAlreadyUsed(orderId);
        usedOrderIds[orderId] = true;
        balanceOf[userId] += amountFen;
        emit Deposited(userId, amountFen, orderId, msg.sender);
    }

    function consume(
        bytes32 userId,
        uint256 amountFen,
        bytes32 orderId
    ) external onlyOperator whenNotPaused {
        if (amountFen == 0) revert InvalidAmount();
        if (usedOrderIds[orderId]) revert OrderAlreadyUsed(orderId);
        uint256 bal = balanceOf[userId];
        if (bal < amountFen) revert InsufficientBalance(bal, amountFen);
        usedOrderIds[orderId] = true;
        unchecked {
            balanceOf[userId] = bal - amountFen;
        }
        emit Consumed(userId, amountFen, orderId, msg.sender);
    }

    function setRate(uint256 newRateScaled) external onlyOperator {
        if (newRateScaled == 0) revert InvalidRate();
        uint256 old = rateScaled;
        rateScaled = newRateScaled;
        emit RateUpdated(old, newRateScaled, msg.sender);
    }

    function pause() external onlyOperator {
        if (paused) revert ContractPaused();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOperator {
        if (!paused) revert ContractNotPaused();
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOperator(address newOperator) external onlyOperator {
        if (newOperator == address(0)) revert ZeroAddress();
        address prev = operator;
        operator = newOperator;
        emit RoleTransferred(ROLE_OPERATOR, prev, newOperator);
    }

    // -------------------------------------------------------------------------
    // User: USDT => RMB fen (wallet balance)
    // -------------------------------------------------------------------------

    function depositUSDT(uint256 usdtAmount) external whenNotPaused nonReentrant {
        if (usdtAmount == 0) revert InvalidAmount();
        uint256 scale = 10 ** uint256(usdtDecimals);
        uint256 rmbFen = (usdtAmount * rateScaled) / scale;
        if (rmbFen == 0) revert InvalidAmount();

        bool ok = usdt.transferFrom(msg.sender, address(this), usdtAmount);
        if (!ok) revert TransferFailed();

        walletBalanceOf[msg.sender] += rmbFen;
        emit UsdtDeposited(msg.sender, usdtAmount, rmbFen, rateScaled);
    }

    /**
     * @notice Pay USDT from msg.sender; credit RMB fen to a registered account (usernameHash).
     *         Frontend: logged-in user connects wallet, approve, then depositUSDTToAccount(usernameHash, amount).
     */
    function depositUSDTToAccount(bytes32 userId, uint256 usdtAmount) external whenNotPaused nonReentrant {
        if (usdtAmount == 0) revert InvalidAmount();
        if (!isRegistered[userId]) revert NotRegistered(userId);
        uint256 scale = 10 ** uint256(usdtDecimals);
        uint256 rmbFen = (usdtAmount * rateScaled) / scale;
        if (rmbFen == 0) revert InvalidAmount();

        bool ok = usdt.transferFrom(msg.sender, address(this), usdtAmount);
        if (!ok) revert TransferFailed();

        balanceOf[userId] += rmbFen;
        emit UsdtDepositedToAccount(userId, msg.sender, usdtAmount, rmbFen, rateScaled);
    }

    // -------------------------------------------------------------------------
    // Withdrawer only
    // -------------------------------------------------------------------------

    function withdrawToken(
        address token,
        address to,
        uint256 amount
    ) external onlyWithdrawer nonReentrant {
        if (token == address(0) || to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        bool ok = IERC20(token).transfer(to, amount);
        if (!ok) revert TransferFailed();
        emit Withdrawn(token, to, amount, msg.sender);
    }

    function withdrawUSDT(address to, uint256 amount) external onlyWithdrawer nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert InvalidAmount();
        bool ok = usdt.transfer(to, amount);
        if (!ok) revert TransferFailed();
        emit Withdrawn(address(usdt), to, amount, msg.sender);
    }

    function transferWithdrawer(address newWithdrawer) external onlyWithdrawer {
        if (newWithdrawer == address(0)) revert ZeroAddress();
        address prev = withdrawer;
        withdrawer = newWithdrawer;
        emit RoleTransferred(ROLE_WITHDRAWER, prev, newWithdrawer);
    }


    // -------------------------------------------------------------------------
    // Membership
    // -------------------------------------------------------------------------

    /// @notice List price in fen for each purchasable level (1..4). Level 0 = 0.
    function membershipPriceFen(uint8 level) public pure returns (uint256) {
        if (level == 0) return 0;
        if (level == 1) return 990;      // Basic 9.9 RMB
        if (level == 2) return 3990;     // Gold 39.9
        if (level == 3) return 9900;     // Diamond 99
        if (level == 4) return 39900;    // Supreme 399
        revert InvalidMembershipLevel(level);
    }

    /**
     * @notice Discount in basis points applied to the catalog list price (which is cost×3).
     *         Equiv. cost multipliers: guest/none 3.0x, Basic 2.7x, Gold 2.4x, Diamond 1.8x, Supreme 1.5x.
     */
    function membershipDiscountBps(uint8 level) public pure returns (uint256) {
        if (level == 0) return 10000; // 10 折 → 成本×3.0
        if (level == 1) return 9000;  // 9 折  → 成本×2.7
        if (level == 2) return 8000;  // 8 折  → 成本×2.4
        if (level == 3) return 6000;  // 6 折  → 成本×1.8
        if (level == 4) return 5000;  // 5 折  → 成本×1.5
        revert InvalidMembershipLevel(level);
    }

    function getMembership(bytes32 userId) external view returns (uint8 level, uint256 discountBps) {
        level = membershipLevel[userId];
        discountBps = membershipDiscountBps(level);
    }

    /// @notice Apply on-chain membership discount to a list-price fen (catalog = cost×3).
    function getPriceAfterDiscount(bytes32 userId, uint256 priceFen) external view returns (uint256) {
        uint8 level = membershipLevel[userId];
        uint256 bps = membershipDiscountBps(level);
        return (priceFen * bps) / 10000;
    }

    /**
     * @notice Upgrade charge: listPrice(newLevel) - listPrice(currentLevel).
     *         current=None → full list price. Reverts if newLevel is not a strict upgrade.
     */
    function getMembershipUpgradePrice(bytes32 userId, uint8 newLevel) public view returns (uint256) {
        if (newLevel == 0 || newLevel > 4) revert InvalidMembershipLevel(newLevel);
        uint8 current = membershipLevel[userId];
        if (newLevel <= current) revert MembershipAlreadyAtOrAbove(current, newLevel);
        uint256 newPrice = membershipPriceFen(newLevel);
        uint256 oldPrice = membershipPriceFen(current); // 0 when current==0
        return newPrice - oldPrice;
    }

    /**
     * @notice Purchase / upgrade membership. Charge = upgrade differential only.
     *         Same debit pattern as consume (orderId anti-replay). Upgrade-only.
     */
    function purchaseMembership(
        bytes32 userId,
        uint8 level,
        bytes32 orderId
    ) external onlyOperator whenNotPaused {
        if (level == 0 || level > 4) revert InvalidMembershipLevel(level);
        if (!isRegistered[userId]) revert NotRegistered(userId);
        uint8 current = membershipLevel[userId];
        if (level <= current) revert MembershipAlreadyAtOrAbove(current, level);
        if (usedOrderIds[orderId]) revert OrderAlreadyUsed(orderId);

        uint256 priceFen = membershipPriceFen(level) - membershipPriceFen(current);
        uint256 bal = balanceOf[userId];
        if (bal < priceFen) revert InsufficientBalance(bal, priceFen);

        usedOrderIds[orderId] = true;
        unchecked {
            balanceOf[userId] = bal - priceFen;
        }
        membershipLevel[userId] = level;
        emit MembershipPurchased(userId, level, priceFen, orderId, msg.sender);
        emit Consumed(userId, priceFen, orderId, msg.sender);
    }

    /// @notice Admin/test: set membership without charging.
    function setMembership(bytes32 userId, uint8 level) external onlyOperator {
        if (level > 4) revert InvalidMembershipLevel(level);
        membershipLevel[userId] = level;
        emit MembershipSet(userId, level, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function quoteUsdtToFen(uint256 usdtAmount) external view returns (uint256 rmbFen) {
        uint256 scale = 10 ** uint256(usdtDecimals);
        return (usdtAmount * rateScaled) / scale;
    }
}
