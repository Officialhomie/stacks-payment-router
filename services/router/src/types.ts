import { Route, RouteStep, Chain, Token } from '@shared/types';

export interface DexQuote {
  provider: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  gasEstimate: number;
  fee: number;
  slippage: number;
  route: any[];
}

export interface LiquidityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  chain: Chain;
  token: Token;
  address?: string;
}

export interface GraphEdge {
  from: GraphNode;
  to: GraphNode;
  type: 'swap' | 'bridge';
  provider: string;
  cost: number;
  gasEstimate: number;
  slippage: number;
  timeEstimate: number;
}

