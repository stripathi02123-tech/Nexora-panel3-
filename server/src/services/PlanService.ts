import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class PlanService {
  static async list(includeInactive: boolean = false): Promise<any[]> {
    const where: any = {};
    if (!includeInactive) where.isActive = true;
    return prisma.plan.findMany({ where, orderBy: { price: 'asc' } });
  }

  static async get(id: string): Promise<any> {
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new Error('Plan not found');
    return plan;
  }

  static async create(data: any): Promise<any> {
    const existing = await prisma.plan.findUnique({ where: { name: data.name } });
    if (existing) throw new Error('Plan with this name already exists');
    return prisma.plan.create({ data });
  }

  static async update(id: string, data: any): Promise<any> {
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new Error('Plan not found');
    return prisma.plan.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    const plan = await prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new Error('Plan not found');
    const usageCount = await prisma.subscription.count({ where: { planId: id, status: 'ACTIVE' } });
    if (usageCount > 0) throw new Error('Cannot delete plan with active subscriptions');
    await prisma.plan.delete({ where: { id } });
    logger.info(`Plan deleted: ${id}`);
  }

  static async getUsageStats(planId: string): Promise<any> {
    const activeSubscriptions = await prisma.subscription.count({ where: { planId, status: 'ACTIVE' } });
    const totalVMs = await prisma.virtualMachine.count({ where: { planId } });
    const totalContainers = await prisma.container.count({ where: { planId } });
    const totalDocker = await prisma.dockerContainer.count({ where: { planId } });
    return { activeSubscriptions, totalVMs, totalContainers, totalDocker };
  }
}
