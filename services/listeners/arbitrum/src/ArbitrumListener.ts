import { ethers } from 'ethers';
import { BaseListener, ListenerConfig } from '../../shared/src/BaseListener';
import { ChainEvent } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { TOKEN_ADDRESSES } from '@shared/constants/chains';

export class ArbitrumListener extends BaseListener {
  private provider: ethers.JsonRpcProvider;
  private contracts: Map<string, ethers.Contract> = new Map();
  private pollingInterval?: NodeJS.Timeout;

  constructor(config: ListenerConfig) {
    super(config);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
  }

  async start() {
    this.isRunning = true;
    logger.info(`Starting Arbitrum listener for ${this.config.addresses.length} addresses`);

    await this.initialize();
    await this.setupContractListeners();
    this.pollBlocks();
    this.startConfirmationChecker();
  }

  async stop() {
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    this.stopConfirmationChecker();
    await this.saveCheckpoint();
    logger.info('Stopping Arbitrum listener');
  }

  async getCurrentBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  private async setupContractListeners() {
    const tokens = [
      { address: TOKEN_ADDRESSES.arbitrum.USDC, symbol: 'USDC', decimals: 6 },
      { address: TOKEN_ADDRESSES.arbitrum.USDT, symbol: 'USDT', decimals: 6 },
      { address: TOKEN_ADDRESSES.arbitrum.WETH, symbol: 'WETH', decimals: 18 },
    ];

    for (const token of tokens) {
      try {
        const contract = new ethers.Contract(
          token.address,
          ['event Transfer(address indexed from, address indexed to, uint256 value)'],
          this.provider
        );

        contract.on('Transfer', async (from, to, value, event) => {
          if (this.config.addresses.includes(to.toLowerCase())) {
            await this.handleTransfer({
              chain: 'arbitrum',
              txHash: event.transactionHash,
              blockNumber: event.blockNumber,
              blockHash: event.blockHash,
              from: from.toLowerCase(),
              to: to.toLowerCase(),
              tokenAddress: token.address,
              amount: ethers.formatUnits(value, token.decimals),
              amountUSD: await this.convertToUSD(token.symbol, ethers.formatUnits(value, token.decimals)),
              timestamp: Date.now(),
              confirmations: 0,
            });
          }
        });

        this.contracts.set(token.address, contract);
      } catch (error) {
        logger.error(`Failed to setup listener for ${token.symbol}`, error);
      }
    }
  }

  private async handleTransfer(event: Partial<ChainEvent>) {
    try {
      const currentBlock = await this.getCurrentBlockNumber();
      const confirmations = currentBlock - (event.blockNumber || 0);

      const chainEvent: ChainEvent = {
        chain: 'arbitrum',
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
    } catch (error) {
      logger.error('Error handling transfer', error);
    }
  }

  private async pollBlocks() {
    while (this.isRunning) {
      try {
        const currentBlock = await this.getCurrentBlockNumber();

        if (currentBlock > this.lastProcessedBlock) {
          await this.processBlock(currentBlock);
          this.lastProcessedBlock = currentBlock;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2 seconds (L2 is faster)
      } catch (error) {
        logger.error('Error polling blocks', error);
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Retry after 10s
      }
    }
  }

  async processBlock(blockNumber: number) {
    try {
      const block = await this.provider.getBlock(blockNumber, true);

      if (!block || !block.transactions) return;

      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue;

        // Type guard: ensure tx is a TransactionResponse
        const transaction = tx as ethers.TransactionResponse;
        if (!transaction.to || !transaction.from) continue;

        if (this.config.addresses.includes(transaction.to.toLowerCase())) {
          const value = transaction.value || 0n;
          if (value > 0) {
            await this.handleTransfer({
              chain: 'arbitrum',
              txHash: transaction.hash,
              blockNumber: blockNumber,
              blockHash: block.hash || '',
              from: transaction.from.toLowerCase(),
              to: transaction.to.toLowerCase(),
              amount: ethers.formatEther(value),
              amountUSD: await this.convertToUSD('ETH', ethers.formatEther(value)),
              timestamp: (block.timestamp || 0) * 1000,
              confirmations: 0,
            });
          }
        }
      }
    } catch (error) {
      logger.error(`Error processing block ${blockNumber}`, error);
    }
  }
}
