import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class AuditService {
  static async list(params: {
    userId?: string;
    action?: string;
    resource?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 25, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.userId) where.userId = params.userId;
    if (params.action) where.action = params.action;
    if (params.resource) where.resource = params.resource;
    if (params.from || params.to) {
      where.timestamp = {};
      if (params.from) where.timestamp.gte = params.from;
      if (params.to) where.timestamp.lte = params.to;
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  static async getStats(): Promise<any> {
    const [totalLogs, uniqueActions, uniqueUsers] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.groupBy({ by: ['action'], _count: true }),
      prisma.auditLog.groupBy({ by: ['userId'], _count: true }),
    ]);

    const last24h = await prisma.auditLog.count({
      where: { timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    return { totalLogs, last24h, uniqueActions: uniqueActions.length, uniqueUsers: uniqueUsers.length };
  }

  static async pruneOlderThan(days: number = 90): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoff } },
    });
    logger.info(`Pruned ${result.count} audit logs older than ${days} days`);
    return result.count;
  }

  static async create(data: {
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: string;
    ip?: string;
  }): Promise<any> {
    return prisma.auditLog.create({ data });
  }
}
