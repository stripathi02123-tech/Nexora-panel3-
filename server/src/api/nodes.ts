import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { body } from 'express-validator';
import { AuthRequest, authenticate, hasAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NodeService } from '../services/NodeService';
import { decryptNodeSecret } from '../utils/helpers';
import { config } from '../config';
import { auditLog } from '../middleware/audit';

const router = Router();

// Never falls back to raw ciphertext — see decryptNodeSecret().
function decryptCredential(value: string): string {
  return decryptNodeSecret(value, config.encryptionKey);
}

function publicNode(node: any): any {
  if (!node) return node;
  const { credentials: _credentials, ...safe } = node;
  return safe;
}

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const nodes = await NodeService.list(type);
    res.json(nodes.map(publicNode));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list nodes' });
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const node = await NodeService.get(req.params.id);
    res.json(publicNode(node));
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

router.post(
  '/',
  authenticate,
  hasAdmin,
  validate([body('name').notEmpty().trim(), body('host').notEmpty().trim()]),
  auditLog('CREATE', 'NODE'),
  async (req: Request, res: Response) => {
    try {
      const type = String(req.body.type || 'PROXMOX').trim().toUpperCase();
      let agentSecret: string | undefined;

      if (type === 'AGENT') {
        const suppliedSecret = typeof req.body.credentials === 'string'
          ? req.body.credentials.trim()
          : '';

        agentSecret = suppliedSecret || randomBytes(32).toString('hex');
        req.body = {
          ...req.body,
          type,
          credentials: agentSecret,
          port: req.body.port || 4000,
        };
      } else {
        req.body = { ...req.body, type };
      }

      const node = await NodeService.create(req.body);
      res.status(201).json(agentSecret ? { ...node, agentSecret } : node);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  },
);

// Admin-only bootstrap endpoint. The secret is decrypted server-side and
// returned only to an authenticated administrator for agent provisioning.
router.get('/:id/agent-credentials', authenticate, hasAdmin, async (req: Request, res: Response) => {
  try {
    const node = await NodeService.get(req.params.id);
    if (node.type !== 'AGENT') {
      return res.status(400).json({ error: 'Node is not an AGENT node' });
    }

    const secret = decryptCredential(node.credentials);
    if (!secret || secret === 'none') {
      return res.status(400).json({ error: 'No valid AGENT secret configured' });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      id: node.id,
      name: node.name,
      host: node.host,
      port: node.port,
      credentials: secret,
    });
    return;
  } catch (error: any) {
    res.status(400).json({ error: error.message });
    return;
  }
});

router.put('/:id', authenticate, hasAdmin, auditLog('UPDATE', 'NODE'), async (req: AuthRequest, res: Response) => {
  try {
    const node = await NodeService.update(req.params.id, req.body);
    res.json(publicNode(node));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authenticate, hasAdmin, auditLog('DELETE', 'NODE'), async (req: AuthRequest, res: Response) => {
  try {
    await NodeService.delete(req.params.id);
    res.json({ message: 'Node deleted' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/status', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await NodeService.checkHealthDetailed(req.params.id);
    res.json({ id: req.params.id, online: result.connected, error: result.error });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/health', authenticate, hasAdmin, async (req: Request, res: Response) => {
  try {
    const result = await NodeService.checkHealthDetailed(req.params.id);
    res.json({ id: req.params.id, online: result.connected, status: result.connected ? 'ONLINE' : 'OFFLINE', error: result.error });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/metrics', authenticate, async (req: Request, res: Response) => {
  try {
    const metrics = await NodeService.getMetrics(req.params.id);
    res.json(metrics);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/storage', authenticate, async (req: Request, res: Response) => {
  try {
    const storage = await NodeService.getStorage(req.params.id);
    res.json(storage);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/:id/templates', authenticate, async (req: Request, res: Response) => {
  try {
    const type = (req.query.type as string) || 'vztmpl';
    const templates = await NodeService.getTemplates(req.params.id, type);
    res.json(templates);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
