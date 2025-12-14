/**
 * Stacks Listener
 * Monitors Stacks blockchain for incoming payments
 * with persistent block tracking and STX/SIP-010 token support
 */

import axios, { AxiosInstance } from 'axios';
import { BaseListener, ListenerConfig } from '../../shared/src/BaseListener';
import { ChainEvent } from '@shared/types';
import { logger } from '@shared/utils/logger';

// Stacks transaction types
type TxType = 'token_transfer' | 'contract_call' | 'smart_contract' | 'coinbase' | 'poison_microblock';

// SIP-010 token configurations
interface StacksTokenConfig {
  contractId: string;
  symbol: string;
  decimals: number;
}

// Supported SIP-010 tokens
const SUPPORTED_TOKENS: StacksTokenConfig[] = [
  { 
    contractId: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-usdh', 
    symbol: 'USDh', 
    decimals: 6 
  },
  { 
    contractId: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token', 
    symbol: 'USDA', 
    decimals: 6 
  },
  { 
    contractId: 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-Bitcoin', 
    symbol: 'xBTC', 
    decimals: 8 
  },
  { 
    contractId: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-alex', 
    symbol: 'ALEX', 
    decimals: 8 
  },
];

// Transaction interface
interface StacksTransaction {
  tx_id: string;
  tx_type: TxType;
  tx_status: 'success' | 'pending' | 'abort_by_response' | 'abort_by_post_condition';
  block_height: number;
  block_hash: string;
  burn_block_time: number;
  sender_address: string;
  token_transfer?: {
    recipient_address: string;
    amount: string;
    memo: string;
  };
  contract_call?: {
    contract_id: string;
    function_name: string;
    function_args: any[];
  };
  events?: StacksEvent[];
}

interface StacksEvent {
  event_type: string;
  asset: {
    asset_event_type: string;
    sender: string;
    recipient: string;
    amount: string;
    asset_id: string;
  };
}

export class StacksListener extends BaseListener {
  private apiClient: AxiosInstance;
  private addressSet: Set<string>;
  private pollingTimeout?: NodeJS.Timeout;
  private tokenContractIds: Set<string>;
  private apiUrl: string;

  constructor(config: ListenerConfig) {
    super(config);
    
    this.apiUrl = config.rpcUrl || 'https://api.hiro.so';
    this.apiClient = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        'Accept': 'application/json',
      },
    });

    this.addressSet = new Set(config.addresses);
    this.tokenContractIds = new Set(SUPPORTED_TOKENS.map((t) => t.contractId));
  }

  /**
   * Start the listener
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Stacks listener already running');
      return;
    }

    logger.info('Starting Stacks listener', {
      addresses: this.config.addresses.length,
      apiUrl: this.apiUrl,
    });

    // Initialize from checkpoint
    await this.initialize();

    this.isRunning = true;

    // Start polling
    this.pollBlocks();

    // Start confirmation checker
    this.startConfirmationChecker();

    logger.info('Stacks listener started', {
      startBlock: this.lastProcessedBlock,
    });
  }

  /**
   * Stop the listener
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    if (this.pollingTimeout) {
      clearTimeout(this.pollingTimeout);
      this.pollingTimeout = undefined;
    }

    this.stopConfirmationChecker();

    await this.saveCheckpoint();

    logger.info('Stacks listener stopped');
  }

  /**
   * Get current block number
   */
  async getCurrentBlockNumber(): Promise<number> {
    try {
      const response = await this.apiClient.get('/v2/info');
      return response.data.stacks_tip_height;
    } catch (error) {
      logger.error('Failed to get Stacks block height', { error });
      throw error;
    }
  }

  /**
   * Poll for new blocks
   */
  private async pollBlocks(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const currentBlock = await this.getCurrentBlockNumber();

      // Process blocks
      while (this.lastProcessedBlock < currentBlock && this.isRunning) {
        const blockNum = this.lastProcessedBlock + 1;
        await this.processBlock(blockNum);

        this.lastProcessedBlock = blockNum;
        this.processingStats.blocksProcessed++;

        // Save checkpoint periodically
        if (this.processingStats.blocksProcessed % 10 === 0) {
          await this.saveCheckpoint();
        }
      }
    } catch (error) {
      logger.error('Error polling Stacks blocks', { error });
      this.processingStats.errors++;
    }

    // Schedule next poll (Stacks ~10 minute blocks, poll every minute)
    this.pollingTimeout = setTimeout(() => this.pollBlocks(), 60000);
  }

  /**
   * Process a single block
   */
  async processBlock(blockNumber: number): Promise<void> {
    try {
      // Get block transactions
      const transactions = await this.getBlockTransactions(blockNumber);

      for (const tx of transactions) {
        // Only process successful transactions
        if (tx.tx_status !== 'success') continue;

        // Check for STX transfers
        if (tx.tx_type === 'token_transfer') {
          await this.handleStxTransfer(tx, blockNumber);
        }

        // Check for SIP-010 token transfers
        if (tx.tx_type === 'contract_call' || tx.events) {
          await this.handleTokenEvents(tx, blockNumber);
        }
      }
    } catch (error) {
      logger.error(`Error processing Stacks block ${blockNumber}`, { error });
    }
  }

  /**
   * Get transactions for a block
   */
  private async getBlockTransactions(blockHeight: number): Promise<StacksTransaction[]> {
    try {
      // First get block info
      const blockResponse = await this.apiClient.get(
        `/extended/v1/block/by_height/${blockHeight}`
      );

      if (!blockResponse.data || !blockResponse.data.txs) {
        return [];
      }

      // Get full transaction details
      const transactions: StacksTransaction[] = [];
      
      for (const txId of blockResponse.data.txs) {
        try {
          const txResponse = await this.apiClient.get(`/extended/v1/tx/${txId}`);
          transactions.push(txResponse.data);
        } catch (error) {
          logger.warn('Failed to fetch transaction', { txId, error });
        }
      }

      return transactions;
    } catch (error) {
      // If block not found, return empty array
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Handle STX transfer
   */
  private async handleStxTransfer(tx: StacksTransaction, blockNumber: number): Promise<void> {
    if (!tx.token_transfer) return;

          const recipient = tx.token_transfer.recipient_address;
    
    if (!this.addressSet.has(recipient)) return;

    // STX has 6 decimals
    const amount = (parseInt(tx.token_transfer.amount) / 1e6).toString();
    const amountUSD = await this.convertToUSD('STX', amount);

            const chainEvent: ChainEvent = {
              chain: 'stacks',
              txHash: tx.tx_id,
      blockNumber: tx.block_height,
      blockHash: tx.block_hash,
              from: tx.sender_address,
              to: recipient,
      amount,
      amountUSD,
      timestamp: tx.burn_block_time * 1000,
      confirmations: 1, // Stacks has finality
    };

    logger.info('STX transfer detected', {
      txId: tx.tx_id,
      amount,
      amountUSD,
      recipient,
    });

    await this.handleEvent(chainEvent);
  }

  /**
   * Handle SIP-010 token events
   */
  private async handleTokenEvents(tx: StacksTransaction, blockNumber: number): Promise<void> {
    if (!tx.events) return;

    for (const event of tx.events) {
      // Check for fungible token transfers
      if (
        event.event_type === 'fungible_token_asset' &&
        event.asset?.asset_event_type === 'transfer'
      ) {
        const recipient = event.asset.recipient;
        const assetId = event.asset.asset_id;

        // Check if recipient is monitored and token is supported
        if (!this.addressSet.has(recipient)) continue;

        const tokenConfig = SUPPORTED_TOKENS.find(
          (t) => assetId.includes(t.contractId)
        );

        if (!tokenConfig) continue;

        const amount = (
          parseInt(event.asset.amount) / Math.pow(10, tokenConfig.decimals)
        ).toString();
        const amountUSD = await this.convertToUSD(tokenConfig.symbol, amount);

        const chainEvent: ChainEvent = {
          chain: 'stacks',
          txHash: tx.tx_id,
          blockNumber: tx.block_height,
          blockHash: tx.block_hash,
          from: event.asset.sender,
          to: recipient,
          tokenAddress: tokenConfig.contractId,
          amount,
          amountUSD,
          timestamp: tx.burn_block_time * 1000,
              confirmations: 1,
            };

        logger.info(`${tokenConfig.symbol} transfer detected`, {
          txId: tx.tx_id,
          amount,
          amountUSD,
          recipient,
        });

            await this.handleEvent(chainEvent);
      }
    }
  }

  /**
   * Query address transactions (for historical processing)
   */
  async queryAddressTransactions(address: string, limit: number = 50): Promise<StacksTransaction[]> {
    try {
      const response = await this.apiClient.get(
        `/extended/v1/address/${address}/transactions`,
        {
          params: { limit },
        }
      );

      return response.data.results || [];
    } catch (error) {
      logger.error('Failed to query address transactions', { address, error });
      return [];
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(txId: string): Promise<{
    status: string;
    confirmed: boolean;
    blockHeight?: number;
  }> {
    try {
      const response = await this.apiClient.get(`/extended/v1/tx/${txId}`);
      const tx = response.data;

      return {
        status: tx.tx_status,
        confirmed: tx.tx_status === 'success',
        blockHeight: tx.block_height,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return { status: 'not_found', confirmed: false };
      }
      throw error;
    }
  }

  /**
   * Subscribe to mempool transactions via Hiro API websockets
   * This enables faster detection of pending transactions
   */
  async watchMempool(): Promise<void> {
    // Stacks API supports websocket connections for real-time updates
    // Note: Full mempool subscription requires a dedicated Stacks node
    // The Hiro API provides block and microblock subscriptions
    
    const wsUrl = process.env.STACKS_WS_URL || 'wss://api.mainnet.hiro.so';

    try {
      // Import WebSocket dynamically
      const WebSocket = (await import('ws')).default;
      
      const ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        logger.info('Connected to Stacks websocket for real-time updates', { wsUrl });
        
        // Subscribe to new blocks for immediate processing
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 'block_subscription',
          method: 'subscribe',
          params: ['blocks']
        }));

        // Subscribe to microblocks for faster detection
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          id: 'microblock_subscription',
          method: 'subscribe',
          params: ['microblocks']
        }));
      });

      ws.on('message', async (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.params?.type === 'block') {
            // New block received - process immediately
            const blockHeight = message.params.block_height;
            logger.debug('New Stacks block via websocket', { blockHeight });
            
            // Update last processed block and process each block
            if (blockHeight > this.lastProcessedBlock) {
              for (let block = this.lastProcessedBlock + 1; block <= blockHeight; block++) {
                await this.processBlock(block);
              }
            }
          } else if (message.params?.type === 'microblock') {
            // Microblock received - contains transactions before anchor block
            const txIds = message.params.tx_ids || [];
            logger.debug('New Stacks microblock', { txCount: txIds.length });
            
            // Process transactions in the microblock
            for (const txId of txIds) {
              await this.checkMempoolTransaction(txId);
            }
          }
        } catch (error) {
          logger.warn('Failed to parse websocket message', { error: (error as Error).message });
        }
      });

      ws.on('error', (error: Error) => {
        logger.error('Stacks websocket error', { error: error.message });
      });

      ws.on('close', () => {
        logger.warn('Stacks websocket closed, will reconnect on next poll cycle');
        // Reconnection will happen automatically on next polling cycle
      });

    } catch (error) {
      // Websocket subscription failed, fall back to polling only
      logger.warn('Mempool websocket subscription failed, using polling only', { 
        error: (error as Error).message 
      });
    }
  }

  /**
   * Check a specific mempool transaction for relevance
   */
  private async checkMempoolTransaction(txId: string): Promise<void> {
    try {
      const response = await this.apiClient.get(`/extended/v1/tx/${txId}`);
      const tx = response.data;

      if (tx.tx_status !== 'pending') {
        return; // Already processed
      }

      // Check if this is a relevant transaction
      if (tx.tx_type === 'token_transfer') {
        const recipient = tx.token_transfer?.recipient_address;
        if (recipient && this.addressSet.has(recipient)) {
          logger.info('Detected pending STX transfer', { txId, recipient });
          // Handle as pending event
          const event = await this.createEventFromTransaction(tx, 'pending');
          if (event) {
            await this.handleEvent(event);
          }
        }
      } else if (tx.tx_type === 'contract_call') {
        // Check for SIP-010 transfers
        const contractCall = tx.contract_call;
        if (contractCall?.function_name === 'transfer') {
          const args = contractCall.function_args || [];
          const recipientArg = args.find((a: any) => a.name === 'recipient' || a.name === 'to');
          if (recipientArg) {
            const recipient = recipientArg.repr?.replace(/^'/, '');
            if (recipient && this.addressSet.has(recipient)) {
              logger.info('Detected pending SIP-010 transfer', { txId, recipient });
              const event = await this.createEventFromTransaction(tx, 'pending');
              if (event) {
                await this.handleEvent(event);
              }
            }
          }
        }
      }
    } catch (error) {
      // Transaction might not be available yet
      logger.debug('Failed to check mempool transaction', { txId, error: (error as Error).message });
    }
  }

  /**
   * Create event from transaction with specified status
   */
  private async createEventFromTransaction(tx: any, status: string): Promise<ChainEvent | null> {
    // Simplified version for pending transactions
    if (tx.tx_type === 'token_transfer') {
      const stxAmount = BigInt(tx.token_transfer?.amount || '0');
      // Convert from micro-STX (6 decimals) to STX
      const normalizedAmount = Number(stxAmount) / 1e6;
      const amountUSD = await this.convertToUSD('STX', normalizedAmount.toString());
      
      return {
        chain: 'stacks',
        txHash: tx.tx_id,
        blockNumber: tx.block_height || 0,
        blockHash: tx.block_hash || '',
        from: tx.sender_address,
        to: tx.token_transfer?.recipient_address,
        amount: stxAmount.toString(),
        amountUSD,
        timestamp: Date.now(),
        confirmations: status === 'confirmed' ? this.config.confirmationsRequired : 0,
      };
    }
    return null;
  }

  /**
   * Add address to monitor
   */
  addAddress(address: string): void {
    if (!this.addressSet.has(address)) {
      this.addressSet.add(address);
      this.config.addresses.push(address);
      logger.info('Added Stacks address to monitor', { address });
    }
  }

  /**
   * Remove address from monitoring
   */
  removeAddress(address: string): void {
    this.addressSet.delete(address);
    this.config.addresses = this.config.addresses.filter((a) => a !== address);
    logger.info('Removed Stacks address from monitoring', { address });
  }

  /**
   * Get API client for external use
   */
  getApiClient(): AxiosInstance {
    return this.apiClient;
  }
}

export default StacksListener;
