import { Router, Request, Response } from 'express';
import { AuthRequest, authenticate, hasAdmin } from '../middleware/auth';
import { NodeSystemService, classifyNodeError } from '../services/NodeSystemService';
import { NodeService } from '../services/NodeService';
import { decryptNodeSecret } from '../utils/helpers';
import { config } from '../config';

const router = Router();
router.use(authenticate, hasAdmin);

// Never falls back to raw ciphertext — see decryptNodeSecret().
function getNodeSecret(credentials: string): string {
  return decryptNodeSecret(credentials, config.encryptionKey);
}

function toAgent(node: any) {
  return { id: node.id, host: node.host, port: node.port, secret: getNodeSecret(node.credentials) };
}

async function getAgent(nodeId: string) {
  const node = await NodeService.get(nodeId);
  if (node.type !== 'AGENT') throw new Error('Not a node-system agent');
  return toAgent(node);
}

// Discovery must surface the REAL reason an agent is unreachable — collapsing
// every failure into a bare "offline" is what made this endpoint useless for
// diagnosing why a running Node Agent still shows offline. This never returns
// NODE_SECRET, encrypted credentials, or auth headers — only a safe
// human-readable reason and error code.
router.get('/discover', async (_req: AuthRequest, res: Response) => {
  try {
    const nodes = await NodeService.list('AGENT');
    const results = await Promise.allSettled(nodes.map(async (node: any) => {
      const base = { id: node.id, name: node.name, host: node.host, port: node.port };
      try {
        const agent = toAgent(node);
        const start = Date.now();
        const health = await NodeSystemService.health(agent);
        return { ...base, status: 'ok', uptime: health.uptime, latencyMs: health.latencyMs ?? (Date.now() - start), errorCode: null, error: null };
      } catch (error: any) {
        const { code, message } = classifyNodeError(error);
        return { ...base, status: 'offline', uptime: 0, latencyMs: null, errorCode: code, error: message };
      }
    }));
    return res.json(results.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled').map((r) => r.value));
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// Server-side connection diagnostic: tests DNS -> TCP -> HTTP -> auth from
// the Panel server itself (not the browser), since browser connectivity to a
// node is not the same as Panel-server connectivity.
router.post('/:nodeId/test-connection', async (req: AuthRequest, res: Response) => {
  try {
    const node = await NodeService.get(req.params.nodeId);
    if (node.type !== 'AGENT') {
      return res.status(400).json({ error: 'Node is not an AGENT node' });
    }

    let secret: string;
    try {
      secret = getNodeSecret(node.credentials);
    } catch (error: any) {
      return res.json({
        online: false,
        latencyMs: null,
        stage: 'configuration',
        code: 'DECRYPT_FAILED',
        message: error.message,
      });
    }

    const result = await NodeSystemService.testConnection({ id: node.id, host: node.host, port: node.port, secret });
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/:nodeId/allocation', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.getAllocation(await getAgent(req.params.nodeId))); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.post('/:nodeId/allocation/check', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.checkAllocation(await getAgent(req.params.nodeId), Number(req.body.allocatedRamMB), Number(req.body.allocatedCpuCores))); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.get('/:nodeId/resources', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.listResources(await getAgent(req.params.nodeId))); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.post('/:nodeId/resources', async (req: Request, res: Response) => {
  try { return res.status(201).json(await NodeSystemService.registerResource(await getAgent(req.params.nodeId), req.body)); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.patch('/:nodeId/resources/:id', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.updateResource(await getAgent(req.params.nodeId), req.params.id, req.body)); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.delete('/:nodeId/resources/:id', async (req: Request, res: Response) => {
  try { await NodeSystemService.deleteResource(await getAgent(req.params.nodeId), req.params.id); return res.json({ message: 'Resource deleted' }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.post('/:nodeId/processes/:id/start', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.startProcess(await getAgent(req.params.nodeId), req.params.id, req.body)); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.post('/:nodeId/processes/:id/stop', async (req: Request, res: Response) => {
  try { await NodeSystemService.stopProcess(await getAgent(req.params.nodeId), req.params.id, Boolean(req.body.force)); return res.json({ message: 'Stop signal sent' }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.post('/:nodeId/processes/:id/input', async (req: Request, res: Response) => {
  try { await NodeSystemService.sendInput(await getAgent(req.params.nodeId), req.params.id, String(req.body.text || '')); return res.json({ message: 'Sent' }); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.get('/:nodeId/processes/:id/logs', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.getProcessLogs(await getAgent(req.params.nodeId), req.params.id, Number(req.query.lines) || 100)); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.get('/:nodeId/processes/:id/status', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.getProcessStatus(await getAgent(req.params.nodeId), req.params.id)); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.get('/:nodeId/processes', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.listRunningProcesses(await getAgent(req.params.nodeId))); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.get('/:nodeId/metrics', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.getMetrics(await getAgent(req.params.nodeId))); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

router.get('/:nodeId/metrics/fresh', async (req: Request, res: Response) => {
  try { return res.json(await NodeSystemService.getFreshMetrics(await getAgent(req.params.nodeId))); }
  catch (error: any) { return res.status(400).json({ error: error.message }); }
});

export default router;
