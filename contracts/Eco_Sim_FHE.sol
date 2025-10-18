pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EconomicSimulationInsiderTradingFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    // Custom errors
    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error BatchFull();
    error InvalidBatch();
    error StaleWrite();
    error InvalidStateHash();
    error AlreadyProcessed();
    error InvalidRequest();

    // Events
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownUpdated(uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event EncryptedSubmission(address indexed submitter, uint256 indexed batchId, bytes32 indexed encryptedData);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionComplete(uint256 indexed requestId, uint256 indexed batchId, uint256 aggregateValue);
    event InsiderInfoLeaked(uint256 indexed batchId, bytes32 encryptedInfo);

    // State
    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public currentBatchId;
    uint256 public modelVersion;

    mapping(address => bool) public isProvider;
    mapping(address => uint256) public lastActionAt;
    mapping(uint256 => Batch) public batches;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    // Structs
    struct Batch {
        bool isOpen;
        uint256 batchSize;
        uint256 submissionCount;
        euint32 aggregate;
        mapping(uint256 => bytes32) encryptedSubmissions;
    }

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    // Modifiers
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkCooldown() {
        if (block.timestamp < lastActionAt[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        lastActionAt[msg.sender] = block.timestamp;
        _;
    }

    // Constructor
    constructor() {
        owner = msg.sender;
        cooldownSeconds = 60; // Default cooldown of 60 seconds
        modelVersion = 1;
        _openNewBatch(1);
    }

    // Admin functions
    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        isProvider[provider] = false;
        emit ProviderRemoved(provider);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldown(uint256 newCooldown) external onlyOwner {
        cooldownSeconds = newCooldown;
        emit CooldownUpdated(newCooldown);
    }

    function openNewBatch() external onlyOwner {
        currentBatchId++;
        _openNewBatch(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        Batch storage batch = batches[batchId];
        if (!batch.isOpen) revert BatchClosed();
        batch.isOpen = false;
        emit BatchClosed(batchId);
    }

    // Insider trading simulation
    function leakInsiderInfo(uint256 batchId, euint32 encryptedInfo) external onlyOwner {
        // Store encrypted insider information for the batch
        batches[batchId].encryptedSubmissions[0] = FHE.toBytes32(encryptedInfo);
        emit InsiderInfoLeaked(batchId, FHE.toBytes32(encryptedInfo));
    }

    // Player submission
    function submitEncryptedData(uint256 batchId, euint32 encryptedData) external onlyProvider whenNotPaused checkCooldown {
        Batch storage batch = batches[batchId];
        if (!batch.isOpen) revert BatchClosed();
        if (batch.submissionCount >= batch.batchSize) revert BatchFull();

        uint256 nextIndex = ++batch.submissionCount;
        batch.encryptedSubmissions[nextIndex] = FHE.toBytes32(encryptedData);

        // Initialize aggregate if needed
        batch.aggregate = _initIfNeeded(batch.aggregate);
        // Aggregate encrypted data
        batch.aggregate = FHE.add(batch.aggregate, encryptedData);

        emit EncryptedSubmission(msg.sender, batchId, FHE.toBytes32(encryptedData));
    }

    // Decryption request
    function requestBatchDecryption(uint256 batchId) external onlyOwner whenNotPaused checkCooldown {
        Batch storage batch = batches[batchId];
        if (batch.submissionCount == 0) revert InvalidBatch();

        // Build ciphertext array for the batch aggregate
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(batch.aggregate);

        // Compute state hash for replay protection
        bytes32 stateHash = _hashCiphertexts(cts);

        // Request decryption
        uint256 requestId = FHE.requestDecryption(cts, this.onBatchDecrypted.selector);

        // Store decryption context
        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    // Decryption callback
    function onBatchDecrypted(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        DecryptionContext storage context = decryptionContexts[requestId];
        if (context.processed) revert AlreadyProcessed();

        Batch storage batch = batches[context.batchId];

        // Rebuild ciphertexts from current storage state
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(batch.aggregate);

        // Verify state consistency
        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != context.stateHash) {
            revert InvalidStateHash();
        }

        // Verify proof
        FHE.checkSignatures(requestId, cleartexts, proof);

        // Decode cleartext (single uint256 value)
        uint256 aggregateValue = abi.decode(cleartexts, (uint256));

        // Mark as processed and emit event
        context.processed = true;
        emit DecryptionComplete(requestId, context.batchId, aggregateValue);
    }

    // Internal helpers
    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 x) internal returns (euint32) {
        if (!FHE.isInitialized(x)) {
            x = FHE.asEuint32(0);
        }
        return x;
    }

    function _openNewBatch(uint256 batchId) internal {
        Batch storage batch = batches[batchId];
        batch.isOpen = true;
        batch.batchSize = 100; // Default batch size
        batch.submissionCount = 0;
        batch.aggregate = FHE.asEuint32(0);
        emit BatchOpened(batchId);
    }
}