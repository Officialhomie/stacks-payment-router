// Main entry point for settlement service
import { SettlementEngine } from './SettlementEngine';
import { logger } from '@shared/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  logger.info('Starting settlement service...');

  const settlementEngine = new SettlementEngine();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  // Health check endpoint
  const http = require('http');
  const server = http.createServer((req: any, res: any) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const port = process.env.SETTLEMENT_PORT || 3003;
  server.listen(port, () => {
    logger.info(`Settlement service health check running on port ${port}`);
  });

  logger.info('Settlement service started successfully');
}

if (require.main === module) {
  main();
}

export { SettlementEngine };
export * from './usdh/USDhService';
export * from './vault/YieldVault';
