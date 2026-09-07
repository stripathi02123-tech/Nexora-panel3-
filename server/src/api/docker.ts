import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { AuthRequest, authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { DockerService } from '../services/DockerService';
import { prisma } from '../utils/database';

const router = Router();

router.get('/containers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let nodeId = req.query.nodeId as string;
    if (!nodeId) {
      const firstNode = await prisma.node.findFirst({ where: { type: 'DOCKER' }, orderBy: { createdAt: 'asc' } });
      if (firstNode) nodeId = firstNode.id;
    }
    const all = req.query.all !== 'false';
    if (!nodeId) { res.json([]); return; }
    const docker = await DockerService.getDockerClient(nodeId);
    const rawContainers = await docker.listContainers(all);

    const dbContainers = await prisma.dockerContainer.findMany({ where: { nodeId } });
    const dbMap = new Map(dbContainers.map((c) => [c.containerId, c]));

    const normalizePorts = (ports: any): any[] => {
      if (Array.isArray(ports)) return ports.map((p: any) => ({
        host: p.hostPort || p.PublicPort || p.HostPort || p.host || '',
        container: p.containerPort || p.PrivatePort || p.ContainerPort || p.container || '',
        type: p.protocol || p.Type || p.type || 'tcp',
      }));
      if (typeof ports === 'string') {
        try { return normalizePorts(JSON.parse(ports)); } catch { return []; }
      }
      return [];
    };

    const result = [];
    for (const c of rawContainers) {
      const existing = dbMap.get(c.Id);
      if (existing) {
        result.push({
          ...existing,
          ports: normalizePorts(existing.ports),
          state: existing.status,
          created: existing.createdAt,
        });
      } else {
        const portsArr = c.Ports?.map((p: any) => ({
          host: p.PublicPort || p.HostPort || p.hostPort || '',
          container: p.PrivatePort || p.ContainerPort || p.containerPort || '',
          type: p.Type || p.protocol || 'tcp',
        })) || [];
        const created = await prisma.dockerContainer.create({
          data: {
            nodeId,
            containerId: c.Id,
            name: c.Names?.[0]?.replace(/^\//, '') || c.Id.substring(0, 12),
            image: c.Image || 'unknown',
            ports: JSON.stringify(portsArr),
            status: c.State || c.Status || 'unknown',
          },
        });
        result.push({ ...created, ports: portsArr, state: created.status, created: created.createdAt });
      }
    }
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/containers/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const container = await DockerService.getContainer(req.params.id);
    res.json(container);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.post(
  '/containers',
  authenticate,
  validate([body('image').notEmpty()]),
  async (req: AuthRequest, res: Response) => {
    req.setTimeout(300000);
    try {
      if (!req.body.nodeId) {
        const firstNode = await prisma.node.findFirst({ where: { type: 'DOCKER' }, orderBy: { createdAt: 'asc' } });
        if (firstNode) req.body.nodeId = firstNode.id;
      }
      if (!req.body.nodeId) { res.status(404).json({ error: 'No Docker node found. Add a Docker node first.' }); return; }
      const container = await DockerService.createContainer(req.body, req.user!.id);
      res.status(201).json(container);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.delete('/containers/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.removeContainer(req.params.id);
    res.json({ message: 'Container removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.startContainer(req.params.id);
    res.json({ message: 'Container starting' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/stop', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.stopContainer(req.params.id);
    res.json({ message: 'Container stopping' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/restart', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.restartContainer(req.params.id);
    res.json({ message: 'Container restarting' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/kill', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.killContainer(req.params.id);
    res.json({ message: 'Container killed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/pause', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.pauseContainer(req.params.id);
    res.json({ message: 'Container paused' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/unpause', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.unpauseContainer(req.params.id);
    res.json({ message: 'Container unpaused' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/containers/:id/logs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tail = parseInt(req.query.tail as string) || 100;
    const logs = await DockerService.getContainerLogs(req.params.id, tail);
    res.json({ logs });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/containers/:id/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const stats = await DockerService.getContainerStats(req.params.id);
    res.json(stats);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/exec', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await DockerService.execCommand(req.params.id, req.body.cmd, req.body.workdir);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/exec/stream', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const container = await DockerService.getContainerForExec(req.params.id);
    if (!container.containerId) throw new Error('Container not running');

    const docker = await DockerService.getDockerClientForExec(container.nodeId);
    const execStream = await docker.execStream(container.containerId, req.body.cmd, req.body.workdir);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    execStream.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    execStream.on('end', () => {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    });

    execStream.on('error', (err: Error) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    });

    req.on('close', () => {
      execStream.destroy?.();
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.all('/containers/:id/proxy*', async (req: Request, res: Response) => {
  try {
    const container = await prisma.dockerContainer.findUnique({ where: { id: req.params.id } });
    if (!container || !container.id) { res.status(404).json({ error: 'Container not found' }); return; }

    if (container.status !== 'running') {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    const rawPorts = container.ports ? JSON.parse(container.ports) : [];
    const portEntry = rawPorts.find((p: any) => p.hostPort && p.hostPort !== '0');
    const hostPort = portEntry?.hostPort;
    if (!hostPort) { res.status(400).json({ error: 'No public port mapped for this container', ports: rawPorts }); return; }

    const targetPath = req.params[0] || '/';
    const targetUrl = `http://127.0.0.1:${hostPort}${targetPath}`;

    const axios = require('axios');

    const tryProxy = async (attempt: number): Promise<void> => {
      try {
        const response = await axios({
          method: req.method,
          url: targetUrl,
          data: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
          headers: { ...req.headers, host: `localhost:${hostPort}`, 'content-length': undefined, connection: undefined },
          responseType: 'stream',
          validateStatus: () => true,
          timeout: 5000,
        });

        const upstream = response.data;
        let closed = false;
        res.on('close', () => { closed = true; upstream.destroy(); });

        res.writeHead(response.status, Object.fromEntries(
          Object.entries(response.headers as Record<string, string>)
            .filter(([k]) => !['transfer-encoding', 'content-encoding', 'connection'].includes(k))
        ));

        upstream.on('data', (chunk: Buffer) => { if (!closed) res.write(chunk); });
        upstream.on('end', () => { if (!closed) res.end(); });
        upstream.on('error', () => { if (!closed) { res.end(); } });
      } catch (err: any) {
        if (err.code === 'ECONNREFUSED' && attempt < 3) {
          await new Promise(r => setTimeout(r, 1500));
          return tryProxy(attempt + 1);
        }
        const msg = err.code === 'ECONNREFUSED'
          ? `Connection refused to ${targetUrl} — the web server inside the container may not be ready yet. Try again in a few seconds.`
          : err.message || 'Unknown proxy error';
        throw new Error(msg);
      }
    };

    await tryProxy(1);
  } catch (error: any) {
    if (!res.headersSent) res.status(502).json({ error: `Proxy error: ${error.message}` });
  }
});

router.post('/containers/:id/fs/ls', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const entries = await DockerService.listDirectory(req.params.id, req.body.path || '/');
    res.json(entries);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/fs/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const content = await DockerService.readFile(req.params.id, req.body.path);
    res.json({ content });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/containers/:id/fs/write', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.writeFile(req.params.id, req.body.path, req.body.content);
    res.json({ message: 'File written' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/images', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let nodeId = req.query.nodeId as string;
    if (!nodeId) {
      const firstNode = await prisma.node.findFirst({ where: { type: 'DOCKER' }, orderBy: { createdAt: 'asc' } });
      if (firstNode) nodeId = firstNode.id;
    }
    if (!nodeId) { res.json([]); return; }
    const images = await DockerService.listImages(nodeId);
    res.json(images);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/images/pull', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.pullImage(req.body.nodeId, req.body.name);
    res.json({ message: 'Image pulled' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/images/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.removeImage(req.body.nodeId || req.query.nodeId, req.params.id);
    res.json({ message: 'Image removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/compose', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string;
    const composes = await DockerService.listCompose(nodeId);
    res.json(composes);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/compose', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const compose = await DockerService.createCompose(req.body, req.user!.id);
    res.status(201).json(compose);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/compose/:id/start', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.startCompose(req.params.id);
    res.json({ message: 'Compose started' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/compose/:id/stop', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.stopCompose(req.params.id);
    res.json({ message: 'Compose stopped' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/compose/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.removeCompose(req.params.id);
    res.json({ message: 'Compose removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/volumes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let nodeId = req.query.nodeId as string;
    if (!nodeId) {
      const firstNode = await prisma.node.findFirst({ where: { type: 'DOCKER' }, orderBy: { createdAt: 'asc' } });
      if (firstNode) nodeId = firstNode.id;
    }
    if (!nodeId) { res.json([]); return; }
    const volumes = await DockerService.listVolumes(nodeId);
    res.json(volumes);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/volumes', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const volume = await DockerService.createVolume(req.body.nodeId, req.body);
    res.status(201).json(volume);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/volumes/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.removeVolume(req.body.nodeId || req.query.nodeId, req.params.id);
    res.json({ message: 'Volume removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/networks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    let nodeId = req.query.nodeId as string;
    if (!nodeId) {
      const firstNode = await prisma.node.findFirst({ where: { type: 'DOCKER' }, orderBy: { createdAt: 'asc' } });
      if (firstNode) nodeId = firstNode.id;
    }
    if (!nodeId) { res.json([]); return; }
    const networks = await DockerService.listNetworks(nodeId);
    res.json(networks);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/networks', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const network = await DockerService.createNetwork(req.body.nodeId, req.body);
    res.status(201).json(network);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/networks/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await DockerService.removeNetwork(req.body.nodeId || req.query.nodeId, req.params.id);
    res.json({ message: 'Network removed' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
