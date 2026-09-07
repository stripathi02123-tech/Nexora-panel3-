import { Router, Response } from 'express';
import { AuthRequest, authenticate, hasAdmin } from '../middleware/auth';
import { AuditService } from '../services/AuditService';

const router = Router();

router.get('/', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const { userId, action, resource, from, to, page, limit } = req.query as any;
  const result = await AuditService.list({
    userId,
    action,
    resource,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    page: page ? parseInt(page) : 1,
    limit: limit ? parseInt(limit) : 25,
  });
  res.json(result);
});

router.get('/stats', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const stats = await AuditService.getStats();
  res.json(stats);
});

router.post('/prune', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const days = req.body.days || 90;
  const count = await AuditService.pruneOlderThan(days);
  res.json({ message: `Pruned ${count} audit logs` });
});

export default router;
