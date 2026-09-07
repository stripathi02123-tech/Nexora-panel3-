import { Router, Response } from 'express';
import { AuthRequest, authenticate, hasAdmin } from '../middleware/auth';
import { prisma } from '../utils/database';
import { NodeService } from '../services/NodeService';

const router = Router();

router.get('/stats', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const [
    totalUsers,
    activeUsers,
    totalNodes,
    onlineNodes,
    totalVMs,
    runningVMs,
    totalContainers,
    runningContainers,
    totalDocker,
    activeSubscriptions,
    totalInvoices,
    paidInvoices,
    recentLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.node.count(),
    prisma.node.count({ where: { status: 'ONLINE' } }),
    prisma.virtualMachine.count(),
    prisma.virtualMachine.count({ where: { status: 'running' } }),
    prisma.container.count(),
    prisma.container.count({ where: { status: 'running' } }),
    prisma.dockerContainer.count(),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.invoice.count(),
    prisma.invoice.count({ where: { status: 'PAID' } }),
    prisma.auditLog.count({ where: { timestamp: { gte: new Date(Date.now() - 86400000) } } }),
  ]);

  res.json({
    users: { total: totalUsers, active: activeUsers },
    nodes: { total: totalNodes, online: onlineNodes },
    vms: { total: totalVMs, running: runningVMs },
    containers: { total: totalContainers, running: runningContainers },
    docker: { total: totalDocker },
    billing: { activeSubscriptions, totalInvoices, paidInvoices },
    activity: { last24hLogs: recentLogs },
  });
});

router.get('/system', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const used = process.memoryUsage();
  res.json({
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(used.heapUsed / 1024 / 1024),
      heapTotal: Math.round(used.heapTotal / 1024 / 1024),
      rss: Math.round(used.rss / 1024 / 1024),
    },
    cpuUsage: process.cpuUsage(),
  });
});

router.get('/users', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count(),
  ]);

  res.json({ data: users, total, page, limit });
});

router.get('/users/:id', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: { id: true, email: true, name: true, role: true, isActive: true, avatar: true, createdAt: true, updatedAt: true },
  });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const usage = await prisma.$transaction([
    prisma.virtualMachine.count({ where: { userId: req.params.id } }),
    prisma.container.count({ where: { userId: req.params.id } }),
    prisma.dockerContainer.count({ where: { userId: req.params.id } }),
    prisma.subscription.findFirst({ where: { userId: req.params.id, status: 'ACTIVE' }, include: { plan: true } }),
  ]);
  res.json({ ...user, usage: { vms: usage[0], containers: usage[1], dockerContainers: usage[2] }, subscription: usage[3] });
});

router.put('/users/:id', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        role: req.body.role,
        isActive: req.body.isActive,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/users/:id', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ message: 'User deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/health', async (req: AuthRequest, res: Response) => {
  const dbOnline = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbOnline ? 'connected' : 'disconnected',
  });
});

router.get('/nodes/check-all', authenticate, hasAdmin, async (req: AuthRequest, res: Response) => {
  await NodeService.checkAllNodes();
  res.json({ message: 'Node health check completed' });
});

export default router;
