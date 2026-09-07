import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { MonitoringService } from '../services/MonitoringService';

const router = Router();

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { nodeId, vmId, containerId, type, from, to, limit } = req.query as any;
    const metrics = await MonitoringService.getMetrics({
      nodeId,
      vmId,
      containerId,
      type,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    res.json(metrics);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/latest/:vmId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const metrics = await MonitoringService.getLatestMetrics(req.params.vmId);
    res.json(metrics);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
