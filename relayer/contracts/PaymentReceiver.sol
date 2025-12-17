// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PaymentReceiver
 * @notice Receives ETH payments on Sepolia and emits events for the relayer
 * 
 * Flow:
 * 1. User calls pay() with their Stacks agent address
 * 2. Contract receives ETH
 * 3. Contract emits PaymentInitiated event
 * 4. Relayer watches for events and processes on Stacks
 */
contract PaymentReceiver {
    // ============================================================================
    // EVENTS
    // ============================================================================
    
    event PaymentInitiated(
        bytes32 indexed intentId,
        address indexed sender,
        uint256 amount,
        string stacksAgent,
        bytes32 txHash
    );
    
    // ============================================================================
    // STATE
    // ============================================================================
    
    address public owner;
    uint256 public totalPayments;
    mapping(bytes32 => bool) public processedIntents;
    
    // ============================================================================
    // MODIFIERS
    // ============================================================================
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================
    
    constructor() {
        owner = msg.sender;
    }
    
    // ============================================================================
    // MAIN FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Receive ETH payment and emit event for relayer
     * @param stacksAgent Stacks principal address (e.g., "ST2N6HZJPPQ8VGJZGPPP8754CFNGWKBHVAZ85QB6K")
     * @return intentId Unique payment intent identifier
     */
    function pay(string calldata stacksAgent) external payable returns (bytes32) {
        require(msg.value > 0, "Must send ETH");
        require(bytes(stacksAgent).length > 0, "Stacks agent required");
        
        // Generate unique intent ID
        bytes32 intentId = keccak256(
            abi.encodePacked(
                block.timestamp,
                msg.sender,
                msg.value,
                stacksAgent,
                totalPayments
            )
        );
        
        // Prevent duplicate processing
        require(!processedIntents[intentId], "Intent already processed");
        processedIntents[intentId] = true;
        
        totalPayments++;
        
        // Emit event for relayer to pick up
        emit PaymentInitiated(
            intentId,
            msg.sender,
            msg.value,
            stacksAgent,
            blockhash(block.number - 1) // Reference to previous block
        );
        
        return intentId;
    }
    
    /**
     * @notice Receive ETH directly (fallback)
     */
    receive() external payable {
        revert("Use pay(string) function");
    }
    
    // ============================================================================
    // ADMIN FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Withdraw collected ETH (owner only)
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = owner.call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    /**
     * @notice Transfer ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        owner = newOwner;
    }
    
    // ============================================================================
    // VIEW FUNCTIONS
    // ============================================================================
    
    /**
     * @notice Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}


