"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthereumListener = void 0;
const ethers_1 = require("ethers");
const BaseListener_1 = require("../../shared/src/BaseListener");
const logger_1 = require("@shared/utils/logger");
const chains_1 = require("@shared/constants/chains");
class EthereumListener extends BaseListener_1.BaseListener {
    provider;
    contracts = new Map();
    lastProcessedBlock = 0;
    pollingInterval;
    constructor(config) {
        super(config);
        this.provider = new ethers_1.ethers.JsonRpcProvider(config.rpcUrl);
    }
    async start() {
        this.isRunning = true;
        logger_1.logger.info(`Starting Ethereum listener for ${this.config.addresses.length} addresses`);
        // Set up contract listeners for ERC20 tokens
        await this.setupContractListeners();
        // Start block polling
        this.pollBlocks();
    }
    async stop() {
        this.isRunning = false;
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        logger_1.logger.info('Stopping Ethereum listener');
    }
    async setupContractListeners() {
        const tokens = [
            { address: chains_1.TOKEN_ADDRESSES.ethereum.USDC, symbol: 'USDC', decimals: 6 },
            { address: chains_1.TOKEN_ADDRESSES.ethereum.USDT, symbol: 'USDT', decimals: 6 },
            { address: chains_1.TOKEN_ADDRESSES.ethereum.WETH, symbol: 'WETH', decimals: 18 },
        ];
        for (const token of tokens) {
            try {
                const contract = new ethers_1.ethers.Contract(token.address, ['event Transfer(address indexed from, address indexed to, uint256 value)'], this.provider);
                contract.on('Transfer', async (from, to, value, event) => {
                    if (this.config.addresses.includes(to.toLowerCase())) {
                        await this.handleTransfer({
                            chain: 'ethereum',
                            txHash: event.transactionHash,
                            blockNumber: event.blockNumber,
                            blockHash: event.blockHash,
                            from: from.toLowerCase(),
                            to: to.toLowerCase(),
                            tokenAddress: token.address,
                            amount: ethers_1.ethers.formatUnits(value, token.decimals),
                            amountUSD: await this.convertToUSD(token.symbol, ethers_1.ethers.formatUnits(value, token.decimals)),
                            timestamp: Date.now(),
                            confirmations: 0,
                        });
                    }
                });
                this.contracts.set(token.address, contract);
            }
            catch (error) {
                logger_1.logger.error(`Failed to setup listener for ${token.symbol}`, error);
            }
        }
    }
    async handleTransfer(event) {
        try {
            const currentBlock = await this.provider.getBlockNumber();
            const confirmations = currentBlock - (event.blockNumber || 0);
            const chainEvent = {
                chain: 'ethereum',
                txHash: event.txHash || '',
                blockNumber: event.blockNumber || 0,
                blockHash: event.blockHash || '',
                from: event.from || '',
                to: event.to || '',
                tokenAddress: event.tokenAddress,
                amount: event.amount || '0',
                amountUSD: event.amountUSD || 0,
                timestamp: event.timestamp || Date.now(),
                confirmations,
            };
            await this.handleEvent(chainEvent);
        }
        catch (error) {
            logger_1.logger.error('Error handling transfer', error);
        }
    }
    async pollBlocks() {
        while (this.isRunning) {
            try {
                const currentBlock = await this.provider.getBlockNumber();
                if (currentBlock > this.lastProcessedBlock) {
                    await this.processBlock(currentBlock);
                    this.lastProcessedBlock = currentBlock;
                }
                await new Promise((resolve) => setTimeout(resolve, 12000)); // Poll every 12 seconds
            }
            catch (error) {
                logger_1.logger.error('Error polling blocks', error);
                await new Promise((resolve) => setTimeout(resolve, 30000)); // Retry after 30s
            }
        }
    }
    async processBlock(blockNumber) {
        try {
            const block = await this.provider.getBlock(blockNumber, true);
            if (!block || !block.transactions)
                return;
            for (const tx of block.transactions) {
                if (typeof tx === 'string')
                    continue;
                // Type guard: ensure tx is a TransactionResponse
                const transaction = tx;
                if (!transaction.to || !transaction.from)
                    continue;
                if (this.config.addresses.includes(transaction.to.toLowerCase())) {
                    const value = transaction.value || 0n;
                    if (value > 0) {
                        await this.handleTransfer({
                            chain: 'ethereum',
                            txHash: transaction.hash,
                            blockNumber: blockNumber,
                            blockHash: block.hash || '',
                            from: transaction.from.toLowerCase(),
                            to: transaction.to.toLowerCase(),
                            amount: ethers_1.ethers.formatEther(value),
                            amountUSD: await this.convertToUSD('ETH', ethers_1.ethers.formatEther(value)),
                            timestamp: (block.timestamp || 0) * 1000,
                            confirmations: 0,
                        });
                    }
                }
            }
        }
        catch (error) {
            logger_1.logger.error(`Error processing block ${blockNumber}`, error);
        }
    }
}
exports.EthereumListener = EthereumListener;
//# sourceMappingURL=EthereumListener.js.map