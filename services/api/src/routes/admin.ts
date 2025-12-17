import { Router, type IRouter } from 'express';
import { AdminController } from '../controllers/AdminController';

const router: IRouter = Router();
const controller = new AdminController();

router.get('/settlements/pending', controller.getPendingSettlements.bind(controller));
router.post('/settlements/batch', controller.batchSettle.bind(controller));

export { router as adminRoutes };

