import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { NotificationService } from './NotificationService';

export class BillingService {
  static async createSubscription(userId: string, planId: string): Promise<any> {
    const existing = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (existing) throw new Error('User already has an active subscription');

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) throw new Error('Plan not found or inactive');

    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await this.createInvoice(userId, subscription.id, plan.price, `Subscription to ${plan.name}`);

    logger.info(`Subscription created: ${subscription.id} for user ${userId}`);
    return subscription;
  }

  static async cancelSubscription(id: string): Promise<void> {
    const subscription = await prisma.subscription.findUnique({ where: { id } });
    if (!subscription) throw new Error('Subscription not found');
    await prisma.subscription.update({ where: { id }, data: { status: 'CANCELLED' } });
    logger.info(`Subscription cancelled: ${id}`);
  }

  static async renewSubscription(id: string): Promise<any> {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!subscription) throw new Error('Subscription not found');
    if (subscription.status !== 'ACTIVE') throw new Error('Subscription is not active');

    const newEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updated = await prisma.subscription.update({
      where: { id },
      data: { endDate: newEndDate },
    });

    await this.createInvoice(subscription.userId, id, subscription.plan.price, `Renewal of ${subscription.plan.name}`);
    return updated;
  }

  static async listSubscriptions(userId?: string): Promise<any[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    return prisma.subscription.findMany({
      where,
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getSubscription(id: string): Promise<any> {
    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, invoices: { orderBy: { createdAt: 'desc' } } },
    });
    if (!subscription) throw new Error('Subscription not found');
    return subscription;
  }

  static async createInvoice(userId: string, subscriptionId: string, amount: number, description: string): Promise<any> {
    const invoice = await prisma.invoice.create({
      data: {
        userId,
        subscriptionId,
        amount,
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        items: JSON.stringify([{ description, amount }]),
      },
    });

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await NotificationService.sendEmail(user.email, 'New Invoice', `Invoice #${invoice.id} for $${amount} has been created.`);
      }
    } catch (err) {
      logger.error('Failed to send invoice notification:', err);
    }

    return invoice;
  }

  static async listInvoices(userId?: string): Promise<any[]> {
    const where: any = {};
    if (userId) where.userId = userId;
    return prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getInvoice(id: string): Promise<any> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new Error('Invoice not found');
    return invoice;
  }

  static async payInvoice(id: string): Promise<void> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new Error('Invoice not found');
    await prisma.invoice.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  static async getUserUsage(userId: string): Promise<any> {
    const vms = await prisma.virtualMachine.findMany({ where: { userId } });
    const containers = await prisma.container.findMany({ where: { userId } });
    const dockerContainers = await prisma.dockerContainer.findMany({ where: { userId } });

    const totalCpu = vms.reduce((sum, vm) => sum + vm.cpuCores, 0) + containers.reduce((sum, c) => sum + c.cpuCores, 0);
    const totalRam = vms.reduce((sum, vm) => sum + vm.ramMb, 0) + containers.reduce((sum, c) => sum + c.ramMb, 0);
    const totalDisk = vms.reduce((sum, vm) => sum + vm.diskGb, 0) + containers.reduce((sum, c) => sum + c.diskGb, 0);

    return {
      vms: vms.length,
      containers: containers.length,
      dockerContainers: dockerContainers.length,
      totalCpu,
      totalRamMb: totalRam,
      totalDiskGb: totalDisk,
    };
  }

  static async processExpiredSubscriptions(): Promise<void> {
    const expired = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: { lte: new Date() },
      },
      include: { user: true, plan: true },
    });

    for (const sub of expired) {
      if (sub.autoRenew) {
        try {
          await this.renewSubscription(sub.id);
          logger.info(`Auto-renewed subscription ${sub.id}`);
        } catch (err) {
          logger.error(`Failed to auto-renew subscription ${sub.id}:`, err);
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
        }
      } else {
        await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
        logger.info(`Expired subscription ${sub.id}`);
      }
    }
  }
}
