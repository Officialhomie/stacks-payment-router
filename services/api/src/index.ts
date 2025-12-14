import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/errorHandler';
import { securityHeaders, requestLogger } from './middleware/security';
import { logger } from '@shared/utils/logger';
import { agentRoutes } from './routes/agents';
import { paymentRoutes } from './routes/payments';
import { quoteRoutes } from './routes/quotes';
import { webhookRoutes } from './routes/webhooks';

dotenv.config();

const app: express.Application = express();
const PORT = process.env.API_PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(securityHeaders);
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests, please try again later.',
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/quotes', quoteRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Error handling
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
});

export default app;

