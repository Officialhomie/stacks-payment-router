import { Router, type IRouter } from 'express';
import { AgentController } from '../controllers/AgentController';
import { validateRequest } from '../middleware/validate';
import { agentRegistrationSchema } from '../schemas/agent';

const router: IRouter = Router();
const controller = new AgentController();

router.post(
  '/register',
  validateRequest(agentRegistrationSchema),
  controller.register.bind(controller)
);

router.get('/:agentId', controller.getAgent.bind(controller));
router.get('/:agentId/balance', controller.getBalance.bind(controller));
router.get('/:agentId/payments', controller.getAgentPayments.bind(controller));
router.get('/:agentId/vault', controller.getVaultStats.bind(controller));
router.get('/:agentId/withdrawals', controller.getWithdrawalHistory.bind(controller));
router.put('/:agentId', controller.updateAgent.bind(controller));
router.get('/addresses', controller.getAddresses.bind(controller));
router.post('/:agentId/withdraw', controller.withdraw.bind(controller));

export { router as agentRoutes };

