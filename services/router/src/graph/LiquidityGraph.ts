/**
 * Liquidity Graph
 * Builds and maintains a graph of liquidity pools across chains
 * for optimal route discovery
 */

import { PaymentIntent, Chain } from '@shared/types';
import { logger } from '@shared/utils/logger';
import { getPriceOracle } from '@shared/utils/priceOracle';
import { getRedis } from '@shared/utils/redis';
import axios from 'axios';

export interface GraphNode {
  id: string;
  chain: Chain;
  token: string;
  tokenAddress?: string;
  decimals: number;
}

export interface GraphEdge {
  id: string;
  from: GraphNode;
  to: GraphNode;
  type: 'swap' | 'bridge' | 'transfer';
  provider: string;
  cost: number;          // Fee in USD
  liquidity: number;     // Available liquidity in USD
  gasEstimate: number;   // Estimated gas cost in USD
  slippage: number;      // Expected slippage at reference amount
  lastUpdated: number;
}

interface PoolData {
  address: string;
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  fee: number;
  tvl: number;
}

interface BridgeData {
  fromChain: Chain;
  toChain: Chain;
  token: string;
  liquidity: number;
  fee: number;
  estimatedTime: number;
}

// Token addresses by chain
const TOKEN_ADDRESSES: Record<string, Record<string, { address: string; decimals: number }>> = {
  ethereum: {
    USDC: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
    USDT: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
    WETH: { address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
    DAI: { address: '0x6B175474E89094C44Da98b954EesdeCD73bBed6B', decimals: 18 },
    ETH: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  },
  arbitrum: {
    USDC: { address: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', decimals: 6 },
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
    ETH: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  },
  base: {
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    ETH: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  },
  polygon: {
    USDC: { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6 },
    USDT: { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 },
    WETH: { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
    MATIC: { address: '0x0000000000000000000000000000000000001010', decimals: 18 },
  },
  optimism: {
    USDC: { address: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', decimals: 6 },
    USDT: { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 },
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
    ETH: { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  },
  stacks: {
    STX: { address: 'native', decimals: 6 },
    USDh: { address: 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-usdh', decimals: 6 },
  },
};

// Bridge providers configuration
const BRIDGE_PROVIDERS = [
  { name: 'stargate', supportedChains: ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base'] },
  { name: 'layerzero', supportedChains: ['ethereum', 'arbitrum', 'optimism', 'polygon', 'base'] },
  { name: 'wormhole', supportedChains: ['ethereum', 'arbitrum', 'solana', 'polygon'] },
];

// DEX providers per chain
const DEX_PROVIDERS: Record<string, string[]> = {
  ethereum: ['uniswap', '1inch', 'sushiswap'],
  arbitrum: ['uniswap', '1inch', 'sushiswap', 'camelot'],
  base: ['uniswap', 'aerodrome', '1inch'],
  polygon: ['uniswap', 'quickswap', '1inch'],
  optimism: ['uniswap', 'velodrome', '1inch'],
  stacks: ['velar', 'alex'],
};

export class LiquidityGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private adjacencyList: Map<string, string[]> = new Map();
  private lastBuildTime: number = 0;
  private cacheTTL: number = 60000; // 1 minute cache

  /**
   * Build the liquidity graph for a payment intent
   */
  async build(intent: PaymentIntent): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    logger.info('Building liquidity graph', { intentId: intent.id });

    // Check cache
    const cacheKey = `graph:${intent.sourceChain}:${intent.sourceToken}`;
    const cached = await this.loadFromCache(cacheKey);
    if (cached && Date.now() - cached.buildTime < this.cacheTTL) {
      return { nodes: cached.nodes, edges: cached.edges };
    }

    // Clear existing graph
    this.nodes.clear();
    this.edges.clear();
    this.adjacencyList.clear();

    // Add source node
    const sourceNode = this.createNode(
      intent.sourceChain,
      intent.sourceToken,
      intent.sourceTokenAddress
    );
    this.addNode(sourceNode);

    // Add destination node (USDh on Stacks)
    const destNode = this.createNode('stacks', 'USDh');
    this.addNode(destNode);

    // Build graph based on source chain
    await this.buildChainSubgraph(intent.sourceChain);

    // Add bridge edges to Stacks if source is not Stacks
    if (intent.sourceChain !== 'stacks') {
      await this.buildBridgeEdges(intent.sourceChain);
      await this.buildStacksSubgraph();
    }

    // Add direct swap edges if on Stacks
    await this.addSwapEdges(intent.sourceChain, intent.sourceToken);

    this.lastBuildTime = Date.now();

    // Cache the graph
    await this.saveToCache(cacheKey, {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      buildTime: this.lastBuildTime,
    });

    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  /**
   * Build subgraph for a specific chain
   */
  private async buildChainSubgraph(chain: Chain): Promise<void> {
    const chainTokens = TOKEN_ADDRESSES[chain];
    if (!chainTokens) return;

    // Add token nodes
    for (const [token, info] of Object.entries(chainTokens)) {
      const node = this.createNode(chain, token, info.address);
      this.addNode(node);
    }

    // Add swap edges between tokens
    await this.addSwapEdges(chain);
  }

  /**
   * Build Stacks-specific subgraph
   */
  private async buildStacksSubgraph(): Promise<void> {
    // Add Stacks tokens
    const stacksTokens = TOKEN_ADDRESSES.stacks;
    for (const [token, info] of Object.entries(stacksTokens)) {
      const node = this.createNode('stacks', token, info.address);
      this.addNode(node);
    }

    // Add swap edges for Stacks DEXs
    await this.addSwapEdges('stacks');
  }

  /**
   * Build bridge edges between chains
   */
  private async buildBridgeEdges(sourceChain: Chain): Promise<void> {
    // Common bridge tokens
    const bridgeTokens = ['USDC', 'USDT', 'ETH', 'WETH'];

    for (const provider of BRIDGE_PROVIDERS) {
      if (!provider.supportedChains.includes(sourceChain)) continue;

      for (const token of bridgeTokens) {
        // Check if source has this token
        const sourceTokenInfo = TOKEN_ADDRESSES[sourceChain]?.[token];
        if (!sourceTokenInfo) continue;

        // Find destination chains
        for (const destChain of provider.supportedChains) {
          if (destChain === sourceChain) continue;

          const destTokenInfo = TOKEN_ADDRESSES[destChain]?.[token];
          if (!destTokenInfo) continue;

          // Create bridge edge
          const fromNode = this.getOrCreateNode(sourceChain as Chain, token);
          const toNode = this.getOrCreateNode(destChain as Chain, token);

          if (fromNode && toNode) {
            const edge = await this.createBridgeEdge(
              fromNode,
              toNode,
              provider.name
            );
            this.addEdge(edge);
          }
        }
      }
    }
  }

  /**
   * Add swap edges for a chain
   */
  private async addSwapEdges(chain: Chain, sourceToken?: string): Promise<void> {
    const providers = DEX_PROVIDERS[chain] || [];
    const chainTokens = TOKEN_ADDRESSES[chain];
    if (!chainTokens) return;

    const tokens = Object.keys(chainTokens);

    // Create edges between all token pairs (or just from source token)
    for (const provider of providers) {
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const tokenA = tokens[i];
          const tokenB = tokens[j];

          // Skip if sourceToken specified and neither matches
          if (sourceToken && tokenA !== sourceToken && tokenB !== sourceToken) {
            continue;
          }

          const nodeA = this.getOrCreateNode(chain, tokenA);
          const nodeB = this.getOrCreateNode(chain, tokenB);

          if (nodeA && nodeB) {
            // Add bidirectional swap edges
            const edgeAB = await this.createSwapEdge(nodeA, nodeB, provider);
            const edgeBA = await this.createSwapEdge(nodeB, nodeA, provider);

            this.addEdge(edgeAB);
            this.addEdge(edgeBA);
          }
        }
      }
    }
  }

  /**
   * Create a graph node
   */
  private createNode(chain: Chain, token: string, tokenAddress?: string): GraphNode {
    const tokenInfo = TOKEN_ADDRESSES[chain]?.[token];

    return {
      id: `${chain}:${token}`,
      chain,
      token,
      tokenAddress: tokenAddress || tokenInfo?.address,
      decimals: tokenInfo?.decimals || 18,
    };
  }

  /**
   * Get or create a node
   */
  private getOrCreateNode(chain: Chain, token: string): GraphNode | null {
    const id = `${chain}:${token}`;
    
    if (this.nodes.has(id)) {
      return this.nodes.get(id)!;
    }

    const tokenInfo = TOKEN_ADDRESSES[chain]?.[token];
    if (!tokenInfo) return null;

    const node = this.createNode(chain, token);
    this.addNode(node);
    return node;
  }

  /**
   * Add a node to the graph
   */
  addNode(node: GraphNode): void {
    if (!this.nodes.has(node.id)) {
      this.nodes.set(node.id, node);
      this.adjacencyList.set(node.id, []);
    }
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge: GraphEdge): void {
    const edgeId = `${edge.from.id}->${edge.to.id}:${edge.provider}`;
    edge.id = edgeId;

    if (!this.edges.has(edgeId)) {
      this.edges.set(edgeId, edge);

      // Update adjacency list
      const adjacentEdges = this.adjacencyList.get(edge.from.id) || [];
      adjacentEdges.push(edgeId);
      this.adjacencyList.set(edge.from.id, adjacentEdges);
    }
  }

  /**
   * Create a swap edge
   */
  private async createSwapEdge(
    from: GraphNode,
    to: GraphNode,
    provider: string
  ): Promise<GraphEdge> {
    // Fetch liquidity data (simplified)
    const liquidity = await this.fetchPoolLiquidity(from.chain, from.token, to.token, provider);

    return {
      id: '',
      from,
      to,
      type: 'swap',
      provider,
      cost: liquidity.fee,
      liquidity: liquidity.tvl,
      gasEstimate: this.estimateSwapGas(from.chain),
      slippage: this.estimateSlippage(liquidity.tvl, 1000), // For $1000 reference
      lastUpdated: Date.now(),
    };
  }

  /**
   * Create a bridge edge
   */
  private async createBridgeEdge(
    from: GraphNode,
    to: GraphNode,
    provider: string
  ): Promise<GraphEdge> {
    // Fetch bridge data (simplified)
    const bridgeData = await this.fetchBridgeLiquidity(
      from.chain,
      to.chain,
      from.token,
      provider
    );

    return {
      id: '',
      from,
      to,
      type: 'bridge',
      provider,
      cost: bridgeData.fee,
      liquidity: bridgeData.liquidity,
      gasEstimate: this.estimateBridgeGas(from.chain),
      slippage: 0.001, // Bridges typically have minimal slippage
      lastUpdated: Date.now(),
    };
  }

  /**
   * Fetch pool liquidity from DEX
   */
  private async fetchPoolLiquidity(
    chain: Chain,
    tokenA: string,
    tokenB: string,
    provider: string
  ): Promise<{ tvl: number; fee: number }> {
    // In production, this would call DEX APIs
    // For now, return estimated values
    
    const baseLiquidity: Record<string, number> = {
      ethereum: 10000000,   // $10M typical
      arbitrum: 5000000,    // $5M
      base: 2000000,        // $2M
      polygon: 3000000,     // $3M
      optimism: 2000000,    // $2M
      stacks: 500000,       // $500K
    };

    const fees: Record<string, number> = {
      uniswap: 0.003,      // 0.3%
      sushiswap: 0.003,
      '1inch': 0.001,      // 0.1% (aggregator)
      quickswap: 0.003,
      aerodrome: 0.002,
      velodrome: 0.002,
      camelot: 0.003,
      velar: 0.003,
      alex: 0.003,
    };

    return {
      tvl: baseLiquidity[chain] || 1000000,
      fee: fees[provider] || 0.003,
    };
  }

  /**
   * Fetch bridge liquidity
   */
  private async fetchBridgeLiquidity(
    fromChain: Chain,
    toChain: Chain,
    token: string,
    provider: string
  ): Promise<BridgeData> {
    // In production, this would call bridge APIs
    const baseFees: Record<string, number> = {
      stargate: 0.001,    // 0.1%
      layerzero: 0.001,
      wormhole: 0.0005,   // 0.05%
    };

    return {
      fromChain,
      toChain,
      token,
      liquidity: 5000000, // $5M typical
      fee: baseFees[provider] || 0.001,
      estimatedTime: 300, // 5 minutes
    };
  }

  /**
   * Estimate gas cost for swap
   */
  private estimateSwapGas(chain: Chain): number {
    const gasCosts: Record<Chain, number> = {
      ethereum: 15,      // ~$15 at typical gas
      arbitrum: 0.5,     // ~$0.50
      base: 0.1,         // ~$0.10
      polygon: 0.05,     // ~$0.05
      optimism: 0.2,     // ~$0.20
      stacks: 0.01,      // ~$0.01
      solana: 0.001,
      bitcoin: 5,
    };
    return gasCosts[chain] || 1;
  }

  /**
   * Estimate gas cost for bridge
   */
  private estimateBridgeGas(chain: Chain): number {
    // Bridge gas is typically higher
    return this.estimateSwapGas(chain) * 2;
  }

  /**
   * Estimate slippage based on liquidity
   */
  private estimateSlippage(tvl: number, amount: number): number {
    // Simple slippage model: slippage increases with amount/TVL ratio
    const ratio = amount / tvl;
    return Math.min(ratio * 2, 0.1); // Max 10% slippage
  }

  /**
   * Get edges from a node
   */
  getEdgesFrom(nodeId: string): GraphEdge[] {
    const edgeIds = this.adjacencyList.get(nodeId) || [];
    return edgeIds.map((id) => this.edges.get(id)!).filter(Boolean);
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Load graph from cache
   */
  private async loadFromCache(key: string): Promise<{
    nodes: GraphNode[];
    edges: GraphEdge[];
    buildTime: number;
  } | null> {
    try {
      const redis = getRedis();
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn('Failed to load graph from cache', { error });
    }
    return null;
  }

  /**
   * Save graph to cache
   */
  private async saveToCache(
    key: string,
    data: { nodes: GraphNode[]; edges: GraphEdge[]; buildTime: number }
  ): Promise<void> {
    try {
      const redis = getRedis();
      await redis.setEx(key, 120, JSON.stringify(data)); // 2 minute TTL
    } catch (error) {
      logger.warn('Failed to save graph to cache', { error });
    }
  }

  /**
   * Get all nodes
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all edges
   */
  getAllEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }
}

export default LiquidityGraph;
