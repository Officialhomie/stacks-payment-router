import { Router, type IRouter } from 'express';
import { AdminController } from '../controllers/AdminController';
import { adminAuth } from '../middleware/admin-auth';

const router: IRouter = Router();
const controller = new AdminController();

// Apply admin authentication to all routes
router.use(adminAuth);

router.get('/settlements/pending', controller.getPendingSettlements.bind(controller));
router.post('/settlements/:intentId', controller.settlePayment.bind(controller));
router.post('/settlements/batch', controller.batchSettle.bind(controller));

export { router as adminRoutes };

