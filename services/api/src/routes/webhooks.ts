import { Router, type IRouter } from 'express';
import { WebhookController } from '../controllers/WebhookController';

const router: IRouter = Router();
const controller = new WebhookController();

router.post('/payment', controller.handlePaymentWebhook.bind(controller));
router.post('/settlement', controller.handleSettlementWebhook.bind(controller));

export { router as webhookRoutes };

