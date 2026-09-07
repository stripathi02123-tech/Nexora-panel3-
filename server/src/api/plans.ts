import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, hasAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { PlanService } from '../services/PlanService';

const router = Router();

router.get('/', authenticate, async (req: Request, res: Response) => {
  const includeInactive = req.query.all === 'true';
  const plans = await PlanService.list(includeInactive);
  res.json(plans);
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const plan = await PlanService.get(req.params.id);
    res.json(plan);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.post(
  '/',
  authenticate,
  hasAdmin,
  validate([body('name').notEmpty(), body('price').isNumeric()]),
  async (req: Request, res: Response) => {
    try {
      const plan = await PlanService.create(req.body);
      res.status(201).json(plan);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.put('/:id', authenticate, hasAdmin, async (req: Request, res: Response) => {
  try {
    const plan = await PlanService.update(req.params.id, req.body);
    res.json(plan);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, hasAdmin, async (req: Request, res: Response) => {
  try {
    await PlanService.delete(req.params.id);
    res.json({ message: 'Plan deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/stats', authenticate, hasAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await PlanService.getUsageStats(req.params.id);
    res.json(stats);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
