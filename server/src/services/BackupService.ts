import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createProxmoxClient } from '../integrations/Proxmox';
import { NotificationService } from './NotificationService';

export class BackupService {
  static async list(vmId?: string, containerId?: string): Promise<any[]> {
    const where: any = {};
    if (vmId) where.vmId = vmId;
    if (containerId) where.containerId = containerId;
    return prisma.backup.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  static async get(id: string): Promise<any> {
    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) throw new Error('Backup not found');
    return backup;
  }

  static async create(data: any): Promise<any> {
    const backupData: any = {
      name: data.name,
      description: data.description,
      type: data.type || 'full',
      status: 'pending',
    };

    if (data.vmId) backupData.vmId = data.vmId;
    if (data.containerId) backupData.containerId = data.containerId;

    const backup = await prisma.backup.create({ data: backupData });

    try {
      if (data.vmId) {
        const vm = await prisma.virtualMachine.findUnique({ where: { id: data.vmId } });
        if (vm && vm.proxmoxId) {
          const node = await prisma.node.findUnique({ where: { id: vm.nodeId } });
          if (node) {
            const proxmox = createProxmoxClient(node);
            await proxmox.authenticate();
            await proxmox.createVMBackup(node.name, vm.proxmoxId, data.storage || 'local');
            await prisma.virtualMachine.update({ where: { id: data.vmId }, data: { backups: { increment: 1 } } });
          }
        }
      }
      await prisma.backup.update({ where: { id: backup.id }, data: { status: 'completed' } });
    } catch (error) {
      await prisma.backup.update({ where: { id: backup.id }, data: { status: 'failed' } });
      throw error;
    }

    return backup;
  }

  static async delete(id: string): Promise<void> {
    const backup = await prisma.backup.findUnique({ where: { id } });
    if (!backup) throw new Error('Backup not found');
    if (backup.vmId) {
      await prisma.virtualMachine.update({ where: { id: backup.vmId }, data: { backups: { decrement: 1 } } });
    }
    await prisma.backup.delete({ where: { id } });
  }

  static async runScheduledBackups(): Promise<void> {
    const vmsWithAutoBackup = await prisma.virtualMachine.findMany({
      where: { autoBackup: true, status: 'running' },
      include: { node: true, user: true },
    });

    for (const vm of vmsWithAutoBackup) {
      try {
        if (!vm.backupSchedule) continue;
        if (!this.shouldRunBackup(vm.backupSchedule)) continue;

        logger.info(`Running scheduled backup for VM ${vm.id}`);
        await this.create({ vmId: vm.id, name: `auto-${new Date().toISOString().slice(0, 10)}`, type: 'full' });
      } catch (error) {
        logger.error(`Scheduled backup failed for VM ${vm.id}:`, error);
      }
    }
  }

  static async cleanup(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const oldBackups = await prisma.backup.findMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });

    for (const backup of oldBackups) {
      try {
        await this.delete(backup.id);
        logger.info(`Cleaned up old backup: ${backup.id}`);
      } catch (error) {
        logger.error(`Failed to clean up backup ${backup.id}:`, error);
      }
    }
  }

  private static shouldRunBackup(schedule: string): boolean {
    const now = new Date();
    switch (schedule) {
      case 'daily':
        return true;
      case 'weekly':
        return now.getDay() === 0;
      case 'monthly':
        return now.getDate() === 1;
      default:
        return true;
    }
  }
}
