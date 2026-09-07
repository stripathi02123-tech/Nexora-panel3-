import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class ResourceChecker {
  static async checkVMLimits(userId: string, planId: string, cpuCores: number, ramMb: number, diskGb: number): Promise<void> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plan not found');

    const subscription = await prisma.subscription.findFirst({
      where: { userId, planId, status: 'ACTIVE' },
    });
    if (!subscription) throw new Error('No active subscription for this plan');

    const userVMs = await prisma.virtualMachine.findMany({ where: { userId } });
    const totalCpu = userVMs.reduce((sum, vm) => sum + vm.cpuCores, 0) + cpuCores;
    const totalRam = userVMs.reduce((sum, vm) => sum + vm.ramMb, 0) + ramMb;
    const totalDisk = userVMs.reduce((sum, vm) => sum + vm.diskGb, 0) + diskGb;

    if (plan.vmCpuLimit && totalCpu > plan.vmCpuLimit) {
      throw new Error(`CPU limit exceeded: ${totalCpu}/${plan.vmCpuLimit} cores`);
    }
    if (plan.vmRamLimit && totalRam > plan.vmRamLimit) {
      throw new Error(`RAM limit exceeded: ${totalRam}/${plan.vmRamLimit} MB`);
    }
    if (plan.vmDiskLimit && totalDisk > plan.vmDiskLimit) {
      throw new Error(`Disk limit exceeded: ${totalDisk}/${plan.vmDiskLimit} GB`);
    }

    const vmCount = userVMs.length;
    logger.info(`VM resource check passed: ${vmCount + 1} VMs, ${totalCpu} cores, ${totalRam} MB, ${totalDisk} GB`);
  }

  static async checkContainerLimits(userId: string, planId: string, cpuCores: number, ramMb: number, diskGb: number): Promise<void> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plan not found');

    const subscription = await prisma.subscription.findFirst({
      where: { userId, planId, status: 'ACTIVE' },
    });
    if (!subscription) throw new Error('No active subscription for this plan');

    const userContainers = await prisma.container.findMany({ where: { userId } });
    const totalCpu = userContainers.reduce((sum, c) => sum + c.cpuCores, 0) + cpuCores;
    const totalRam = userContainers.reduce((sum, c) => sum + c.ramMb, 0) + ramMb;
    const totalDisk = userContainers.reduce((sum, c) => sum + c.diskGb, 0) + diskGb;

    if (plan.containerCpuLimit && totalCpu > plan.containerCpuLimit) {
      throw new Error(`Container CPU limit exceeded: ${totalCpu}/${plan.containerCpuLimit} cores`);
    }
    if (plan.containerRamLimit && totalRam > plan.containerRamLimit) {
      throw new Error(`Container RAM limit exceeded: ${totalRam}/${plan.containerRamLimit} MB`);
    }
    if (plan.containerDiskLimit && totalDisk > plan.containerDiskLimit) {
      throw new Error(`Container disk limit exceeded: ${totalDisk}/${plan.containerDiskLimit} GB`);
    }

    logger.info(`Container resource check passed: ${totalCpu} cores, ${totalRam} MB, ${totalDisk} GB`);
  }

  static async checkDockerLimits(userId: string, planId: string): Promise<void> {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Plan not found');

    const subscription = await prisma.subscription.findFirst({
      where: { userId, planId, status: 'ACTIVE' },
    });
    if (!subscription) throw new Error('No active subscription for this plan');

    const dockerCount = await prisma.dockerContainer.count({ where: { userId } });
    if (plan.dockerLimit && dockerCount >= plan.dockerLimit) {
      throw new Error(`Docker container limit exceeded: ${dockerCount}/${plan.dockerLimit}`);
    }

    logger.info(`Docker resource check passed: ${dockerCount + 1} containers`);
  }

  static async checkBackupLimit(userId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });
    if (!subscription || !subscription.plan) return;

    const vmBackups = await prisma.backup.count({
      where: { vm: { userId } },
    });
    const containerBackups = await prisma.backup.count({
      where: { container: { userId } },
    });
    const totalBackups = vmBackups + containerBackups;

    if (subscription.plan.backupLimit && totalBackups >= subscription.plan.backupLimit) {
      throw new Error(`Backup limit exceeded: ${totalBackups}/${subscription.plan.backupLimit}`);
    }
  }

  static async checkSnapshotLimit(userId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });
    if (!subscription || !subscription.plan) return;

    const vmSnapshots = await prisma.snapshot.count({
      where: { vm: { userId } },
    });
    const containerSnapshots = await prisma.snapshot.count({
      where: { container: { userId } },
    });
    const totalSnapshots = vmSnapshots + containerSnapshots;

    if (subscription.plan.snapshotLimit && totalSnapshots >= subscription.plan.snapshotLimit) {
      throw new Error(`Snapshot limit exceeded: ${totalSnapshots}/${subscription.plan.snapshotLimit}`);
    }
  }
}
