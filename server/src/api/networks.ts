import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate, hasAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NetworkService } from '../services/NetworkService';

const router = Router();
router.use(authenticate, hasAdmin);

router.get('/', async (req: Request, res: Response) => {
  try {
    res.json(await NetworkService.list(req.query.nodeId as string | undefined));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list networks' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try { res.json(await NetworkService.get(req.params.id)); }
  catch (error: any) { res.status(404).json({ error: error.message }); }
});

router.post(
  '/',
  validate([body('nodeId').notEmpty(), body('name').notEmpty()]),
  async (req: Request, res: Response) => {
    try { res.status(201).json(await NetworkService.create(req.body)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
);

router.put('/:id', async (req: Request, res: Response) => {
  try { res.json(await NetworkService.update(req.params.id, req.body)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try { await NetworkService.delete(req.params.id); res.json({ message: 'Network deleted' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id/ips', async (req: Request, res: Response) => {
  try { res.json(await NetworkService.getAvailableIPs(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/allocate', async (req: Request, res: Response) => {
  try { res.json(await NetworkService.allocateIP(req.params.id, req.body.type || 'IPV4')); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/ips/:ipId/release', async (req: Request, res: Response) => {
  try { await NetworkService.releaseIP(req.params.ipId); res.json({ message: 'IP released' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

export default router;
