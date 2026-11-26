import { Router } from 'express';
import * as suggestionController from '../controllers/suggestion.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Secure all suggestion routes
router.use(requireAuth);

router.get('/', suggestionController.getSuggestions);
router.post('/:suggestionId/feedback', suggestionController.submitFeedback);
router.post('/:suggestionId/dismiss', suggestionController.dismissSuggestion);

export default router;
