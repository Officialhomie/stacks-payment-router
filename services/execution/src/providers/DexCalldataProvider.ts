/**
 * DEX Calldata Provider
 * Generates transaction calldata for executing swaps and bridges
 * across multiple DEX aggregators and bridge protocols
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { RouteStep } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { ethers } from 'ethers';

// Chain ID mappings
const CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
  bsc: 56,
};

// DEX Router addresses
const DEX_ROUTERS: Record<string, Record<string, string>> = {
  '1inch': {
    ethereum: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    arbitrum: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    base: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    optimism: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    polygon: '0x1111111254EEB25477B68fb85Ed929f73A960582',
  },
  lifi: {
    ethereum: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    arbitrum: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    base: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    optimism: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
    polygon: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  },
  socket: {
    ethereum: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
    arbitrum: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
    base: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
    optimism: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
    polygon: '0x3a23F943181408EAC424116Af7b7790c94Cb97a5',
  },
};

// Bridge protocol addresses
const BRIDGE_CONTRACTS: Record<string, Record<string, string>> = {
  layerzero: {
    ethereum: '0x66A71Dcef29A0fFBDBE3c6a460a3B5BC225Cd675',
    arbitrum: '0x3c2269811836af69497E5F486A85D7316753cf62',
    base: '0xb6319cC6c8c27A8F5dAF0dD3DF91EA35C4720dd7',
    optimism: '0x3c2269811836af69497E5F486A85D7316753cf62',
    polygon: '0x3c2269811836af69497E5F486A85D7316753cf62',
  },
  wormhole: {
    ethereum: '0x3ee18B2214AFF97000D974cf647E7C347E8fa585',
    arbitrum: '0x0b2402144Bb366A632D14B83F244D2e0e21bD39c',
    base: '0x8d2de8d2f73F1F4cAB472AC9A881C9b123C79627',
    optimism: '0xEe91C335eab126dF5fDB3797EA9d6aD93aeC9722',
    polygon: '0x5a58505a96D1dbf8dF91cB21B54419FC36e93fdE',
  },
  stargate: {
    ethereum: '0x8731d54E9D02c286767d56ac03e8037C07e01e98',
    arbitrum: '0x53Bf833A5d6c4ddA888F69c22C88C9f356a41614',
    base: '0x45f1A95A4D3f3836523F5c83673c797f4d4d263B',
    optimism: '0xB0D502E938ed5f4df2E681fE6E419ff29631d62b',
    polygon: '0x45A01E4e04F14f7A4a6702c74187c5F6222033cd',
  },
};

interface SwapCalldata {
  to: string;
  data: string;
  value: string;
  gasLimit: number;
}

interface BridgeCalldata {
  to: string;
  data: string;
  value: string;
  gasLimit: number;
  bridgeProtocol: string;
}

export class DexCalldataProvider {
  private oneInchClient: AxiosInstance;
  private lifiClient: AxiosInstance;
  private socketClient: AxiosInstance;
  private stargateClient: AxiosInstance;

  constructor() {
    // Initialize 1inch client (v5.2 API)
    this.oneInchClient = axios.create({
      baseURL: 'https://api.1inch.dev/swap/v5.2',
      timeout: 15000,
      headers: {
        'Authorization': `Bearer ${process.env.ONEINCH_API_KEY || ''}`,
        'Accept': 'application/json',
      },
    });

    // Initialize LiFi client
    this.lifiClient = axios.create({
      baseURL: 'https://li.quest/v1',
      timeout: 15000,
      headers: {
        'x-lifi-api-key': process.env.LIFI_API_KEY || '',
        'Accept': 'application/json',
      },
    });

    // Initialize Socket client
    this.socketClient = axios.create({
      baseURL: 'https://api.socket.tech/v2',
      timeout: 15000,
      headers: {
        'API-KEY': process.env.SOCKET_API_KEY || '',
        'Accept': 'application/json',
      },
    });

    // Initialize Stargate client
    this.stargateClient = axios.create({
      baseURL: 'https://api.stargate.finance/v1',
      timeout: 15000,
      headers: {
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Get swap calldata from the best available provider
   */
  async getSwapCalldata(
    step: RouteStep,
    fromAddress: string,
    slippageTolerance: number = 0.01
  ): Promise<string> {
    const chainId = CHAIN_IDS[step.fromChain];
    if (!chainId) {
      throw new Error(`Unsupported chain: ${step.fromChain}`);
    }

    // Try providers in order of preference
    const providers = [
      { name: '1inch', fn: () => this.get1inchSwapCalldata(step, fromAddress, slippageTolerance, chainId) },
      { name: 'lifi', fn: () => this.getLiFiSwapCalldata(step, fromAddress, slippageTolerance, chainId) },
      { name: 'socket', fn: () => this.getSocketSwapCalldata(step, fromAddress, slippageTolerance, chainId) },
    ];

    // If provider is specified, use that one first
    if (step.provider) {
      const preferredProvider = providers.find((p) => p.name === step.provider);
      if (preferredProvider) {
        providers.unshift(...providers.splice(providers.indexOf(preferredProvider), 1));
      }
    }

    let lastError: Error | null = null;

    for (const provider of providers) {
      try {
        const result = await provider.fn();
        logger.info(`Swap calldata generated via ${provider.name}`, {
          fromToken: step.fromToken,
          toToken: step.toToken,
          chain: step.fromChain,
        });
        return result.data;
      } catch (error) {
        lastError = error as Error;
        logger.warn(`${provider.name} calldata generation failed`, {
          error: lastError.message,
          step,
        });
      }
    }

    throw lastError || new Error('All swap providers failed');
  }

  /**
   * Get 1inch swap calldata
   */
  private async get1inchSwapCalldata(
    step: RouteStep,
    fromAddress: string,
    slippage: number,
    chainId: number
  ): Promise<SwapCalldata> {
    const response = await this.oneInchClient.get(`/${chainId}/swap`, {
      params: {
        src: step.fromTokenAddress || this.getNativeTokenAddress(),
        dst: step.toTokenAddress || this.getNativeTokenAddress(),
        amount: step.amount,
        from: fromAddress,
        slippage: slippage * 100, // Convert to percentage
        disableEstimate: false,
        allowPartialFill: false,
      },
    });

    const tx = response.data.tx;

    return {
      to: tx.to,
      data: tx.data,
      value: tx.value || '0',
      gasLimit: parseInt(tx.gas || '300000'),
    };
  }

  /**
   * Get LiFi swap calldata
   */
  private async getLiFiSwapCalldata(
    step: RouteStep,
    fromAddress: string,
    slippage: number,
    chainId: number
  ): Promise<SwapCalldata> {
    // First get a quote
    const quoteResponse = await this.lifiClient.get('/quote', {
      params: {
        fromChain: chainId,
        toChain: chainId,
        fromToken: step.fromTokenAddress || this.getNativeTokenAddress(),
        toToken: step.toTokenAddress || this.getNativeTokenAddress(),
        fromAmount: step.amount,
        fromAddress,
        slippage,
      },
    });

    const quote = quoteResponse.data;

    // Get the transaction request
    const txRequest = quote.transactionRequest;

    if (!txRequest) {
      throw new Error('LiFi quote did not return transaction request');
    }

    return {
      to: txRequest.to,
      data: txRequest.data,
      value: txRequest.value || '0',
      gasLimit: parseInt(txRequest.gasLimit || '300000'),
    };
  }

  /**
   * Get Socket swap calldata
   */
  private async getSocketSwapCalldata(
    step: RouteStep,
    fromAddress: string,
    slippage: number,
    chainId: number
  ): Promise<SwapCalldata> {
    // Get quote first
    const quoteResponse = await this.socketClient.get('/quote', {
      params: {
        fromChainId: chainId,
        toChainId: chainId,
        fromTokenAddress: step.fromTokenAddress || this.getNativeTokenAddress(),
        toTokenAddress: step.toTokenAddress || this.getNativeTokenAddress(),
        fromAmount: step.amount,
        userAddress: fromAddress,
        singleTxOnly: true,
        sort: 'output',
      },
    });

    if (!quoteResponse.data.result?.routes?.length) {
      throw new Error('No routes found from Socket');
    }

    const bestRoute = quoteResponse.data.result.routes[0];

    // Build transaction
    const buildResponse = await this.socketClient.post('/build-tx', {
      route: bestRoute,
    });

    const txData = buildResponse.data.result;

    return {
      to: txData.txTarget,
      data: txData.txData,
      value: txData.value || '0',
      gasLimit: parseInt(txData.gasLimit || '300000'),
    };
  }

  /**
   * Get bridge calldata for cross-chain transfers
   */
  async getBridgeCalldata(
    step: RouteStep,
    fromAddress: string
  ): Promise<string> {
    const sourceChainId = CHAIN_IDS[step.fromChain];
    const destChainId = CHAIN_IDS[step.toChain];

    if (!sourceChainId || !destChainId) {
      throw new Error(`Unsupported chain pair: ${step.fromChain} -> ${step.toChain}`);
    }

    // Determine bridge protocol to use
    const bridgeProtocol = this.selectBridgeProtocol(step);

    logger.info(`Using ${bridgeProtocol} for bridge`, {
      from: step.fromChain,
      to: step.toChain,
      token: step.fromToken,
    });

    let calldata: BridgeCalldata;

    switch (bridgeProtocol) {
      case 'stargate':
        calldata = await this.getStargateBridgeCalldata(step, fromAddress, sourceChainId, destChainId);
        break;
      case 'lifi':
        calldata = await this.getLiFiBridgeCalldata(step, fromAddress, sourceChainId, destChainId);
        break;
      case 'socket':
        calldata = await this.getSocketBridgeCalldata(step, fromAddress, sourceChainId, destChainId);
        break;
      default:
        throw new Error(`Unsupported bridge protocol: ${bridgeProtocol}`);
    }

    return calldata.data;
  }

  /**
   * Select the best bridge protocol for a given route
   */
  private selectBridgeProtocol(step: RouteStep): string {
    // If provider is specified, use it
    if (step.provider && ['stargate', 'lifi', 'socket', 'layerzero', 'wormhole'].includes(step.provider)) {
      return step.provider;
    }

    // Default to Stargate for stablecoins (most liquid)
    if (['USDC', 'USDT', 'USDA'].includes(step.fromToken)) {
      return 'stargate';
    }

    // Use LiFi for general bridges (supports many protocols)
    return 'lifi';
  }

  /**
   * Get Stargate bridge calldata
   */
  private async getStargateBridgeCalldata(
    step: RouteStep,
    fromAddress: string,
    sourceChainId: number,
    destChainId: number
  ): Promise<BridgeCalldata> {
    // Stargate pool IDs
    const poolIds: Record<string, number> = {
      USDC: 1,
      USDT: 2,
      ETH: 13,
    };

    const poolId = poolIds[step.fromToken];
    if (!poolId) {
      throw new Error(`Token not supported by Stargate: ${step.fromToken}`);
    }

    // Get Stargate router address
    const routerAddress = BRIDGE_CONTRACTS.stargate[step.fromChain];
    if (!routerAddress) {
      throw new Error(`Stargate not available on ${step.fromChain}`);
    }

    // Stargate destination chain IDs (different from EVM chain IDs)
    const stargateChainIds: Record<number, number> = {
      1: 101,     // Ethereum
      42161: 110, // Arbitrum
      10: 111,    // Optimism
      137: 109,   // Polygon
      8453: 184,  // Base
    };

    const dstChainId = stargateChainIds[destChainId];
    if (!dstChainId) {
      throw new Error(`Destination chain not supported by Stargate: ${step.toChain}`);
    }

    // Encode swap function call
    const iface = new ethers.Interface([
      'function swap(uint16 _dstChainId, uint256 _srcPoolId, uint256 _dstPoolId, address payable _refundAddress, uint256 _amountLD, uint256 _minAmountLD, tuple(uint256 dstGasForCall, uint256 dstNativeAmount, bytes dstNativeAddr) _lzTxParams, bytes calldata _to, bytes calldata _payload) external payable',
    ]);

    const lzTxParams = {
      dstGasForCall: 0,
      dstNativeAmount: 0,
      dstNativeAddr: '0x',
    };

    const calldata = iface.encodeFunctionData('swap', [
      dstChainId,
      poolId,
      poolId, // Assume same pool on destination
      fromAddress,
      step.amount,
      BigInt(Math.floor(parseFloat(step.amount) * 0.995)), // 0.5% slippage
      lzTxParams,
      ethers.zeroPadValue(fromAddress, 32),
      '0x',
    ]);

    // Estimate native fee for LayerZero
    const nativeFee = await this.estimateStargateNativeFee(
      routerAddress,
      dstChainId,
      fromAddress,
      sourceChainId
    );

    return {
      to: routerAddress,
      data: calldata,
      value: nativeFee,
      gasLimit: 500000,
      bridgeProtocol: 'stargate',
    };
  }

  /**
   * Estimate Stargate native fee
   */
  private async estimateStargateNativeFee(
    routerAddress: string,
    dstChainId: number,
    fromAddress: string,
    sourceChainId: number
  ): Promise<string> {
    try {
      // In production, call the quoteLayerZeroFee function
      // For now, return estimated fee based on chain
      const baseFees: Record<number, string> = {
        1: '10000000000000000',      // 0.01 ETH on Ethereum
        42161: '1000000000000000',   // 0.001 ETH on Arbitrum
        10: '1000000000000000',      // 0.001 ETH on Optimism
        8453: '1000000000000000',    // 0.001 ETH on Base
        137: '100000000000000000',   // 0.1 MATIC on Polygon
      };

      return baseFees[sourceChainId] || '5000000000000000'; // Default 0.005 ETH
    } catch (error) {
      logger.warn('Failed to estimate Stargate fee, using default', { error });
      return '10000000000000000'; // 0.01 ETH default
    }
  }

  /**
   * Get LiFi bridge calldata
   */
  private async getLiFiBridgeCalldata(
    step: RouteStep,
    fromAddress: string,
    sourceChainId: number,
    destChainId: number
  ): Promise<BridgeCalldata> {
    const response = await this.lifiClient.get('/quote', {
      params: {
        fromChain: sourceChainId,
        toChain: destChainId,
        fromToken: step.fromTokenAddress || this.getNativeTokenAddress(),
        toToken: step.toTokenAddress || this.getNativeTokenAddress(),
        fromAmount: step.amount,
        fromAddress,
        slippage: 0.01, // 1%
      },
    });

    const txRequest = response.data.transactionRequest;

    if (!txRequest) {
      throw new Error('LiFi bridge quote did not return transaction');
    }

    return {
      to: txRequest.to,
      data: txRequest.data,
      value: txRequest.value || '0',
      gasLimit: parseInt(txRequest.gasLimit || '500000'),
      bridgeProtocol: 'lifi',
    };
  }

  /**
   * Get Socket bridge calldata
   */
  private async getSocketBridgeCalldata(
    step: RouteStep,
    fromAddress: string,
    sourceChainId: number,
    destChainId: number
  ): Promise<BridgeCalldata> {
    // Get quote
    const quoteResponse = await this.socketClient.get('/quote', {
      params: {
        fromChainId: sourceChainId,
        toChainId: destChainId,
        fromTokenAddress: step.fromTokenAddress || this.getNativeTokenAddress(),
        toTokenAddress: step.toTokenAddress || this.getNativeTokenAddress(),
        fromAmount: step.amount,
        userAddress: fromAddress,
        sort: 'output',
      },
    });

    if (!quoteResponse.data.result?.routes?.length) {
      throw new Error('No bridge routes found from Socket');
    }

    const bestRoute = quoteResponse.data.result.routes[0];

    // Build transaction
    const buildResponse = await this.socketClient.post('/build-tx', {
      route: bestRoute,
    });

    const txData = buildResponse.data.result;

    return {
      to: txData.txTarget,
      data: txData.txData,
      value: txData.value || '0',
      gasLimit: parseInt(txData.gasLimit || '500000'),
      bridgeProtocol: 'socket',
    };
  }

  /**
   * Get router address for a provider and chain
   */
  getRouterAddress(provider: string, chain: string): string {
    const routers = DEX_ROUTERS[provider];
    if (!routers) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const router = routers[chain];
    if (!router) {
      throw new Error(`Provider ${provider} not available on ${chain}`);
    }

    return router;
  }

  /**
   * Get chain ID
   */
  getChainId(chain: string): number {
    const chainId = CHAIN_IDS[chain];
    if (!chainId) {
      throw new Error(`Unknown chain: ${chain}`);
    }
    return chainId;
  }

  /**
   * Get native token address (0xEEE... for ETH)
   */
  private getNativeTokenAddress(): string {
    return '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  }
}

export default DexCalldataProvider;
