import { Route, RouteStep } from '@shared/types';
import { GraphNode, GraphEdge, LiquidityGraph } from '../graph/LiquidityGraph';
import { logger } from '@shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class RouteOptimizer {
  async findAllRoutes(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] },
    from: GraphNode,
    to: GraphNode
  ): Promise<Route[]> {
    logger.info('Finding routes', { from: `${from.chain}:${from.token}`, to: `${to.chain}:${to.token}` });

    // Simplified Dijkstra's algorithm for MVP
    // In production, would use a proper graph library
    const routes: Route[] = [];

    // Direct route (if exists)
    const directRoute = this.findDirectRoute(graph, from, to);
    if (directRoute) {
      routes.push(directRoute);
    }

    // One-hop routes (source -> intermediate -> destination)
    const oneHopRoutes = this.findOneHopRoutes(graph, from, to);
    routes.push(...oneHopRoutes);

    // For MVP, limit to 3 routes
    return routes.slice(0, 3);
  }

  private findDirectRoute(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] },
    from: GraphNode,
    to: GraphNode
  ): Route | null {
    const edge = graph.edges.find(
      (e) =>
        e.from.chain === from.chain &&
        e.from.token === from.token &&
        e.to.chain === to.chain &&
        e.to.token === to.token
    );

    if (!edge) {
      return null;
    }

    const step: RouteStep = {
      type: edge.type,
      fromChain: edge.from.chain as any,
      toChain: edge.to.chain as any,
      fromToken: edge.from.token as any,
      toToken: edge.to.token as any,
      amount: '0', // Will be set by caller
      provider: edge.provider,
      gasEstimate: 0,
      fee: edge.cost,
    };

    return {
      id: uuidv4(),
      paymentIntentId: '',
      routeType: 'direct',
      steps: [step],
      estimatedGasCostUSD: 0,
      estimatedSlippage: 0,
      estimatedTimeSeconds: 300,
      totalCostUSD: edge.cost,
      status: 'pending',
      createdAt: new Date(),
    };
  }

  private findOneHopRoutes(
    graph: { nodes: GraphNode[]; edges: GraphEdge[] },
    from: GraphNode,
    to: GraphNode
  ): Route[] {
    const routes: Route[] = [];

    // Find intermediate nodes
    const intermediateNodes = graph.nodes.filter(
      (node) => node.chain !== from.chain && node.chain !== to.chain
    );

    for (const intermediate of intermediateNodes) {
      const edge1 = graph.edges.find(
        (e) =>
          e.from.chain === from.chain &&
          e.from.token === from.token &&
          e.to.chain === intermediate.chain &&
          e.to.token === intermediate.token
      );

      const edge2 = graph.edges.find(
        (e) =>
          e.from.chain === intermediate.chain &&
          e.from.token === intermediate.token &&
          e.to.chain === to.chain &&
          e.to.token === to.token
      );

      if (edge1 && edge2) {
        const step1: RouteStep = {
          type: edge1.type,
          fromChain: edge1.from.chain as any,
          toChain: edge1.to.chain as any,
          fromToken: edge1.from.token as any,
          toToken: edge1.to.token as any,
          amount: '0',
          provider: edge1.provider,
          gasEstimate: 0,
          fee: edge1.cost,
        };

        const step2: RouteStep = {
          type: edge2.type,
          fromChain: edge2.from.chain as any,
          toChain: edge2.to.chain as any,
          fromToken: edge2.from.token as any,
          toToken: edge2.to.token as any,
          amount: '0',
          provider: edge2.provider,
          gasEstimate: 0,
          fee: edge2.cost,
        };

        routes.push({
          id: uuidv4(),
          paymentIntentId: '',
          routeType: 'multi_hop',
          steps: [step1, step2],
          estimatedGasCostUSD: 0,
          estimatedSlippage: 0,
          estimatedTimeSeconds: 600,
          totalCostUSD: edge1.cost + edge2.cost,
          status: 'pending',
          createdAt: new Date(),
        });
      }
    }

    return routes;
  }
}

