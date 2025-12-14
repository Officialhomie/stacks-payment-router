import { PaymentIntent, Route, RouteStep } from '@shared/types';
import { LiquidityGraph, GraphNode } from './graph/LiquidityGraph';
import { RouteOptimizer } from './algorithms/RouteOptimizer';
import { DexAggregator } from './providers/DexAggregator';
import { GasEstimator } from './gas/GasEstimator';
import { logger } from '@shared/utils/logger';

export class RoutingEngine {
  private liquidityGraph: LiquidityGraph;
  private routeOptimizer: RouteOptimizer;
  private dexAggregator: DexAggregator;
  private gasEstimator: GasEstimator;

  constructor() {
    this.liquidityGraph = new LiquidityGraph();
    this.routeOptimizer = new RouteOptimizer();
    this.dexAggregator = new DexAggregator();
    this.gasEstimator = new GasEstimator();
  }

  async findOptimalRoute(intent: PaymentIntent): Promise<Route> {
    logger.info('Finding optimal route', { intentId: intent.id });

    // Build liquidity graph
    const graph = await this.liquidityGraph.build(intent);

    // Create source and destination nodes
    const sourceNode: GraphNode = {
      id: `${intent.sourceChain}:${intent.sourceToken}`,
      chain: intent.sourceChain,
      token: intent.sourceToken,
      tokenAddress: intent.sourceTokenAddress,
      decimals: 18, // Default, would be looked up
    };

    const destNode: GraphNode = {
      id: 'stacks:USDh',
      chain: 'stacks',
      token: 'USDh',
      decimals: 6,
    };

    // Find all possible routes
    const routes = await this.routeOptimizer.findAllRoutes(
      graph,
      sourceNode,
      destNode
    );

    // Score and rank routes
    const scoredRoutes = await Promise.all(routes.map((route) => this.scoreRoute(route, intent)));

    // Select best route
    const bestRoute = scoredRoutes.sort((a, b) => a.totalCostUSD - b.totalCostUSD)[0];

    if (!bestRoute) {
      throw new Error('No route found');
    }

    return bestRoute;
  }

  private async scoreRoute(route: Route, intent: PaymentIntent): Promise<Route> {
    // Calculate total costs
    let totalGasUSD = 0;
    let totalFeesUSD = 0;
    let totalSlippageUSD = 0;

    for (const step of route.steps) {
      const gasUSD = await this.gasEstimator.estimate(step.fromChain, step.type, step.amount);
      totalGasUSD += gasUSD;
      totalFeesUSD += step.fee;

      if (step.type === 'swap') {
        const slippageUSD = parseFloat(step.amount) * (step.estimatedSlippage || 0);
        totalSlippageUSD += slippageUSD;
      }
    }

    route.totalCostUSD = totalGasUSD + totalFeesUSD + totalSlippageUSD;
    route.estimatedGasCostUSD = totalGasUSD;
    route.estimatedSlippage = totalSlippageUSD / parseFloat(intent.amount);

    return route;
  }
}

