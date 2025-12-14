import { Router, type IRouter } from 'express';
import { QuoteController } from '../controllers/QuoteController';

const router: IRouter = Router();
const controller = new QuoteController();

router.post('/', controller.getQuote.bind(controller));
router.get('/:quoteId', controller.getQuoteDetails.bind(controller));

export { router as quoteRoutes };

