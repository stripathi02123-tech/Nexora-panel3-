import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class WebhookService {
  static async list(userId: string): Promise<any[]> {
    return prisma.webhook.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async get(id: string): Promise<any> {
    const webhook = await prisma.webhook.findUnique({
      where: { id },
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!webhook) throw new Error('Webhook not found');
    return webhook;
  }

  static async create(data: any, userId: string): Promise<any> {
    return prisma.webhook.create({
      data: {
        userId,
        name: data.name,
        url: data.url,
        secret: data.secret,
        events: Array.isArray(data.events) ? data.events.join(',') : data.events,
        isActive: data.isActive !== false,
      },
    });
  }

  static async update(id: string, data: any): Promise<any> {
    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) throw new Error('Webhook not found');
    return prisma.webhook.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) throw new Error('Webhook not found');
    await prisma.webhookLog.deleteMany({ where: { webhookId: id } });
    await prisma.webhook.delete({ where: { id } });
  }

  static async trigger(event: string, payload: any): Promise<void> {
    const webhooks = await prisma.webhook.findMany({
      where: {
        isActive: true,
        events: { contains: event },
      },
    });

    for (const webhook of webhooks) {
      this.deliver(webhook, event, payload).catch((err) => {
        logger.error(`Webhook delivery failed for ${webhook.id}:`, err);
      });
    }
  }

  private static async deliver(webhook: any, event: string, payload: any): Promise<void> {
    try {
      const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
      const signature = webhook.secret
        ? crypto.createHmac('sha256', webhook.secret).update(body).digest('hex')
        : undefined;

      const response = await axios.post(webhook.url, body, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Nexora-Webhook/1.0',
          ...(signature ? { 'X-Webhook-Signature': signature } : {}),
        },
        timeout: 10000,
      });

      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          event,
          status: response.status,
          response: JSON.stringify(response.data).substring(0, 1000),
        },
      });
    } catch (error: any) {
      await prisma.webhookLog.create({
        data: {
          webhookId: webhook.id,
          event,
          status: error.response?.status || 0,
          response: error.message?.substring(0, 1000) || 'Connection failed',
        },
      });
    }
  }

  static async toggle(id: string, isActive: boolean): Promise<any> {
    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) throw new Error('Webhook not found');
    return prisma.webhook.update({ where: { id }, data: { isActive } });
  }

  static async getLogs(id: string): Promise<any[]> {
    return prisma.webhookLog.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
