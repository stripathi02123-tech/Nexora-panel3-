import { Router, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { FirewallService } from '../services/FirewallService';
import { prisma } from '../utils/database';

const router = Router();

async function canAccessTarget(user: { id: string; role: string }, vmId?: string, containerId?: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (vmId) {
    const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId }, select: { userId: true } });
    return !!vm && vm.userId === user.id;
  }
  if (containerId) {
    const container = await prisma.container.findUnique({ where: { id: containerId }, select: { userId: true } });
    return !!container && container.userId === user.id;
  }
  return false;
}

async function loadRuleOwner(req: AuthRequest, res: Response): Promise<any | null> {
  const rule = await prisma.firewallRule.findUnique({ where: { id: req.params.id } });
  if (!rule) {
    res.status(404).json({ error: 'Firewall rule not found' });
    return null;
  }
  if (!(await canAccessTarget(req.user!, rule.vmId || undefined, rule.containerId || undefined))) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return rule;
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { vmId, containerId } = req.query as { vmId?: string; containerId?: string };
    if (req.user!.role !== 'ADMIN' && !(await canAccessTarget(req.user!, vmId, containerId))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json(await FirewallService.list(vmId, containerId));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await loadRuleOwner(req, res))) return;
    res.json(await FirewallService.get(req.params.id));
  } catch (error: any) { res.status(404).json({ error: error.message }); }
});

router.post('/', authenticate, validate([body('name').notEmpty()]), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessTarget(req.user!, req.body.vmId, req.body.containerId))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!req.body.vmId && !req.body.containerId) {
      res.status(400).json({ error: 'vmId or containerId is required' });
      return;
    }
    res.status(201).json(await FirewallService.create(req.body));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rule = await loadRuleOwner(req, res);
    if (!rule) return;
    if (req.user!.role !== 'ADMIN' && (req.body.vmId !== undefined || req.body.containerId !== undefined)) {
      res.status(400).json({ error: 'Firewall rule target cannot be changed by this request' });
      return;
    }
    const safeData = {
      ...(req.body.name !== undefined ? { name: req.body.name } : {}),
      ...(req.body.rule !== undefined ? { rule: req.body.rule } : {}),
      ...(req.body.direction !== undefined ? { direction: req.body.direction } : {}),
      ...(req.body.action !== undefined ? { action: req.body.action } : {}),
      ...(req.body.protocol !== undefined ? { protocol: req.body.protocol } : {}),
      ...(req.body.sourcePort !== undefined ? { sourcePort: req.body.sourcePort === '' ? null : Number(req.body.sourcePort) } : {}),
      ...(req.body.destPort !== undefined ? { destPort: req.body.destPort === '' ? null : Number(req.body.destPort) } : {}),
      ...(req.body.sourceIp !== undefined ? { sourceIp: req.body.sourceIp || null } : {}),
      ...(req.body.destIp !== undefined ? { destIp: req.body.destIp || null } : {}),
      ...(req.body.priority !== undefined ? { priority: Number(req.body.priority) || 0 } : {}),
      ...(req.body.enabled !== undefined ? { enabled: Boolean(req.body.enabled) } : {}),
    };
    res.json(await FirewallService.update(req.params.id, safeData));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await loadRuleOwner(req, res))) return;
    await FirewallService.delete(req.params.id);
    res.json({ message: 'Rule deleted' });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/toggle', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await loadRuleOwner(req, res))) return;
    res.json(await FirewallService.toggle(req.params.id, Boolean(req.body.enabled)));
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/apply', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessTarget(req.user!, req.body.vmId, req.body.containerId))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await FirewallService.applyRules(req.body.vmId, req.body.containerId);
    res.json({ message: 'Rules prepared for application' });
  } catch (error: any) { res.status(400).json({ error: error.message }); }
});

export default router;
