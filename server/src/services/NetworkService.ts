import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { validateIP } from '../utils/helpers';

function validateIpv4Range(pool: string): void {
  const value = pool.trim();
  if (!value) throw new Error('IP pool cannot be empty');

  if (value.includes('-')) {
    const [start, end] = value.split('-').map((part) => part.trim());
    if (!start || !end || !validateIP(start) || !validateIP(end)) throw new Error(`Invalid IP range: ${value}`);
    return;
  }

  if (value.includes('/')) {
    const [base, mask] = value.split('/');
    const maskBits = Number(mask);
    if (!validateIP(base) || !Number.isInteger(maskBits) || maskBits < 16 || maskBits > 30) {
      throw new Error(`Invalid CIDR range: ${value}`);
    }
    return;
  }

  if (!validateIP(value)) throw new Error(`Invalid IP address: ${value}`);
}

export class NetworkService {
  static async list(nodeId?: string): Promise<any[]> {
    const where: any = {};
    if (nodeId) where.nodeId = nodeId;
    return prisma.network.findMany({
      where,
      include: { _count: { select: { ipAddresses: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async get(id: string): Promise<any> {
    const network = await prisma.network.findUnique({
      where: { id },
      include: { ipAddresses: { where: { isAvailable: true } } },
    });
    if (!network) throw new Error('Network not found');
    return network;
  }

  static async create(data: any): Promise<any> {
    const nodeId = String(data.nodeId || '').trim();
    const name = String(data.name || '').trim();
    if (!nodeId) throw new Error('nodeId is required');
    if (!name) throw new Error('Network name is required');
    if (data.ipPool) for (const pool of String(data.ipPool).split(',')) validateIpv4Range(pool);

    const network = await prisma.network.create({
      data: {
        nodeId,
        name,
        bridge: data.bridge ? String(data.bridge) : null,
        vlan: data.vlan !== undefined && data.vlan !== '' ? Number(data.vlan) : null,
        subnet: data.subnet ? String(data.subnet) : null,
        gateway: data.gateway ? String(data.gateway) : null,
        dns: data.dns ? String(data.dns) : null,
        dhcpRange: data.dhcpRange ? String(data.dhcpRange) : null,
        ipPool: data.ipPool ? String(data.ipPool) : null,
      },
    });

    if (data.ipPool) await this.generateIPPool(network.id, String(data.ipPool));
    logger.info(`Network created: ${network.id}`);
    return network;
  }

  static async update(id: string, data: any): Promise<any> {
    const network = await prisma.network.findUnique({ where: { id } });
    if (!network) throw new Error('Network not found');

    const updateData: any = {};
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) throw new Error('Network name cannot be empty');
      updateData.name = name;
    }
    for (const key of ['bridge', 'subnet', 'gateway', 'dns', 'dhcpRange', 'ipPool', 'status']) {
      if (data[key] !== undefined) updateData[key] = data[key] === '' ? null : String(data[key]);
    }
    if (data.vlan !== undefined) updateData.vlan = data.vlan === '' ? null : Number(data.vlan);

    return prisma.network.update({ where: { id }, data: updateData });
  }

  static async delete(id: string): Promise<void> {
    const network = await prisma.network.findUnique({ where: { id } });
    if (!network) throw new Error('Network not found');
    const usedIps = await prisma.iPAddress.count({ where: { networkId: id, isAvailable: false } });
    if (usedIps > 0) throw new Error('Cannot delete network with assigned IPs');
    await prisma.iPAddress.deleteMany({ where: { networkId: id } });
    await prisma.network.delete({ where: { id } });
    logger.info(`Network deleted: ${id}`);
  }

  static async allocateIP(networkId: string, type: string = 'IPV4'): Promise<any> {
    const normalizedType = String(type || 'IPV4').toUpperCase();
    if (!['IPV4', 'IPV6'].includes(normalizedType)) throw new Error('Unsupported IP type');

    return prisma.$transaction(async (tx) => {
      const ip = await tx.iPAddress.findFirst({
        where: { networkId, isAvailable: true, type: normalizedType },
        orderBy: { address: 'asc' },
      });
      if (!ip) throw new Error('No available IP addresses');

      const claimed = await tx.iPAddress.updateMany({
        where: { id: ip.id, isAvailable: true },
        data: { isAvailable: false },
      });
      if (claimed.count !== 1) throw new Error('IP allocation conflicted; please retry');

      return tx.iPAddress.findUnique({ where: { id: ip.id } });
    });
  }

  static async releaseIP(ipId: string): Promise<void> {
    await prisma.iPAddress.update({
      where: { id: ipId },
      data: { isAvailable: true, vmId: null, containerId: null },
    });
  }

  static async assignIPToVM(ipId: string, vmId: string): Promise<any> {
    return prisma.iPAddress.update({
      where: { id: ipId },
      data: { isAvailable: false, vmId },
    });
  }

  static async getAvailableIPs(networkId: string): Promise<any[]> {
    return prisma.iPAddress.findMany({
      where: { networkId, isAvailable: true },
      orderBy: { address: 'asc' },
    });
  }

  private static async generateIPPool(networkId: string, pool: string): Promise<void> {
    const ranges = pool.split(',').map((range) => range.trim()).filter(Boolean);

    for (const trimmed of ranges) {
      validateIpv4Range(trimmed);

      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map((s) => s.trim());
        const startParts = start.split('.').map(Number);
        const endParts = end.split('.').map(Number);
        const startInt = (((startParts[0] << 24) >>> 0) + (startParts[1] << 16) + (startParts[2] << 8) + startParts[3]) >>> 0;
        const endInt = (((endParts[0] << 24) >>> 0) + (endParts[1] << 16) + (endParts[2] << 8) + endParts[3]) >>> 0;
        if (endInt < startInt || endInt - startInt > 65536) throw new Error(`Invalid or oversized IP range: ${trimmed}`);
        for (let i = startInt; i <= endInt; i += 1) {
          const ip = `${(i >>> 24) & 255}.${(i >>> 16) & 255}.${(i >>> 8) & 255}.${i & 255}`;
          await prisma.iPAddress.create({ data: { networkId, address: ip, type: 'IPV4' } });
        }
      } else if (trimmed.includes('/')) {
        const [base, mask] = trimmed.split('/');
        const maskBits = Number(mask);
        const parts = base.split('.').map(Number);
        const baseInt = (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
        const networkInt = (baseInt & (0xffffffff << (32 - maskBits))) >>> 0;
        const hostCount = Math.pow(2, 32 - maskBits) - 2;
        if (hostCount > 65534) throw new Error(`IP pool is too large: ${trimmed}`);
        for (let offset = 1; offset <= hostCount; offset += 1) {
          const ipInt = (networkInt + offset) >>> 0;
          const ip = `${(ipInt >>> 24) & 255}.${(ipInt >>> 16) & 255}.${(ipInt >>> 8) & 255}.${ipInt & 255}`;
          await prisma.iPAddress.create({ data: { networkId, address: ip, type: 'IPV4' } });
        }
      } else {
        await prisma.iPAddress.create({ data: { networkId, address: trimmed, type: 'IPV4' } });
      }
    }
  }
}
