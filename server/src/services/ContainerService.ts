import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createProxmoxClient, ProxmoxClient } from '../integrations/Proxmox';
import { ResourceChecker } from './ResourceChecker';

export class ContainerService {
  static async getProxmoxClient(nodeId: string): Promise<ProxmoxClient> {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Node not found');
    return createProxmoxClient(node);
  }

  static async list(userId?: string): Promise<any[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    return prisma.container.findMany({
      where,
      include: { node: { select: { id: true, name: true, host: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async get(id: string): Promise<any> {
    const container = await prisma.container.findUnique({
      where: { id },
      include: { node: true, snapshots: true, backups: true, firewallRules: true },
    });
    if (!container) throw new Error('Container not found');
    return container;
  }

  static async create(data: any, userId?: string): Promise<any> {
    if (userId && data.planId) {
      await ResourceChecker.checkContainerLimits(userId, data.planId, data.cpuCores, data.ramMb, data.diskGb);
    }

    const proxmox = await this.getProxmoxClient(data.nodeId);
    await proxmox.authenticate();

    const ctConfig: any = {
      hostname: data.name,
      cores: data.cpuCores || 1,
      memory: data.ramMb || 512,
      storage: `${data.diskGb || 8}G`,
      ostemplate: data.template,
      net0: `name=eth0,bridge=${data.bridge || 'vmbr0'},ip=${data.ipAddress || 'dhcp'}`,
    };

    const result = await proxmox.createContainer(data.node, ctConfig);
    const vmid = result.vmid || result;

    const container = await prisma.container.create({
      data: {
        nodeId: data.nodeId,
        proxmoxId: vmid,
        name: data.name,
        cpuCores: data.cpuCores || 1,
        ramMb: data.ramMb || 512,
        diskGb: data.diskGb || 8,
        template: data.template,
        bridge: data.bridge || 'vmbr0',
        ipAddress: data.ipAddress,
        userId: userId || data.userId,
        planId: data.planId,
        status: 'creating',
      },
    });

    logger.info(`Container created: ${container.id} (VMID: ${vmid})`);
    return container;
  }

  static async delete(id: string): Promise<void> {
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    if (container.proxmoxId) {
      const proxmox = await this.getProxmoxClient(container.nodeId);
      await proxmox.authenticate();
      const node = await prisma.node.findUnique({ where: { id: container.nodeId } });
      if (node) {
        await proxmox.deleteContainer(node.name, container.proxmoxId);
      }
    }
    await prisma.container.delete({ where: { id } });
    logger.info(`Container deleted: ${id}`);
  }

  static async start(id: string): Promise<void> {
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const proxmox = await this.getProxmoxClient(container.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: container.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.startContainer(node.name, container.proxmoxId!);
    await prisma.container.update({ where: { id }, data: { status: 'running' } });
  }

  static async stop(id: string): Promise<void> {
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const proxmox = await this.getProxmoxClient(container.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: container.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.stopContainer(node.name, container.proxmoxId!);
    await prisma.container.update({ where: { id }, data: { status: 'stopped' } });
  }

  static async restart(id: string): Promise<void> {
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const proxmox = await this.getProxmoxClient(container.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: container.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.restartContainer(node.name, container.proxmoxId!);
  }

  static async getConfig(id: string): Promise<any> {
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const proxmox = await this.getProxmoxClient(container.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: container.nodeId } });
    if (!node) throw new Error('Node not found');
    return proxmox.getContainerConfig(node.name, container.proxmoxId!);
  }

  static async updateConfig(id: string, config: any): Promise<void> {
    const container = await prisma.container.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const proxmox = await this.getProxmoxClient(container.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: container.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.setContainerConfig(node.name, container.proxmoxId!, config);
    const updateData: any = {};
    if (config.cores) updateData.cpuCores = config.cores;
    if (config.memory) updateData.ramMb = config.memory;
    if (config.hostname) updateData.name = config.hostname;
    if (Object.keys(updateData).length > 0) {
      await prisma.container.update({ where: { id }, data: updateData });
    }
  }
}
