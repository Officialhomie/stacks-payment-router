/**
 * Chainhooks Service Entry Point
 * Monitors Stacks payment-router contract for user and fee metrics
 */

import dotenv from 'dotenv';
import { ChainhooksService, ChainhooksServiceConfig } from './ChainhooksService';
import { MetricsApi, ApiConfig } from './api';
import { logger } from '@shared/utils/logger';

// Load environment variables
dotenv.config();

/**
 * Main function
 */
async function main() {
  logger.info('Starting Chainhooks service');

  // Load configuration from environment
  const config: ChainhooksServiceConfig = {
    // Server settings (where this service receives chainhook events)
    serverHostname: process.env.CHAINHOOK_SERVER_HOSTNAME || '0.0.0.0',
    serverPort: parseInt(process.env.CHAINHOOK_SERVER_PORT || '3100'),
    serverAuthToken: process.env.CHAINHOOK_SERVER_AUTH_TOKEN || 'your-secret-token',
    externalBaseUrl: process.env.CHAINHOOK_EXTERNAL_BASE_URL || 'http://localhost:3100',

    // Chainhook node settings (Hiro Platform chainhook node)
    chainhookNodeUrl: process.env.CHAINHOOK_NODE_URL || 'http://localhost:20456',

    // Contract settings
    contractAddress:
      process.env.PAYMENT_ROUTER_CONTRACT ||
      'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.payment-router-v2',
    network: (process.env.STACKS_NETWORK as 'mainnet' | 'testnet' | 'devnet') || 'devnet',
    startBlock: process.env.CHAINHOOK_START_BLOCK
      ? parseInt(process.env.CHAINHOOK_START_BLOCK)
      : undefined,
  };

  // API server configuration
  const apiConfig: ApiConfig = {
    hostname: process.env.METRICS_API_HOSTNAME || '0.0.0.0',
    port: parseInt(process.env.METRICS_API_PORT || '3101'),
  };

  // Validate required configuration
  if (!config.serverAuthToken || config.serverAuthToken === 'your-secret-token') {
    logger.warn(
      'WARNING: Using default auth token. Set CHAINHOOK_SERVER_AUTH_TOKEN in production!'
    );
  }

  try {
    // Create and initialize the service
    const service = new ChainhooksService(config);
    await service.initialize();

    // Start the observer
    await service.start();

    // Start the metrics API server
    const api = new MetricsApi(service.getMetricsTracker(), apiConfig);
    await api.start();

    logger.info('Chainhooks service is now running', {
      chainhookPort: config.serverPort,
      metricsApiPort: apiConfig.port,
      network: config.network,
      contract: config.contractAddress,
    });

    logger.info('API Endpoints available at:', {
      health: `http://localhost:${apiConfig.port}/health`,
      protocolMetrics: `http://localhost:${apiConfig.port}/metrics/protocol`,
      userMetrics: `http://localhost:${apiConfig.port}/metrics/users`,
      feeMetrics: `http://localhost:${apiConfig.port}/metrics/fees`,
      summary: `http://localhost:${apiConfig.port}/metrics/summary`,
    });

    // Export metrics tracker for API access
    (global as any).metricsTracker = service.getMetricsTracker();
  } catch (error) {
    logger.error('Failed to start Chainhooks service', { error });
    process.exit(1);
  }
}

// Start the service
main().catch((error) => {
  logger.error('Unhandled error in main', { error });
  process.exit(1);
});

// Export for programmatic usage
export { ChainhooksService } from './ChainhooksService';
export { MetricsTracker } from './MetricsTracker';
export { MetricsApi } from './api';
