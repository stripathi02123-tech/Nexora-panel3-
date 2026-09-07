import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

export class FirewallService {
  static async list(vmId?: string, containerId?: string): Promise<any[]> {
    const where: any = {};
    if (vmId) where.vmId = vmId;
    if (containerId) where.containerId = containerId;
    return prisma.firewallRule.findMany({ where, orderBy: { priority: 'asc' } });
  }

  static async get(id: string): Promise<any> {
    const rule = await prisma.firewallRule.findUnique({ where: { id } });
    if (!rule) throw new Error('Firewall rule not found');
    return rule;
  }

  static async create(data: any): Promise<any> {
    const rule = await prisma.firewallRule.create({
      data: {
        vmId: data.vmId,
        containerId: data.containerId,
        name: data.name,
        rule: data.rule,
        direction: data.direction || 'INBOUND',
        action: data.action || 'ALLOW',
        protocol: data.protocol || 'tcp',
        sourcePort: data.sourcePort ? parseInt(data.sourcePort, 10) : null,
        destPort: data.destPort ? parseInt(data.destPort, 10) : null,
        sourceIp: data.sourceIp,
        destIp: data.destIp,
        priority: data.priority || 0,
        enabled: data.enabled !== false,
      },
    });
    logger.info(`Firewall rule created: ${rule.id}`);
    return rule;
  }

  static async update(id: string, data: any): Promise<any> {
    const rule = await prisma.firewallRule.findUnique({ where: { id } });
    if (!rule) throw new Error('Firewall rule not found');
    return prisma.firewallRule.update({ where: { id }, data });
  }

  static async delete(id: string): Promise<void> {
    const rule = await prisma.firewallRule.findUnique({ where: { id } });
    if (!rule) throw new Error('Firewall rule not found');
    await prisma.firewallRule.delete({ where: { id } });
    logger.info(`Firewall rule deleted: ${id}`);
  }

  static async toggle(id: string, enabled: boolean): Promise<any> {
    const rule = await prisma.firewallRule.findUnique({ where: { id } });
    if (!rule) throw new Error('Firewall rule not found');
    return prisma.firewallRule.update({ where: { id }, data: { enabled } });
  }

  static async applyRules(vmId?: string, containerId?: string): Promise<{ prepared: number; commands: string[] }> {
    const where: any = { enabled: true };
    if (vmId) where.vmId = vmId;
    if (containerId) where.containerId = containerId;
    const rules = await prisma.firewallRule.findMany({ where, orderBy: { priority: 'asc' } });

    const commands = rules.map((rule) => {
      const chain = rule.direction === 'INBOUND' ? 'INPUT' : 'OUTPUT';
      const action = rule.action === 'ALLOW' ? 'ACCEPT' : 'DROP';
      let cmd = `iptables -A ${chain}`;
      if (rule.protocol) cmd += ` -p ${rule.protocol}`;
      if (rule.sourceIp) cmd += ` -s ${rule.sourceIp}`;
      if (rule.destIp) cmd += ` -d ${rule.destIp}`;
      if (rule.sourcePort) cmd += ` --sport ${rule.sourcePort}`;
      if (rule.destPort) cmd += ` --dport ${rule.destPort}`;
      cmd += ` -j ${action}`;
      return cmd;
    });

    logger.info(`Prepared ${commands.length} firewall rules`);
    return { prepared: commands.length, commands };
  }
}
