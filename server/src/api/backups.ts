import { Router, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { BackupService } from '../services/BackupService';
import { prisma } from '../utils/database';

const router = Router();

async function canAccessBackup(user: { id: string; role: string }, id: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const backup = await prisma.backup.findUnique({ where: { id }, select: { vmId: true, containerId: true } });
  if (!backup) return false;
  if (backup.vmId) {
    const vm = await prisma.virtualMachine.findUnique({ where: { id: backup.vmId }, select: { userId: true } });
    return !!vm && vm.userId === user.id;
  }
  if (backup.containerId) {
    const container = await prisma.container.findUnique({ where: { id: backup.containerId }, select: { userId: true } });
    return !!container && container.userId === user.id;
  }
  return false;
}

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

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { vmId, containerId } = req.query as { vmId?: string; containerId?: string };
    if (req.user!.role !== 'ADMIN' && !(await canAccessTarget(req.user!, vmId, containerId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await BackupService.list(vmId, containerId));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessBackup(req.user!, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.json(await BackupService.get(req.params.id));
  } catch (error: any) {
    return res.status(404).json({ error: error.message });
  }
});

router.post('/', authenticate, validate([body('name').notEmpty()]), async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessTarget(req.user!, req.body.vmId, req.body.containerId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return res.status(201).json(await BackupService.create(req.body));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await canAccessBackup(req.user!, req.params.id))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await BackupService.delete(req.params.id);
    return res.json({ message: 'Backup deleted' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

export default router;
