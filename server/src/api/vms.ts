import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate, hasAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { VMService } from '../services/VMService';
import { prisma } from '../utils/database';

const router = Router();

async function loadOwnedVm(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const vm = await prisma.virtualMachine.findUnique({ where: { id: req.params.id } });
    if (!vm) {
      res.status(404).json({ error: 'VM not found' });
      return;
    }
    if (req.user!.role !== 'ADMIN' && vm.userId !== req.user!.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    (req as AuthRequest & { vm?: typeof vm }).vm = vm;
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load VM' });
  }
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.role === 'ADMIN' ? (req.query.userId as string | undefined) : req.user!.id;
    res.json(await VMService.list(userId));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list VMs' });
  }
});

router.get('/:id', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json(await VMService.get(req.params.id)); }
  catch (error: any) { res.status(404).json({ error: error.message }); }
});

router.post('/', authenticate, validate([body('nodeId').notEmpty(), body('name').notEmpty()]), async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await VMService.create(req.body, req.user!.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.delete('/:id', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.delete(req.params.id); res.json({ message: 'VM deleted' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.post('/:id/start', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.start(req.params.id); res.json({ message: 'VM starting' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/stop', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.stop(req.params.id); res.json({ message: 'VM stopping' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/restart', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.restart(req.params.id); res.json({ message: 'VM restarting' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/shutdown', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.shutdown(req.params.id); res.json({ message: 'VM shutting down' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/suspend', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.suspend(req.params.id); res.json({ message: 'VM suspended' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/resume', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.resume(req.params.id); res.json({ message: 'VM resumed' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/migrate', authenticate, hasAdmin, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.migrate(req.params.id, req.body.target); res.json({ message: 'VM migration initiated' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id/config', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json(await VMService.getConfig(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.put('/:id/config', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.updateConfig(req.params.id, req.body); res.json({ message: 'Configuration updated' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id/snapshots', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json(await VMService.getSnapshots(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/snapshots', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await VMService.createSnapshot(req.params.id, req.body.name, req.body.description)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.delete('/:id/snapshots/:snapshotId', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.deleteSnapshot(req.params.id, req.params.snapshotId); res.json({ message: 'Snapshot deleted' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/snapshots/:snapshotId/rollback', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.rollbackSnapshot(req.params.id, req.params.snapshotId); res.json({ message: 'Rollback initiated' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id/backups', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json(await VMService.getBackups(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/backups', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.status(201).json(await VMService.createBackup(req.params.id, req.body.name, req.body.storage)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.post('/:id/backups/:backupId/restore', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { await VMService.restoreBackup(req.params.id, req.params.backupId); res.json({ message: 'Backup restore initiated' }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

router.get('/:id/console', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json(await VMService.getConsole(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.get('/:id/metrics', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json(await VMService.getMetrics(req.params.id)); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});
router.get('/:id/vnc', authenticate, loadOwnedVm, async (req: AuthRequest, res: Response) => {
  try { res.json({ url: await VMService.getVncUrl(req.params.id) }); }
  catch (error: any) { res.status(400).json({ error: error.message }); }
});

export default router;
