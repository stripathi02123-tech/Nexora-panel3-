import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createProxmoxClient } from '../integrations/Proxmox';
import { createDockerClient } from '../integrations/Docker';
import { encrypt, decryptNodeSecret } from '../utils/helpers';
import { config } from '../config';
import { NodeSystemService } from './NodeSystemService';
import { classifyConnectionError } from '../utils/connectionErrors';

// Never falls back to raw ciphertext — throws a specific, safe error instead
// if a stored AGENT credential cannot be decrypted with the current
// ENCRYPTION_KEY. See decryptNodeSecret() for why this matters.
function getNodeSecret(credentials: string): string {
  return decryptNodeSecret(credentials, config.encryptionKey);
}

function normalizeType(value: unknown): string {
  const type = String(value || 'PROXMOX').trim().toUpperCase();
  if (!['PROXMOX', 'REMOTE', 'DOCKER', 'AGENT'].includes(type)) {
    throw new Error(`Unsupported node type: ${type}`);
  }
  return type;
}

function normalizePort(value: unknown, defaultPort: number): number {
  if (value === undefined || value === null || value === '') return defaultPort;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid node port: ${value}`);
  }
  return port;
}

function safeNode(node: any): any {
  const { credentials: _credentials, ...publicNode } = node;
  return publicNode;
}

export class NodeService {
  static async list(type?: string): Promise<any[]> {
    const where: any = {};
    if (type) where.type = normalizeType(type);
    return prisma.node.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { location: true },
    });
  }

  static async get(id: string): Promise<any> {
    const node = await prisma.node.findUnique({
      where: { id },
      include: {
        _count: { select: { virtualMachines: true, containers: true, dockerContainers: true } },
      },
    });
    if (!node) throw new Error('Node not found');
    return node;
  }

  static async create(data: any): Promise<any> {
    const type = normalizeType(data.type);
    const defaultPort = type === 'DOCKER' ? 2375 : type === 'AGENT' ? 4000 : 8006;
    const secret = typeof data.credentials === 'string' ? data.credentials.trim() : '';

    if (type === 'AGENT' && (!secret || secret === 'none')) {
      throw new Error('AGENT nodes require a valid Panel-generated credentials secret');
    }

    const name = String(data.name || '').trim();
    const host = String(data.host || '').trim();
    if (!name) throw new Error('Node name cannot be empty');
    if (!host) throw new Error('Node host cannot be empty');

    const credentials = encrypt(secret || 'none', config.encryptionKey);
    const port = normalizePort(data.port, defaultPort);

    const node = await prisma.node.create({
      data: {
        name,
        host,
        port,
        type,
        authType: String(data.authType || 'password'),
        credentials,
        region: data.region ? String(data.region) : null,
        locationId: data.locationId || null,
        description: data.description ? String(data.description) : null,
        status: 'OFFLINE',
      },
    });

    const connected = await this.checkHealth(node.id);
    if (connected) await this.syncNodeInfo(node.id);

    logger.info(`Node created: ${node.id} (${node.name})`);
    return safeNode(await this.get(node.id));
  }

  static async update(id: string, data: any): Promise<any> {
    const node = await prisma.node.findUnique({ where: { id } });
    if (!node) throw new Error('Node not found');

    const updateData: any = {};

    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new Error('Node name cannot be empty');
      updateData.name = name;
    }
    if (data.host !== undefined) {
      const host = String(data.host).trim();
      if (!host) throw new Error('Node host cannot be empty');
      updateData.host = host;
    }
    if (data.type !== undefined) updateData.type = normalizeType(data.type);
    if (data.port !== undefined) {
      const type = updateData.type || node.type;
      const defaultPort = type === 'DOCKER' ? 2375 : type === 'AGENT' ? 4000 : 8006;
      updateData.port = normalizePort(data.port, defaultPort);
    }
    if (data.authType !== undefined) updateData.authType = String(data.authType);
    if (data.credentials !== undefined && String(data.credentials).trim() !== '') {
      updateData.credentials = encrypt(String(data.credentials).trim(), config.encryptionKey);
    }
    if (data.locationId !== undefined) updateData.locationId = data.locationId || null;
    if (data.region !== undefined) updateData.region = data.region ? String(data.region) : null;
    if (data.description !== undefined) updateData.description = data.description ? String(data.description) : null;

    const resultingType = updateData.type || node.type;
    const resultingCredentials = updateData.credentials
      ? String(data.credentials).trim()
      : getNodeSecret(node.credentials);

    if (resultingType === 'AGENT' && (!resultingCredentials || resultingCredentials === 'none')) {
      throw new Error('AGENT nodes require a valid credentials secret');
    }

    const updated = await prisma.node.update({ where: { id }, data: updateData });

    if (updateData.host !== undefined || updateData.port !== undefined || updateData.type !== undefined || updateData.credentials !== undefined) {
      await this.checkHealth(id);
    }

    return safeNode(await this.get(updated.id));
  }

  static async delete(id: string): Promise<void> {
    const node = await prisma.node.findUnique({ where: { id } });
    if (!node) throw new Error('Node not found');

    const [vmCount, ctCount, dockerCount, composeCount] = await Promise.all([
      prisma.virtualMachine.count({ where: { nodeId: id } }),
      prisma.container.count({ where: { nodeId: id } }),
      prisma.dockerContainer.count({ where: { nodeId: id } }),
      prisma.dockerCompose.count({ where: { nodeId: id } }),
    ]);

    if (vmCount > 0 || ctCount > 0 || dockerCount > 0 || composeCount > 0) {
      throw new Error('Cannot delete node while it still has virtual machines, containers, Docker containers, or compose projects');
    }

    await prisma.node.delete({ where: { id } });
    logger.info(`Node deleted: ${id}`);
  }

  static async checkHealth(id: string): Promise<boolean> {
    const result = await this.checkHealthDetailed(id);
    return result.connected;
  }

  // Same health check as checkHealth(), but also returns the classified,
  // safe reason for failure (never credentials/secrets) so the API/UI can
  // show *why* a node is offline instead of a bare boolean. Every node type
  // (AGENT, PROXMOX, DOCKER, REMOTE) now goes through this — previously only
  // AGENT nodes had any diagnostic detail; Proxmox/Docker connection
  // failures were silently discarded by their client's connect().
  static async checkHealthDetailed(id: string): Promise<{ connected: boolean; error: { code: string; message: string } | null }> {
    try {
      const node = await prisma.node.findUnique({ where: { id } });
      if (!node) return { connected: false, error: { code: 'NOT_FOUND', message: 'Node not found' } };

      let connected = false;
      let lastError: unknown;
      const maxRetries = node.status === 'ONLINE' ? 1 : 3;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));

          if (node.type === 'PROXMOX' || node.type === 'REMOTE') {
            connected = await createProxmoxClient(node).connect();
          } else if (node.type === 'DOCKER') {
            connected = await createDockerClient(node).connect();
          } else if (node.type === 'AGENT') {
            const secret = getNodeSecret(node.credentials);
            if (!secret || secret === 'none') throw new Error('AGENT credentials are missing');
            const health = await NodeSystemService.health({ id: node.id, host: node.host, port: node.port, secret });
            connected = health.status === 'ok';
          } else {
            throw new Error(`Unsupported node type: ${node.type}`);
          }

          if (connected) break;
        } catch (error) {
          lastError = error;
          connected = false;
        }
      }

      let classifiedError: { code: string; message: string } | null = null;
      if (!connected && lastError) {
        classifiedError = classifyConnectionError(lastError);
        logger.warn(`Health check failed for node ${id}: code=${classifiedError.code} error="${classifiedError.message}"`);
      }

      await prisma.node.update({
        where: { id },
        data: {
          status: connected ? 'ONLINE' : 'OFFLINE',
          ...(connected ? { lastSeen: new Date() } : {}),
        },
      });

      return { connected, error: classifiedError };
    } catch (error) {
      logger.error(`Health check error for node ${id}:`, error);
      try {
        await prisma.node.update({ where: { id }, data: { status: 'ERROR' } });
      } catch {
        // Node may have been deleted concurrently.
      }
      return { connected: false, error: classifyConnectionError(error) };
    }
  }

  static async syncNodeInfo(id: string): Promise<void> {
    try {
      const node = await prisma.node.findUnique({ where: { id } });
      if (!node) return;

      if (node.type === 'PROXMOX') {
        const proxmox = createProxmoxClient(node);
        await proxmox.authenticate();
        const nodes = await proxmox.getNodes();
        const nodeInfo = nodes.find((n: any) => n.node === node.name);
        if (nodeInfo) {
          const version = await proxmox.getNodeStatus(node.name);
          await prisma.node.update({
            where: { id },
            data: {
              cpuCores: Number.isFinite(Number(nodeInfo.maxcpu)) ? Math.round(Number(nodeInfo.maxcpu)) : undefined,
              cpuUsage: nodeInfo.cpu != null ? Number(nodeInfo.cpu) * 100 : undefined,
              ramTotal: nodeInfo.maxmem || undefined,
              ramUsed: nodeInfo.mem || undefined,
              storageTotal: nodeInfo.maxdisk || undefined,
              storageUsed: nodeInfo.disk || undefined,
              version: version?.pveversion || undefined,
            },
          });
        }
      } else if (node.type === 'DOCKER') {
        const info = await createDockerClient(node).getInfo();
        await prisma.node.update({
          where: { id },
          data: {
            version: info.ServerVersion,
            cpuCores: info.NCPU || undefined,
            ramTotal: info.MemTotal || undefined,
          },
        });
      } else if (node.type === 'AGENT') {
        const secret = getNodeSecret(node.credentials);
        if (!secret || secret === 'none') return;
        const metrics = await NodeSystemService.getFreshMetrics({ id: node.id, host: node.host, port: node.port, secret });
        const rootDisk = metrics.disk?.[0];
        await prisma.node.update({
          where: { id },
          data: {
            cpuCores: metrics.cpu?.cores?.length || undefined,
            cpuUsage: metrics.cpu?.totalLoad != null ? Number(metrics.cpu.totalLoad) : undefined,
            ramTotal: metrics.memory?.totalMB != null ? Number(metrics.memory.totalMB) * 1024 * 1024 : undefined,
            ramUsed: metrics.memory?.usedMB != null ? Number(metrics.memory.usedMB) * 1024 * 1024 : undefined,
            storageTotal: rootDisk?.sizeGB != null ? Number(rootDisk.sizeGB) * 1024 * 1024 * 1024 : undefined,
            storageUsed: rootDisk?.usedGB != null ? Number(rootDisk.usedGB) * 1024 * 1024 * 1024 : undefined,
          },
        });
      }
    } catch (error) {
      logger.error(`Failed to sync node info for ${id}:`, error);
    }
  }

  static async getMetrics(id: string): Promise<any[]> {
    return prisma.metric.findMany({
      where: { nodeId: id, type: 'node' },
      orderBy: { timestamp: 'desc' },
      take: 120,
    });
  }

  static async getStorage(id: string): Promise<any[]> {
    const node = await prisma.node.findUnique({ where: { id } });
    if (!node) throw new Error('Node not found');

    if (node.type === 'PROXMOX') {
      const proxmox = createProxmoxClient(node);
      await proxmox.authenticate();
      return proxmox.getStorages(node.name);
    }
    return [];
  }

  static async getTemplates(id: string, type: string = 'vztmpl'): Promise<any[]> {
    const node = await prisma.node.findUnique({ where: { id } });
    if (!node) throw new Error('Node not found');

    if (node.type === 'PROXMOX') {
      const proxmox = createProxmoxClient(node);
      await proxmox.authenticate();
      return proxmox.getTemplates(node.name, type);
    }
    return [];
  }

  static async checkAllNodes(): Promise<void> {
    const nodes = await prisma.node.findMany({ select: { id: true, name: true, status: true } });
    await Promise.allSettled(nodes.map(async (node) => {
      const wasOnline = node.status === 'ONLINE';
      const isOnline = await this.checkHealth(node.id);
      if (wasOnline && !isOnline) logger.warn(`Node ${node.name} went offline`);
      else if (!wasOnline && isOnline) {
        logger.info(`Node ${node.name} came online`);
        await this.syncNodeInfo(node.id);
      }
    }));
  }
}
