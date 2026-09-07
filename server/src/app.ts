import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { logger } from './utils/logger';
import { authenticate, AuthRequest, hasAdmin } from './middleware/auth';
import { prisma } from './utils/database';

import authRoutes from './api/auth';
import nodeRoutes from './api/nodes';
import vmRoutes from './api/vms';
import containerRoutes from './api/containers';
import dockerRoutes from './api/docker';
import planRoutes from './api/plans';
import billingRoutes from './api/billing';
import firewallRoutes from './api/firewall';
import networkRoutes from './api/networks';
import sshKeyRoutes from './api/sshkeys';
import dnsRoutes from './api/dns';
import alertRoutes from './api/alerts';
import webhookRoutes from './api/webhooks';
import auditRoutes from './api/audit';
import adminRoutes from './api/admin';
import metricRoutes from './api/metrics';
import templateRoutes from './api/templates';
import backupRoutes from './api/backups';
import nodeSystemRoutes from './api/nodesystem';
import locationRoutes from './api/locations';
import licenseRoutes from './api/license';
import { requireLicense } from './middleware/license';
import { setSocketIO } from './services/MonitoringService';

const app = express();
const httpServer = createServer(app);

// Development/preview environments can regenerate their hostname. Keep the
// normal production CORS_ORIGIN allowlist exact, while allowing trusted
// development hosts used by Vite/CodeSandbox without requiring a reinstall.
const codeSandboxOriginPattern = /^https:\/\/[a-z0-9][a-z0-9-]*(?:-[0-9]+)?\.csb\.app(?::\d+)?$/i;
const localDevelopmentOriginPattern = /^http:\/\/(?:localhost|127\.0\.0\.1):(5173|8080|8081)$/i;

const isAllowedCorsOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  return (
    config.corsOrigins.includes('*') ||
    config.corsOrigins.includes(origin) ||
    codeSandboxOriginPattern.test(origin) ||
    localDevelopmentOriginPattern.test(origin)
  );
};

const allowCorsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (isAllowedCorsOrigin(origin)) {
    callback(null, true);
    return;
  }
  logger.warn(
    `CORS rejected request from origin "${origin}". Allowed origins: [${config.corsOrigins.join(', ')}] plus supported preview/development origins. ` +
    `If this origin is legitimate, add it to CORS_ORIGIN in server/.env (comma-separated for multiple) and restart the server.`
  );
  callback(new Error('Origin not allowed by CORS'));
};

const io = new SocketServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: !config.corsOrigins.includes('*'),
  },
});

setSocketIO(io);

io.use(async (socket, next) => {
  try {
    const rawToken = socket.handshake.auth?.token || socket.handshake.query?.token;
    const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
    if (!token || typeof token !== 'string') return next(new Error('Authentication required'));
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; email: string; name: string; role: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true, email: true, name: true, role: true, isActive: true } });
    if (!user || !user.isActive) return next(new Error('Authentication failed'));
    socket.data.user = user;
    return next();
  } catch {
    return next(new Error('Authentication failed'));
  }
});

async function canSubscribeToVm(user: { id: string; role: string }, vmId: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId }, select: { userId: true } });
  return !!vm?.userId && vm.userId === user.id;
}

async function canSubscribeToContainer(user: { id: string; role: string }, containerId: string): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  const container = await prisma.container.findUnique({ where: { id: containerId }, select: { userId: true } });
  return !!container?.userId && container.userId === user.id;
}

async function requireDockerContainerAccess(req: AuthRequest, res: express.Response, next: express.NextFunction): Promise<void> {
  try {
    const container = await prisma.dockerContainer.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!container) return void res.status(404).json({ error: 'Docker container not found' });
    if (req.user!.role !== 'ADMIN' && container.userId !== req.user!.id) return void res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to verify Docker container access' });
  }
}

async function requireComposeAccess(req: AuthRequest, res: express.Response, next: express.NextFunction): Promise<void> {
  try {
    const compose = await prisma.dockerCompose.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!compose) return void res.status(404).json({ error: 'Docker compose project not found' });
    if (req.user!.role !== 'ADMIN' && compose.userId !== req.user!.id) return void res.status(403).json({ error: 'Forbidden' });
    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to verify compose access' });
  }
}

const adminDockerResource = [authenticate, hasAdmin];

io.on('connection', (socket) => {
  const user = socket.data.user as { id: string; role: string };
  logger.info(`WebSocket client connected: ${socket.id} user=${user.id}`);
  socket.on('subscribe:node', (nodeId: string) => {
    if (user.role !== 'ADMIN') return void socket.emit('subscription:error', { resource: 'node', id: nodeId, error: 'Insufficient permissions' });
    socket.join(`node:${nodeId}`);
  });
  socket.on('subscribe:vm', async (vmId: string) => {
    if (await canSubscribeToVm(user, vmId)) socket.join(`vm:${vmId}`);
    else socket.emit('subscription:error', { resource: 'vm', id: vmId, error: 'Insufficient permissions' });
  });
  socket.on('subscribe:container', async (containerId: string) => {
    if (await canSubscribeToContainer(user, containerId)) socket.join(`container:${containerId}`);
    else socket.emit('subscription:error', { resource: 'container', id: containerId, error: 'Insufficient permissions' });
  });
  socket.on('subscribe:user', (userId: string) => {
    if (user.role === 'ADMIN' || user.id === userId) socket.join(`user:${userId}`);
    else socket.emit('subscription:error', { resource: 'user', id: userId, error: 'Insufficient permissions' });
  });
  socket.on('unsubscribe:node', (nodeId: string) => socket.leave(`node:${nodeId}`));
  socket.on('unsubscribe:vm', (vmId: string) => socket.leave(`vm:${vmId}`));
  socket.on('unsubscribe:container', (containerId: string) => socket.leave(`container:${containerId}`));
  socket.on('unsubscribe:user', (userId: string) => {
    if (user.role === 'ADMIN' || user.id === userId) socket.leave(`user:${userId}`);
  });
  socket.on('disconnect', () => logger.info(`WebSocket client disconnected: ${socket.id}`));
});

app.use(helmet());
app.use(cors({ origin: allowCorsOrigin, credentials: !config.corsOrigins.includes('*') }));
app.use(morgan('combined', { stream: { write: (message: string) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api/license', licenseRoutes);
app.use(requireLicense);

app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/vms', vmRoutes);
app.use('/api/containers', containerRoutes);

app.use('/api/docker/containers/:id', authenticate, requireDockerContainerAccess);
app.use('/api/docker/compose/:id', authenticate, requireComposeAccess);
app.use('/api/docker/images', ...adminDockerResource);
app.use('/api/docker/volumes', ...adminDockerResource);
app.use('/api/docker/networks', ...adminDockerResource);

app.get('/api/docker/containers', authenticate, async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user!.role === 'ADMIN') return next();
  try {
    const nodeId = req.query.nodeId as string | undefined;
    const where: any = { userId: req.user!.id };
    if (nodeId) where.nodeId = nodeId;
    const containers = await prisma.dockerContainer.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(containers.map((container) => ({
      ...container,
      ports: container.ports ? (() => { try { return JSON.parse(container.ports); } catch { return []; } })() : [],
      state: container.status,
      created: container.createdAt,
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list Docker containers' });
  }
});

app.get('/api/docker/compose', authenticate, async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  if (req.user!.role === 'ADMIN') return next();
  try {
    const nodeId = req.query.nodeId as string | undefined;
    const where: any = { userId: req.user!.id };
    if (nodeId) where.nodeId = nodeId;
    res.json(await prisma.dockerCompose.findMany({ where, orderBy: { createdAt: 'desc' } }));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list Docker compose projects' });
  }
});

app.use('/api/docker', dockerRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/firewall', firewallRoutes);
app.use('/api/networks', networkRoutes);
app.use('/api/ssh-keys', sshKeyRoutes);
app.use('/api/dns', dnsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/node-system', nodeSystemRoutes);

app.get('/api/activity', authenticate, async (req: AuthRequest, res: express.Response) => {
  try {
    const { AuditService } = require('./services/AuditService');
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
    const result = await AuditService.list({ page: 1, limit });
    if (req.user?.role !== 'ADMIN') {
      res.json((result.logs || result).filter((log: any) => log.userId === req.user!.id));
      return;
    }
    res.json(result.logs || result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load activity' });
  }
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error', ...(config.nodeEnv === 'development' ? { stack: err.stack } : {}) });
});

app.use((_req: express.Request, res: express.Response) => res.status(404).json({ error: 'Route not found' }));

export { app, httpServer, io };
