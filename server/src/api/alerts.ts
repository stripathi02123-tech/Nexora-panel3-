import { Router, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { prisma } from '../utils/database';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const alerts = await prisma.alert.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(alerts);
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!alert) {
    res.status(404).json({ error: 'Alert not found' });
    return;
  }
  res.json(alert);
});

router.post(
  '/',
  authenticate,
  validate([body('name').notEmpty(), body('threshold').isNumeric()]),
  async (req: AuthRequest, res: Response) => {
    try {
      const alert = await prisma.alert.create({
        data: {
          userId: req.user!.id,
          name: req.body.name,
          metric: req.body.metric || 'CPU',
          condition: req.body.condition || 'GT',
          threshold: parseFloat(req.body.threshold),
          enabled: req.body.enabled !== false,
          notifyEmail: req.body.notifyEmail,
          notifyWebhook: req.body.notifyWebhook,
        },
      });
      res.status(201).json(alert);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    const updated = await prisma.alert.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        metric: req.body.metric,
        condition: req.body.condition,
        threshold: req.body.threshold ? parseFloat(req.body.threshold) : undefined,
        enabled: req.body.enabled,
        notifyEmail: req.body.notifyEmail,
        notifyWebhook: req.body.notifyWebhook,
      },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    await prisma.alert.delete({ where: { id: req.params.id } });
    res.json({ message: 'Alert deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const alert = await prisma.alert.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    const updated = await prisma.alert.update({
      where: { id: req.params.id },
      data: { enabled: !alert.enabled },
    });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
