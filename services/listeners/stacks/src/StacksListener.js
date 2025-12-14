"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StacksListener = void 0;
const BaseListener_1 = require("../../shared/src/BaseListener");
const logger_1 = require("@shared/utils/logger");
const axios_1 = __importDefault(require("axios"));
class StacksListener extends BaseListener_1.BaseListener {
    lastProcessedBlock = 0;
    pollingInterval;
    apiUrl;
    constructor(config) {
        super(config);
        this.apiUrl = config.rpcUrl || 'https://api.hiro.so';
    }
    async start() {
        this.isRunning = true;
        logger_1.logger.info(`Starting Stacks listener for ${this.config.addresses.length} addresses`);
        this.pollBlocks();
    }
    async stop() {
        this.isRunning = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        logger_1.logger.info('Stopping Stacks listener');
    }
    async pollBlocks() {
        while (this.isRunning) {
            try {
                const response = await axios_1.default.get(`${this.apiUrl}/v2/info`);
                const currentBlock = response.data.stacks_tip_height;
                if (currentBlock > this.lastProcessedBlock) {
                    await this.processBlock(currentBlock);
                    this.lastProcessedBlock = currentBlock;
                }
                await new Promise((resolve) => setTimeout(resolve, 600000)); // Poll every 10 minutes (Stacks blocks are ~10 min)
            }
            catch (error) {
                logger_1.logger.error('Error polling Stacks blocks', error);
                await new Promise((resolve) => setTimeout(resolve, 60000)); // Retry after 1 minute
            }
        }
    }
    async processBlock(blockNumber) {
        try {
            const response = await axios_1.default.get(`${this.apiUrl}/v2/blocks/${blockNumber}`);
            const block = response.data;
            if (!block || !block.transactions)
                return;
            for (const tx of block.transactions) {
                // Check for STX transfers
                if (tx.tx_type === 'token_transfer') {
                    const recipient = tx.token_transfer.recipient_address;
                    if (this.config.addresses.includes(recipient)) {
                        const chainEvent = {
                            chain: 'stacks',
                            txHash: tx.tx_id,
                            blockNumber: blockNumber,
                            blockHash: block.hash,
                            from: tx.sender_address,
                            to: recipient,
                            amount: (parseInt(tx.token_transfer.amount) / 1e6).toString(), // STX has 6 decimals
                            amountUSD: await this.convertToUSD('STX', (parseInt(tx.token_transfer.amount) / 1e6).toString()),
                            timestamp: block.burn_block_time * 1000,
                            confirmations: 1,
                        };
                        await this.handleEvent(chainEvent);
                    }
                }
                // Check for contract calls that might be token transfers
                // This is simplified - would need to check actual token contract calls
            }
        }
        catch (error) {
            logger_1.logger.error(`Error processing Stacks block ${blockNumber}`, error);
        }
    }
}
exports.StacksListener = StacksListener;
//# sourceMappingURL=StacksListener.js.map