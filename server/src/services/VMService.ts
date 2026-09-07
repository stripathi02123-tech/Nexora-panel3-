import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createProxmoxClient, ProxmoxClient } from '../integrations/Proxmox';
import { ResourceChecker } from './ResourceChecker';

export class VMService {
  static async getProxmoxClient(nodeId: string): Promise<ProxmoxClient> {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Node not found');
    return createProxmoxClient(node);
  }

  static async list(userId?: string): Promise<any[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    return prisma.virtualMachine.findMany({
      where,
      include: { node: { select: { id: true, name: true, host: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async get(id: string): Promise<any> {
    const vm = await prisma.virtualMachine.findUnique({
      where: { id },
      include: { node: true, snapshotList: true, backupList: true, firewallRules: true },
    });
    if (!vm) throw new Error('VM not found');
    return vm;
  }

  static async create(data: any, userId?: string): Promise<any> {
    const node = await prisma.node.findUnique({ where: { id: data.nodeId } });
    if (!node) throw new Error('Node not found');
    if (node.type !== 'PROXMOX') throw new Error('VMs can only be created on Proxmox nodes');

    if (userId && data.planId) {
      await ResourceChecker.checkVMLimits(userId, data.planId, data.cpuCores, data.ramMb, data.diskGb);
    }

    const proxmox = await this.getProxmoxClient(data.nodeId);
    await proxmox.authenticate();

    const vmConfig: any = {
      name: data.name,
      cores: data.cpuCores || 1,
      memory: data.ramMb || 1024,
      ...(data.ostype ? { ostype: data.ostype } : {}),
      ...(data.template ? { template: data.template } : {}),
    };

    if (data.diskGb) {
      vmConfig.disk = `${data.diskGb}G`;
    }
    if (data.bridge) {
      vmConfig.network = `model=virtio,bridge=${data.bridge}`;
    }

    const result = await proxmox.createVM(data.node, vmConfig);
    const vmid = result.vmid || result;

    const vm = await prisma.virtualMachine.create({
      data: {
        nodeId: data.nodeId,
        proxmoxId: vmid,
        name: data.name,
        cpuCores: data.cpuCores || 1,
        ramMb: data.ramMb || 1024,
        diskGb: data.diskGb || 20,
        os: data.os,
        template: data.template,
        bridge: data.bridge || 'vmbr0',
        userId: userId || data.userId,
        planId: data.planId,
        status: 'creating',
      },
    });

    logger.info(`VM created: ${vm.id} (VMID: ${vmid})`);
    return vm;
  }

  static async delete(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    if (vm.proxmoxId) {
      const proxmox = await this.getProxmoxClient(vm.nodeId);
      await proxmox.authenticate();
      const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
      if (node) {
        await proxmox.deleteVM(node.name, vm.proxmoxId);
      }
    }
    await prisma.virtualMachine.delete({ where: { id } });
    logger.info(`VM deleted: ${id}`);
  }

  static async start(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.startVM(node.name, vm.proxmoxId!);
    await prisma.virtualMachine.update({ where: { id }, data: { status: 'running' } });
  }

  static async stop(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.stopVM(node.name, vm.proxmoxId!);
    await prisma.virtualMachine.update({ where: { id }, data: { status: 'stopped' } });
  }

  static async restart(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.restartVM(node.name, vm.proxmoxId!);
  }

  static async shutdown(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.shutdownVM(node.name, vm.proxmoxId!);
    await prisma.virtualMachine.update({ where: { id }, data: { status: 'stopped' } });
  }

  static async suspend(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.suspendVM(node.name, vm.proxmoxId!);
    await prisma.virtualMachine.update({ where: { id }, data: { status: 'suspended' } });
  }

  static async resume(id: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.resumeVM(node.name, vm.proxmoxId!);
    await prisma.virtualMachine.update({ where: { id }, data: { status: 'running' } });
  }

  static async getConfig(id: string): Promise<any> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    return proxmox.getVMConfig(node.name, vm.proxmoxId!);
  }

  static async updateConfig(id: string, config: any): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.setVMConfig(node.name, vm.proxmoxId!, config);
    const updateData: any = {};
    if (config.cores) updateData.cpuCores = config.cores;
    if (config.memory) updateData.ramMb = config.memory;
    if (config.name) updateData.name = config.name;
    if (Object.keys(updateData).length > 0) {
      await prisma.virtualMachine.update({ where: { id }, data: updateData });
    }
  }

  static async getSnapshots(id: string): Promise<any[]> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    const snapshots = await proxmox.getVMSnapshots(node.name, vm.proxmoxId!);
    return snapshots.filter((s: any) => !s.parent || s.parent !== '');
  }

  static async createSnapshot(id: string, name: string, description?: string): Promise<any> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.createVMSnapshot(node.name, vm.proxmoxId!, name);
    const snapshot = await prisma.snapshot.create({
      data: { vmId: id, name, description, type: 'snapshot', status: 'completed' },
    });
    await prisma.virtualMachine.update({ where: { id }, data: { snapshots: { increment: 1 } } });
    return snapshot;
  }

  static async deleteSnapshot(id: string, snapshotId: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) throw new Error('Snapshot not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.deleteVMSnapshot(node.name, vm.proxmoxId!, snapshot.name);
    await prisma.snapshot.delete({ where: { id: snapshotId } });
    await prisma.virtualMachine.update({ where: { id }, data: { snapshots: { decrement: 1 } } });
  }

  static async rollbackSnapshot(id: string, snapshotId: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot) throw new Error('Snapshot not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.rollbackVMSnapshot(node.name, vm.proxmoxId!, snapshot.name);
  }

  static async getBackups(id: string): Promise<any[]> {
    return prisma.backup.findMany({ where: { vmId: id }, orderBy: { createdAt: 'desc' } });
  }

  static async createBackup(id: string, name: string, storage?: string): Promise<any> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.createVMBackup(node.name, vm.proxmoxId!, storage);
    const backup = await prisma.backup.create({
      data: { vmId: id, name, type: 'full', status: 'completed' },
    });
    await prisma.virtualMachine.update({ where: { id }, data: { backups: { increment: 1 } } });
    return backup;
  }

  static async restoreBackup(id: string, backupId: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const backup = await prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup) throw new Error('Backup not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.post(`/nodes/${node.name}/qemu/${vm.proxmoxId}/backup/${backup.id}/restore`);
  }

  static async migrate(id: string, target: string): Promise<void> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    await proxmox.migrateVM(node.name, vm.proxmoxId!, target);
  }

  static async getConsole(id: string): Promise<any> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    return proxmox.getVMConsole(node.name, vm.proxmoxId!);
  }

  static async getMetrics(id: string): Promise<any[]> {
    return prisma.metric.findMany({
      where: { vmId: id },
      orderBy: { timestamp: 'desc' },
      take: 60,
    });
  }

  static async getVncUrl(id: string): Promise<string> {
    const vm = await prisma.virtualMachine.findUnique({ where: { id } });
    if (!vm) throw new Error('VM not found');
    const proxmox = await this.getProxmoxClient(vm.nodeId);
    await proxmox.authenticate();
    const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
    if (!node) throw new Error('Node not found');
    const console = await proxmox.getVMConsole(node.name, vm.proxmoxId!);
    return console;
  }
}
