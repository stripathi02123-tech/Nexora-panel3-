import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createProxmoxClient } from '../integrations/Proxmox';
import { Server as SocketServer } from 'socket.io';
import { NotificationService } from './NotificationService';

let io: SocketServer | null = null;

export function setSocketIO(socketIO: SocketServer): void {
  io = socketIO;
}

export class MonitoringService {
  static async collectNodeMetrics(nodeId: string): Promise<void> {
    try {
      const node = await prisma.node.findUnique({ where: { id: nodeId } });
      if (!node || node.type !== 'PROXMOX') return;

      const proxmox = createProxmoxClient(node);
      await proxmox.authenticate();
      const metrics = await proxmox.getNodeMetrics(node.name);

      const cpu = metrics.status?.cpu ?? 0;
      const ramTotal = metrics.status?.memory?.total ?? 0;
      const ramUsed = metrics.status?.memory?.used ?? 0;
      const diskTotal = metrics.status?.rootfs?.total ?? 0;
      const diskUsed = metrics.status?.rootfs?.used ?? 0;

      const ramPercent = ramTotal > 0 ? (ramUsed / ramTotal) * 100 : 0;
      const diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

      await prisma.metric.create({
        data: {
          nodeId,
          type: 'node',
          cpu: cpu * 100,
          ram: ramPercent,
          disk: diskPercent,
          networkRx: 0,
          networkTx: 0,
        },
      });

      await prisma.node.update({
        where: { id: nodeId },
        data: {
          cpuUsage: cpu * 100,
          ramTotal,
          ramUsed,
          storageTotal: diskTotal,
          storageUsed: diskUsed,
          lastSeen: new Date(),
        },
      });

      if (io) {
        io.to(`node:${nodeId}`).emit('metrics:node', {
          nodeId,
          cpu: cpu * 100,
          ram: ramPercent,
          disk: diskPercent,
          timestamp: new Date(),
        });
      }

      await this.checkNodeAlerts(nodeId, cpu * 100, ramPercent, diskPercent);
    } catch (error) {
      logger.error(`Failed to collect metrics for node ${nodeId}:`, error);
    }
  }

  static async collectVMMetrics(vmId: string): Promise<void> {
    try {
      const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId }, include: { node: true } });
      if (!vm || !vm.node || !vm.proxmoxId) return;

      const proxmox = createProxmoxClient(vm.node);
      await proxmox.authenticate();
      const status = await proxmox.getVMStatus(vm.node.name, vm.proxmoxId);

      const cpu = status.cpu ?? 0;
      const mem = status.mem ?? 0;
      const maxmem = status.maxmem ?? 1;
      const disk = status.disk ?? 0;
      const maxdisk = status.maxdisk ?? 1;

      const cpuPercent = (vm.cpuCores > 0 ? cpu / vm.cpuCores : cpu) * 100;
      const ramPercent = maxmem > 0 ? (mem / maxmem) * 100 : 0;
      const diskPercent = maxdisk > 0 ? (disk / maxdisk) * 100 : 0;

      await prisma.metric.create({
        data: {
          vmId,
          type: 'vm',
          cpu: cpuPercent,
          ram: ramPercent,
          disk: diskPercent,
          networkRx: status.netin ?? 0,
          networkTx: status.netout ?? 0,
        },
      });

      if (io) {
        io.to(`vm:${vmId}`).emit('metrics:vm', {
          vmId,
          cpu: cpuPercent,
          ram: ramPercent,
          disk: diskPercent,
          networkRx: status.netin ?? 0,
          networkTx: status.netout ?? 0,
          timestamp: new Date(),
        });
      }

      await this.checkVMAlerts(vmId, cpuPercent, ramPercent, diskPercent);
    } catch (error) {
      logger.error(`Failed to collect metrics for VM ${vmId}:`, error);
    }
  }

  static async collectContainerMetrics(containerId: string): Promise<void> {
    try {
      const container = await prisma.container.findUnique({
        where: { id: containerId },
        include: { node: true },
      });
      if (!container || !container.node || !container.proxmoxId) return;

      const proxmox = createProxmoxClient(container.node);
      await proxmox.authenticate();
      const status = await proxmox.getVMStatus(container.node.name, container.proxmoxId);

      const cpu = status.cpu ?? 0;
      const mem = status.mem ?? 0;
      const maxmem = status.maxmem ?? 1;

      const cpuPercent = cpu * 100;
      const ramPercent = maxmem > 0 ? (mem / maxmem) * 100 : 0;

      await prisma.metric.create({
        data: {
          containerId,
          type: 'container',
          cpu: cpuPercent,
          ram: ramPercent,
          disk: 0,
          networkRx: status.netin ?? 0,
          networkTx: status.netout ?? 0,
        },
      });

      if (io) {
        io.to(`container:${containerId}`).emit('metrics:container', {
          containerId,
          cpu: cpuPercent,
          ram: ramPercent,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      logger.error(`Failed to collect metrics for container ${containerId}:`, error);
    }
  }

  static async collectAllMetrics(): Promise<void> {
    const nodes = await prisma.node.findMany({ where: { type: 'PROXMOX' } });
    for (const node of nodes) {
      await this.collectNodeMetrics(node.id);
    }

    const vms = await prisma.virtualMachine.findMany({ where: { status: 'running' } });
    for (const vm of vms) {
      await this.collectVMMetrics(vm.id);
    }

    const containers = await prisma.container.findMany({ where: { status: 'running' } });
    for (const container of containers) {
      await this.collectContainerMetrics(container.id);
    }

    logger.info('Metrics collection completed');
  }

  static async getMetrics(params: { nodeId?: string; vmId?: string; containerId?: string; type?: string; from?: Date; to?: Date; limit?: number }): Promise<any[]> {
    const where: any = {};
    if (params.nodeId) where.nodeId = params.nodeId;
    if (params.vmId) where.vmId = params.vmId;
    if (params.containerId) where.containerId = params.containerId;
    if (params.type) where.type = params.type;
    if (params.from || params.to) {
      where.timestamp = {};
      if (params.from) where.timestamp.gte = params.from;
      if (params.to) where.timestamp.lte = params.to;
    }
    return prisma.metric.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: params.limit || 60,
    });
  }

  static async getLatestMetrics(vmId: string): Promise<any> {
    return prisma.metric.findFirst({
      where: { vmId },
      orderBy: { timestamp: 'desc' },
    });
  }

  static async checkNodeAlerts(nodeId: string, cpu: number, ram: number, disk: number): Promise<void> {
    const alerts = await prisma.alert.findMany({
      where: { enabled: true },
      include: { user: true },
    });

    for (const alert of alerts) {
      let value: number = 0;
      if (alert.metric === 'CPU') value = cpu;
      else if (alert.metric === 'RAM') value = ram;
      else if (alert.metric === 'DISK') value = disk;

      let triggered = false;
      if (alert.condition === 'GT') triggered = value > alert.threshold;
      else if (alert.condition === 'LT') triggered = value < alert.threshold;
      else if (alert.condition === 'EQ') triggered = Math.abs(value - alert.threshold) < 0.01;

      if (triggered) {
        const lastTriggered = alert.lastTriggered;
        const cooldown = 5 * 60 * 1000;
        if (lastTriggered && Date.now() - lastTriggered.getTime() < cooldown) continue;

        await prisma.alert.update({ where: { id: alert.id }, data: { lastTriggered: new Date() } });

        const message = `Alert: ${alert.name} - ${alert.metric} is ${value.toFixed(1)}% (threshold: ${alert.threshold}%)`;

        if (alert.notifyEmail && alert.user?.email) {
          await NotificationService.sendEmail(alert.notifyEmail, `Alert: ${alert.name}`, message);
        }

        if (io) {
          io.to(`user:${alert.userId}`).emit('alert', { alertId: alert.id, name: alert.name, metric: alert.metric, value, threshold: alert.threshold });
        }
      }
    }
  }

  static async checkVMAlerts(vmId: string, cpu: number, ram: number, disk: number): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id: vmId } });
    if (!vm?.userId) return;

    const alerts = await prisma.alert.findMany({
      where: { userId: vm.userId, enabled: true },
    });

    for (const alert of alerts) {
      let value: number = 0;
      if (alert.metric === 'CPU') value = cpu;
      else if (alert.metric === 'RAM') value = ram;
      else if (alert.metric === 'DISK') value = disk;

      let triggered = false;
      if (alert.condition === 'GT') triggered = value > alert.threshold;
      else if (alert.condition === 'LT') triggered = value < alert.threshold;
      else if (alert.condition === 'EQ') triggered = Math.abs(value - alert.threshold) < 0.01;

      if (triggered) {
        const lastTriggered = alert.lastTriggered;
        const cooldown = 5 * 60 * 1000;
        if (lastTriggered && Date.now() - lastTriggered.getTime() < cooldown) continue;

        await prisma.alert.update({ where: { id: alert.id }, data: { lastTriggered: new Date() } });

        if (io) {
          io.to(`user:${vm.userId}`).emit('alert', {
            alertId: alert.id,
            name: alert.name,
            metric: alert.metric,
            value,
            threshold: alert.threshold,
            resourceId: vmId,
            resourceType: 'vm',
          });
        }
      }
    }
  }
}
