import { Router, type IRouter } from 'express';
import { PaymentController } from '../controllers/PaymentController';
import { PaymentFlowController } from '../controllers/PaymentFlowController';

const router: IRouter = Router();
const controller = new PaymentController();
const flowController = new PaymentFlowController();

router.post('/intent', controller.createIntent.bind(controller));
router.get('/intent/:intentId', controller.getIntent.bind(controller));
router.get('/intent/:intentId/status', controller.getStatus.bind(controller));
router.post('/intent/:intentId/process', flowController.processPayment.bind(flowController));

export { router as paymentRoutes };
