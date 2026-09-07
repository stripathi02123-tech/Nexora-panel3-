import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { ContainerService } from '../services/ContainerService';
import { prisma } from '../utils/database';

const router = Router();

async function loadOwnedContainer(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const container = await prisma.container.findUnique({ where: { id: req.params.id } });
    if (!container) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    if (req.user!.role !== 'ADMIN' && container.userId !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load container' });
  }
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.role === 'ADMIN' ? (req.query.userId as string | undefined) : req.user!.id;
    res.json(await ContainerService.list(userId));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list containers' });
  }
});

router.get('/:id', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { res.json(await ContainerService.get(req.params.id)); }
  catch (error: any) { res.status(404).json({ error: error.message }); }
});

router.post(
  '/',
  authenticate,
  validate([body('nodeId').notEmpty(), body('name').notEmpty()]),
  async (req: AuthRequest, res: Response) => {
    try {
      res.status(201).json(await ContainerService.create(req.body, req.user!.id));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

router.delete('/:id', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { await ContainerService.delete(req.params.id); res.json({ message: 'Container deleted' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/start', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { await ContainerService.start(req.params.id); res.json({ message: 'Container starting' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/stop', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { await ContainerService.stop(req.params.id); res.json({ message: 'Container stopping' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/restart', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { await ContainerService.restart(req.params.id); res.json({ message: 'Container restarting' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id/config', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { res.json(await ContainerService.getConfig(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.put('/:id/config', authenticate, loadOwnedContainer, async (req: AuthRequest, res: Response) => {
  try { await ContainerService.updateConfig(req.params.id, req.body); res.json({ message: 'Configuration updated' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

export default router;
