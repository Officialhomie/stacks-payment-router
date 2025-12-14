/**
 * Ethereum Listener
 * Monitors Ethereum and EVM-compatible chains for incoming payments
 * with persistent block tracking and reliable event processing
 */

import { ethers } from 'ethers';
import { BaseListener, ListenerConfig } from '../../shared/src/BaseListener';
import { ChainEvent, Chain } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { TOKEN_ADDRESSES } from '@shared/constants/chains';

// ERC20 Transfer event signature
const TRANSFER_EVENT_SIGNATURE = 'Transfer(address,address,uint256)';
const TRANSFER_TOPIC = ethers.utils.id(TRANSFER_EVENT_SIGNATURE);

// Token configurations
interface TokenConfig {
  address: string;
  symbol: string;
  decimals: number;
}

// Supported tokens per chain
const SUPPORTED_TOKENS: Record<string, TokenConfig[]> = {
  ethereum: [
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', decimals: 6 },
    { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', decimals: 18 },
  ],
  arbitrum: [
    { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', symbol: 'USDC', decimals: 6 },
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', decimals: 6 },
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', decimals: 18 },
  ],
  base: [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  ],
  polygon: [
    { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', symbol: 'USDC', decimals: 6 },
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', decimals: 6 },
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', decimals: 18 },
  ],
  optimism: [
    { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', symbol: 'USDC', decimals: 6 },
    { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 },
  ],
};

export class EthereumListener extends BaseListener {
  private provider: ethers.providers.JsonRpcProvider;
  private tokenContracts: Map<string, ethers.Contract> = new Map();
  private pollingTimeout?: NodeJS.Timeout;
  private addressSet: Set<string>;
  private tokens: TokenConfig[];

  constructor(config: ListenerConfig) {
    super(config);
    this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
    this.addressSet = new Set(config.addresses.map((a) => a.toLowerCase()));
    this.tokens = SUPPORTED_TOKENS[config.chain] || [];
  }

  /**
   * Start the listener
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Listener already running', { chain: this.config.chain });
      return;
    }

    logger.info(`Starting ${this.config.chain} listener`, {
      addresses: this.config.addresses.length,
      tokens: this.tokens.length,
    });

    // Initialize from checkpoint
    await this.initialize();

    this.isRunning = true;

    // Set up ERC20 event listeners
    await this.setupTokenListeners();

    // Start polling for blocks
    this.pollBlocks();

    // Start confirmation checker
    this.startConfirmationChecker();

    logger.info(`${this.config.chain} listener started`, {
      startBlock: this.lastProcessedBlock,
    });
  }

  /**
   * Stop the listener
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // Clear polling timeout
    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = undefined;
    }

    // Remove token listeners
    for (const contract of this.tokenContracts.values()) {
      contract.removeAllListeners();
    }
    this.tokenContracts.clear();

    // Stop confirmation checker
    this.stopConfirmationChecker();

    // Save final checkpoint
    await this.saveCheckpoint();

    logger.info(`${this.config.chain} listener stopped`);
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  /**
   * Set up token contract listeners
   */
  private async setupTokenListeners(): Promise<void> {
    const erc20Abi = [
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ];

    for (const token of this.tokens) {
      try {
        const contract = new ethers.Contract(token.address, erc20Abi, this.provider);

        // Set up real-time listener
        contract.on('Transfer', async (from: string, to: string, value: ethers.BigNumber, event: ethers.Event) => {
          const toAddress = to.toLowerCase();

          if (this.addressSet.has(toAddress)) {
            await this.handleTokenTransfer({
              chain: this.config.chain,
              txHash: event.transactionHash,
              blockNumber: event.blockNumber,
              blockHash: event.blockHash,
              from: from.toLowerCase(),
              to: toAddress,
              tokenAddress: token.address,
              amount: ethers.utils.formatUnits(value, token.decimals),
              symbol: token.symbol,
              decimals: token.decimals,
            });
          }
        });

        this.tokenContracts.set(token.address, contract);

        logger.debug(`Token listener set up`, {
          chain: this.config.chain,
          token: token.symbol,
          address: token.address,
        });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to set up listener for ${token.symbol}`, { error: errorMessage });
      }
    }
  }

  /**
   * Handle token transfer event
   */
  private async handleTokenTransfer(data: {
    chain: Chain;
    txHash: string;
    blockNumber: number;
    blockHash: string;
    from: string;
    to: string;
    tokenAddress: string;
    amount: string;
    symbol: string;
    decimals: number;
  }): Promise<void> {
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      const confirmations = currentBlock - data.blockNumber;

      const amountUSD = await this.convertToUSD(data.symbol, data.amount);

      const chainEvent: ChainEvent = {
        chain: data.chain,
        txHash: data.txHash,
        blockNumber: data.blockNumber,
        blockHash: data.blockHash,
        from: data.from,
        to: data.to,
        tokenAddress: data.tokenAddress,
        amount: data.amount,
        amountUSD,
        timestamp: Date.now(),
        confirmations,
      };

      await this.handleEvent(chainEvent);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error handling token transfer', { data, error: errorMessage });
    }
  }

  /**
   * Poll for new blocks
   */
  private async pollBlocks(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const currentBlock = await this.getCurrentBlockNumber();

      // Process blocks in batches
      while (this.lastProcessedBlock < currentBlock && this.isRunning) {
        const startBlock = this.lastProcessedBlock + 1;
        const endBlock = Math.min(
          startBlock + (this.config.batchSize || 100) - 1,
          currentBlock
        );

        await this.processBlockRange(startBlock, endBlock);

        this.lastProcessedBlock = endBlock;
        this.processingStats.blocksProcessed += endBlock - startBlock + 1;

        // Save checkpoint periodically
        if (this.processingStats.blocksProcessed % 100 === 0) {
          await this.saveCheckpoint();
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error polling blocks', { chain: this.config.chain, error: errorMessage });
      this.processingStats.errors++;
    }

    // Schedule next poll
    const pollInterval = this.getPollInterval();
    this.pollingTimeout = setTimeout(() => this.pollBlocks(), pollInterval);
  }

  /**
   * Process a range of blocks
   */
  private async processBlockRange(startBlock: number, endBlock: number): Promise<void> {
    // Query for ETH transfers to monitored addresses
    for (let blockNum = startBlock; blockNum <= endBlock; blockNum++) {
      await this.processBlock(blockNum);
    }

    // Query for ERC20 transfers using logs
    await this.queryTokenTransfers(startBlock, endBlock);
  }

  /**
   * Process a single block for native transfers
   */
  async processBlock(blockNumber: number): Promise<void> {
    try {
      const blockWithTxs = await this.provider.getBlockWithTransactions(blockNumber);
      if (!blockWithTxs || !blockWithTxs.transactions) return;

      for (const tx of blockWithTxs.transactions) {
        if (!tx.to) continue;

        const toAddress = tx.to.toLowerCase();

        if (this.addressSet.has(toAddress) && tx.value.gt(0)) {
          // Native ETH/token transfer
          const amount = ethers.utils.formatEther(tx.value);
          const amountUSD = await this.convertToUSD('ETH', amount);

          const chainEvent: ChainEvent = {
            chain: this.config.chain,
            txHash: tx.hash,
            blockNumber: blockNumber,
            blockHash: blockWithTxs.hash,
            from: tx.from.toLowerCase(),
            to: toAddress,
            amount,
            amountUSD,
            timestamp: blockWithTxs.timestamp * 1000,
            confirmations: 0, // Will be updated
          };

          await this.handleEvent(chainEvent);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error processing block ${blockNumber}`, { error: errorMessage });
    }
  }

  /**
   * Query for token transfers in a block range
   */
  private async queryTokenTransfers(startBlock: number, endBlock: number): Promise<void> {
    // Convert addresses to topics format (padded to 32 bytes)
    const addressTopics = this.config.addresses.map((addr) =>
      ethers.utils.hexZeroPad(addr.toLowerCase(), 32)
    );

    for (const token of this.tokens) {
      try {
        const filter = {
          address: token.address,
          topics: [
            TRANSFER_TOPIC,
            null, // from (any)
            addressTopics, // to (our addresses)
          ],
          fromBlock: startBlock,
          toBlock: endBlock,
        };

        const logs = await this.provider.getLogs(filter);

        for (const log of logs) {
          const from = ethers.utils.getAddress('0x' + log.topics[1].slice(26));
          const to = ethers.utils.getAddress('0x' + log.topics[2].slice(26));
          const value = ethers.BigNumber.from(log.data);

          await this.handleTokenTransfer({
            chain: this.config.chain,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockHash: log.blockHash,
            from: from.toLowerCase(),
            to: to.toLowerCase(),
            tokenAddress: token.address,
            amount: ethers.utils.formatUnits(value, token.decimals),
            symbol: token.symbol,
            decimals: token.decimals,
          });
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error querying ${token.symbol} transfers`, { error: errorMessage });
      }
    }
  }

  /**
   * Get poll interval based on chain
   */
  private getPollInterval(): number {
    // Different chains have different block times
    const intervals: Record<string, number> = {
      ethereum: 12000,   // ~12 seconds
      arbitrum: 1000,    // ~1 second
      base: 2000,        // ~2 seconds
      polygon: 2000,     // ~2 seconds
      optimism: 2000,    // ~2 seconds
    };
    return intervals[this.config.chain] || this.config.pollInterval || 12000;
  }

  /**
   * Add new address to monitor
   */
  addAddress(address: string): void {
    const lowerAddress = address.toLowerCase();
    if (!this.addressSet.has(lowerAddress)) {
      this.addressSet.add(lowerAddress);
      this.config.addresses.push(lowerAddress);
      logger.info('Added address to monitor', { chain: this.config.chain, address });
    }
  }

  /**
   * Remove address from monitoring
   */
  removeAddress(address: string): void {
    const lowerAddress = address.toLowerCase();
    this.addressSet.delete(lowerAddress);
    this.config.addresses = this.config.addresses.filter(
      (a) => a.toLowerCase() !== lowerAddress
    );
    logger.info('Removed address from monitoring', { chain: this.config.chain, address });
  }

  /**
   * Get provider for external use
   */
  getProvider(): ethers.providers.JsonRpcProvider {
    return this.provider;
  }
}

export default EthereumListener;
