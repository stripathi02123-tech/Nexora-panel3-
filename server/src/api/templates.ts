import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { AuthRequest, authenticate } from '../middleware/auth';
import { DockerService } from '../services/DockerService';
import { prisma } from '../utils/database';

const router = Router();

const TEMPLATES_PATH = path.join(__dirname, '..', 'data', 'templates.json');

function loadTemplates(): any[] {
  try {
    const raw = fs.readFileSync(TEMPLATES_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const templates = loadTemplates();
  const category = req.query.category as string;
  if (category) {
    res.json(templates.filter((t) => t.category === category));
  } else {
    res.json(templates);
  }
});

router.get('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  const templates = loadTemplates();
  const cats = new Set(templates.map((t: any) => t.category));
  res.json(Array.from(cats));
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const templates = loadTemplates();
  const tmpl = templates.find((t: any) => t.id === req.params.id);
  if (!tmpl) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json(tmpl);
});

router.post('/:id/deploy', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const templates = loadTemplates();
    const tmpl = templates.find((t: any) => t.id === req.params.id);
    if (!tmpl) { res.status(404).json({ error: 'Template not found' }); return; }

    let nodeId = req.body.nodeId;
    if (!nodeId) {
      const firstNode = await prisma.node.findFirst({ where: { type: 'DOCKER' }, orderBy: { createdAt: 'asc' } });
      if (firstNode) nodeId = firstNode.id;
    }
    if (!nodeId) { res.status(404).json({ error: 'No Docker node found. Go to Admin > Nodes and add a Docker node first (host: localhost, port: 2375).' }); return; }

    const name = req.body.name || `${tmpl.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const ram = req.body.ramMB || tmpl.ramMB;
    const cpu = req.body.cpuCores || tmpl.cpuCores;
    const image = req.body.image || tmpl.image;

    const envLines = (tmpl.env || []).map((e: any) => `${e.key}=${e.value}`);
    if (req.body.env) {
      Object.entries(req.body.env).forEach(([k, v]) => envLines.push(`${k}=${v}`));
    }

    const portStr = (tmpl.ports || []).map((p: any) => `0:${p.containerPort}/${p.protocol || 'tcp'}`).join(', ');

    const config = {
      nodeId,
      name,
      image,
      ports: portStr,
      env: envLines.join('\n'),
      allocatedRamMB: ram,
      allocatedCpuCores: cpu,
      cmd: tmpl.command || undefined,
      restartPolicy: 'always',
    };

    const container = await DockerService.createContainer(config, req.user!.id);

    let nodeHost = '';
    try {
      const node = await prisma.node.findUnique({ where: { id: nodeId } });
      if (node) nodeHost = node.host;
    } catch {}

    const rawPorts = container.ports ? JSON.parse(container.ports) : [];
    const accessUrls = rawPorts
      .filter((p: any) => p.hostPort && p.hostPort !== '0')
      .map((p: any) => ({
        url: `http://${nodeHost}:${p.hostPort}`,
        proxyUrl: `/api/docker/containers/${container.id}/proxy/`,
        port: p.hostPort,
        containerPort: p.containerPort,
        protocol: p.protocol,
      }));

    res.status(201).json({ message: 'Container deployed from template', container, accessUrls });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
