/**
 * Stacks DEX Service
 * Provides integration with Stacks DEXs (Velar, Alex, STXCity)
 * for swapping tokens to USDh
 */

import { logger } from '@shared/utils/logger';
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  uintCV,
  contractPrincipalCV,
  standardPrincipalCV,
  FungibleConditionCode,
  makeStandardFungiblePostCondition,
  createAssetInfo,
} from '@stacks/transactions';
import { StacksMainnet, StacksTestnet } from '@stacks/network';

// DEX Provider Types
type DexProvider = 'velar' | 'alex' | 'stxcity';

interface SwapQuote {
  provider: DexProvider;
  inputToken: string;
  outputToken: string;
  inputAmount: string;
  outputAmount: string;
  minimumReceived: string;
  priceImpact: number;
  fee: number;
  route: SwapRoute[];
  expiresAt: number;
}

interface SwapRoute {
  poolId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
}

interface SwapResult {
  txId: string;
  usdhAmount: number;
  fee: number;
  priceImpact: number;
  route: SwapRoute[];
}

interface PoolInfo {
  id: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  fee: number;
  tvl: number;
}

// Contract addresses
const DEX_CONTRACTS = {
  mainnet: {
    velar: {
      router: 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.velar-router-v1',
      factory: 'SP1Y5YSTAHZ88XYK1VPDH24GY0HPX5J4JECTMY4A1.velar-factory-v1',
    },
    alex: {
      router: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.amm-swap-pool-v1-1',
      oracle: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.fixed-weight-pool-v1-01',
    },
    stxcity: {
      router: 'SP1Z92MPDQEWZXW36VX71Q25HKF5K2EPCJ304F275.stxcity-router-v1',
    },
  },
  testnet: {
    velar: {
      router: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.velar-router-v1',
      factory: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.velar-factory-v1',
    },
    alex: {
      router: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.amm-swap-pool-v1-1',
      oracle: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.fixed-weight-pool-v1-01',
    },
    stxcity: {
      router: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.stxcity-router-v1',
    },
  },
};

// Token contract addresses
const TOKEN_CONTRACTS = {
  mainnet: {
    STX: 'native',
    USDh: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-usdh',
    USDA: 'SP2C2YFP12AJZB4MABJBAJ55XECVS7E4PMMZ89YZR.usda-token',
    xBTC: 'SP3DX3H4FEYZJZ586MFBS25ZW3HZDMEW92260R2PR.Wrapped-Bitcoin',
    ALEX: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-alex',
    WELSH: 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token',
  },
  testnet: {
    STX: 'native',
    USDh: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-usdh',
    USDA: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.usda-token',
    xBTC: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.wrapped-bitcoin',
  },
};

export class StacksDexService {
  private network: StacksMainnet | StacksTestnet;
  private networkType: 'mainnet' | 'testnet';
  private apiUrl: string;
  private velarClient: AxiosInstance;
  private alexClient: AxiosInstance;
  private privateKey: string;

  constructor() {
    this.networkType = (process.env.STACKS_NETWORK || 'testnet') as 'mainnet' | 'testnet';
    this.network = this.networkType === 'mainnet' ? new StacksMainnet() : new StacksTestnet();
    this.apiUrl = process.env.STACKS_RPC_URL || 'https://api.testnet.hiro.so';
    this.privateKey = process.env.STACKS_SETTLEMENT_WALLET_PRIVATE_KEY || '';

    // Initialize Velar API client
    this.velarClient = axios.create({
      baseURL: 'https://api.velar.co/v1',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.VELAR_API_KEY || '',
      },
    });

    // Initialize Alex API client
    this.alexClient = axios.create({
      baseURL: 'https://api.alexlab.co/v1',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get the best swap quote from all available DEXs
   */
  async getBestQuote(
    fromToken: string,
    toToken: string,
    amount: string,
    slippageTolerance: number = 0.005 // 0.5% default
  ): Promise<SwapQuote> {
    logger.info('Getting best swap quote', { fromToken, toToken, amount });

    const quotes = await Promise.allSettled([
      this.getVelarQuote(fromToken, toToken, amount, slippageTolerance),
      this.getAlexQuote(fromToken, toToken, amount, slippageTolerance),
    ]);

    const validQuotes: SwapQuote[] = [];
    for (const result of quotes) {
      if (result.status === 'fulfilled') {
        validQuotes.push(result.value);
      } else {
        logger.warn('Quote fetch failed', { reason: result.reason });
      }
    }

    if (validQuotes.length === 0) {
      throw new Error(`No quotes available for ${fromToken} -> ${toToken}`);
    }

    // Sort by output amount (descending) to get best quote
    validQuotes.sort((a, b) => parseFloat(b.outputAmount) - parseFloat(a.outputAmount));

    return validQuotes[0];
  }

  /**
   * Get quote from Velar DEX
   */
  private async getVelarQuote(
    fromToken: string,
    toToken: string,
    amount: string,
    slippage: number
  ): Promise<SwapQuote> {
    try {
      const response = await this.velarClient.post('/swap/quote', {
        tokenIn: this.getTokenContract(fromToken),
        tokenOut: this.getTokenContract(toToken),
        amountIn: amount,
        slippage: slippage * 100, // Convert to percentage
      });

      const data = response.data;

      return {
        provider: 'velar',
        inputToken: fromToken,
        outputToken: toToken,
        inputAmount: amount,
        outputAmount: data.amountOut,
        minimumReceived: data.minimumReceived,
        priceImpact: data.priceImpact || 0,
        fee: data.fee || 0,
        route: data.route || [],
        expiresAt: Date.now() + 30000, // 30 second validity
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Velar quote failed', { 
        error: axiosError.message,
        fromToken,
        toToken 
      });
      throw error;
    }
  }

  /**
   * Get quote from Alex DEX
   */
  private async getAlexQuote(
    fromToken: string,
    toToken: string,
    amount: string,
    slippage: number
  ): Promise<SwapQuote> {
    try {
      const response = await this.alexClient.get('/swap/quote', {
        params: {
          from: this.getTokenContract(fromToken),
          to: this.getTokenContract(toToken),
          amount: amount,
        },
      });

      const data = response.data;
      const minimumReceived = (parseFloat(data.amountOut) * (1 - slippage)).toString();

      return {
        provider: 'alex',
        inputToken: fromToken,
        outputToken: toToken,
        inputAmount: amount,
        outputAmount: data.amountOut,
        minimumReceived,
        priceImpact: data.priceImpact || 0,
        fee: data.fee || 0,
        route: data.route || [],
        expiresAt: Date.now() + 30000,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      logger.error('Alex quote failed', { 
        error: axiosError.message,
        fromToken,
        toToken 
      });
      throw error;
    }
  }

  /**
   * Execute swap to USDh
   */
  async swapToUSDh(
    fromToken: string,
    amount: string,
    recipientAddress: string,
    slippageTolerance: number = 0.005
  ): Promise<SwapResult> {
    logger.info('Executing swap to USDh', { fromToken, amount, recipientAddress });

    if (!this.privateKey) {
      throw new Error('Settlement wallet private key not configured');
    }

    // Get best quote
    const quote = await this.getBestQuote(fromToken, 'USDh', amount, slippageTolerance);

    // Execute swap based on provider
    let txId: string;
    switch (quote.provider) {
      case 'velar':
        txId = await this.executeVelarSwap(quote, recipientAddress);
        break;
      case 'alex':
        txId = await this.executeAlexSwap(quote, recipientAddress);
        break;
      default:
        throw new Error(`Unsupported DEX provider: ${quote.provider}`);
    }

    return {
      txId,
      usdhAmount: parseFloat(quote.outputAmount),
      fee: quote.fee,
      priceImpact: quote.priceImpact,
      route: quote.route,
    };
  }

  /**
   * Execute swap on Velar
   */
  private async executeVelarSwap(quote: SwapQuote, recipient: string): Promise<string> {
    const contracts = DEX_CONTRACTS[this.networkType].velar;
    const [routerAddress, routerName] = contracts.router.split('.');

    const inputTokenContract = this.getTokenContract(quote.inputToken);
    const outputTokenContract = this.getTokenContract(quote.outputToken);

    // Build post conditions to protect against slippage
    const postConditions = [];

    // If not native STX, add token transfer post condition
    if (quote.inputToken !== 'STX') {
      const [tokenAddress, tokenName] = inputTokenContract.split('.');
      postConditions.push(
        makeStandardFungiblePostCondition(
          recipient,
          FungibleConditionCode.Equal,
          BigInt(quote.inputAmount),
          createAssetInfo(tokenAddress, tokenName, tokenName)
        )
      );
    }

    // Build transaction
    const txOptions = {
      contractAddress: routerAddress,
      contractName: routerName,
      functionName: 'swap-exact-tokens-for-tokens',
      functionArgs: [
        uintCV(BigInt(quote.inputAmount)),
        uintCV(BigInt(quote.minimumReceived)),
        contractPrincipalCV(inputTokenContract.split('.')[0], inputTokenContract.split('.')[1]),
        contractPrincipalCV(outputTokenContract.split('.')[0], outputTokenContract.split('.')[1]),
        standardPrincipalCV(recipient),
      ],
      senderKey: this.privateKey,
      network: this.network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Deny,
      postConditions,
      fee: BigInt(10000), // 0.01 STX fee
    };

    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, this.network);

    if (broadcastResponse.error) {
      throw new Error(`Velar swap broadcast failed: ${broadcastResponse.error}`);
    }

    logger.info('Velar swap transaction broadcast', { txId: broadcastResponse.txid });
    return broadcastResponse.txid;
  }

  /**
   * Execute swap on Alex
   */
  private async executeAlexSwap(quote: SwapQuote, recipient: string): Promise<string> {
    const contracts = DEX_CONTRACTS[this.networkType].alex;
    const [routerAddress, routerName] = contracts.router.split('.');

    const inputTokenContract = this.getTokenContract(quote.inputToken);
    const outputTokenContract = this.getTokenContract(quote.outputToken);

    // Alex uses a different swap function signature
    const txOptions = {
      contractAddress: routerAddress,
      contractName: routerName,
      functionName: 'swap-helper',
      functionArgs: [
        contractPrincipalCV(inputTokenContract.split('.')[0], inputTokenContract.split('.')[1]),
        contractPrincipalCV(outputTokenContract.split('.')[0], outputTokenContract.split('.')[1]),
        uintCV(BigInt(quote.inputAmount)),
        uintCV(BigInt(quote.minimumReceived)),
      ],
      senderKey: this.privateKey,
      network: this.network,
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow, // Alex handles post conditions internally
      fee: BigInt(10000),
    };

    const transaction = await makeContractCall(txOptions);
    const broadcastResponse = await broadcastTransaction(transaction, this.network);

    if (broadcastResponse.error) {
      throw new Error(`Alex swap broadcast failed: ${broadcastResponse.error}`);
    }

    logger.info('Alex swap transaction broadcast', { txId: broadcastResponse.txid });
    return broadcastResponse.txid;
  }

  /**
   * Get swap quote (simplified interface)
   */
  async getSwapQuote(
    fromToken: string,
    amount: string
  ): Promise<{
    usdhAmount: number;
    slippage: number;
    fee: number;
  }> {
    const quote = await this.getBestQuote(fromToken, 'USDh', amount);
    
    return {
      usdhAmount: parseFloat(quote.outputAmount),
      slippage: quote.priceImpact,
      fee: quote.fee,
    };
  }

  /**
   * Get pool information
   */
  async getPoolInfo(token0: string, token1: string): Promise<PoolInfo | null> {
    try {
      const response = await this.velarClient.get('/pools', {
        params: {
          token0: this.getTokenContract(token0),
          token1: this.getTokenContract(token1),
        },
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      const pool = response.data[0];
      return {
        id: pool.id,
        token0: pool.token0,
        token1: pool.token1,
        reserve0: pool.reserve0,
        reserve1: pool.reserve1,
        fee: pool.fee,
        tvl: pool.tvl,
      };
    } catch (error) {
      logger.error('Failed to get pool info', { error, token0, token1 });
      return null;
    }
  }

  /**
   * Get token contract address
   */
  private getTokenContract(token: string): string {
    const tokens = TOKEN_CONTRACTS[this.networkType];
    const contract = tokens[token as keyof typeof tokens];
    
    if (!contract) {
      throw new Error(`Unknown token: ${token}`);
    }

    return contract;
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForConfirmation(txId: string, maxAttempts: number = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(`${this.apiUrl}/extended/v1/tx/${txId}`);
        const status = response.data.tx_status;

        if (status === 'success') {
          logger.info('Transaction confirmed', { txId });
          return true;
        } else if (status === 'abort_by_response' || status === 'abort_by_post_condition') {
          logger.error('Transaction failed', { txId, status });
          return false;
        }

        // Still pending, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
      } catch (error) {
        logger.warn('Error checking transaction status', { txId, error });
      }
    }

    logger.error('Transaction confirmation timeout', { txId });
    return false;
  }
}

export default StacksDexService;
