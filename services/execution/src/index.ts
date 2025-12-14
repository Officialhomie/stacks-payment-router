// Main entry point for execution service
import { ExecutionService } from './ExecutionService';
import { logger } from '@shared/utils/logger';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  logger.info('Starting execution service...');

  const executionService = new ExecutionService();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
  });

  // Health check endpoint (simple HTTP server)
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

  const port = process.env.EXECUTION_PORT || 3004;
  server.listen(port, () => {
    logger.info(`Execution service health check running on port ${port}`);
  });

  logger.info('Execution service started successfully');
}

if (require.main === module) {
  main();
}

export { ExecutionService };
