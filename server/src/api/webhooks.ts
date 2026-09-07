import { Router, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { WebhookService } from '../services/WebhookService';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const webhooks = await WebhookService.list(req.user!.id);
  res.json(webhooks);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const webhook = await WebhookService.get(req.params.id);
    res.json(webhook);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.post(
  '/',
  authenticate,
  validate([body('name').notEmpty(), body('url').isURL(), body('events').notEmpty()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const webhook = await WebhookService.create(req.body, req.user!.id);
      res.status(201).json(webhook);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const webhook = await WebhookService.update(req.params.id, req.body);
    res.json(webhook);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await WebhookService.delete(req.params.id);
    res.json({ message: 'Webhook deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const webhook = await WebhookService.toggle(req.params.id, req.body.isActive);
    res.json(webhook);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/logs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const logs = await WebhookService.getLogs(req.params.id);
    res.json(logs);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
