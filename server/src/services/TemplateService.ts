import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createProxmoxClient } from '../integrations/Proxmox';

export class TemplateService {
  static async list(nodeId?: string): Promise<any[]> {
    const where: any = {};
    if (nodeId) where.nodeId = nodeId;
    return prisma.node.findMany({ where: { type: 'PROXMOX' } }).then(async (nodes) => {
      const templates: any[] = [];
      for (const node of nodeId ? nodes.filter((n: any) => n.id === nodeId) : nodes) {
        try {
          const proxmox = createProxmoxClient(node);
          await proxmox.authenticate();
          const nodeTemplates = await proxmox.getTemplates(node.name, 'vztmpl');
          templates.push(...nodeTemplates.map((t: any) => ({ ...t, nodeId: node.id, nodeName: node.name })));
        } catch (err) {
          logger.error(`Failed to get templates from node ${node.name}:`, err);
        }
      }
      return templates;
    });
  }

  static async listOS(nodeId?: string): Promise<any[]> {
    const where: any = {};
    if (nodeId) where.nodeId = nodeId;
    return prisma.node.findMany({ where: { type: 'PROXMOX' } }).then(async (nodes) => {
      const templates: any[] = [];
      for (const node of nodeId ? nodes.filter((n: any) => n.id === nodeId) : nodes) {
        try {
          const proxmox = createProxmoxClient(node);
          await proxmox.authenticate();
          const storages = await proxmox.getStorages(node.name);
          for (const storage of storages) {
            if (storage.content?.includes('iso') || storage.content?.includes('vztmpl')) {
              const content = await proxmox.getStorageContent(node.name, storage.storage);
              templates.push(...content.map((c: any) => ({ ...c, nodeId: node.id, nodeName: node.name, storage: storage.storage })));
            }
          }
        } catch (err) {
          logger.error(`Failed to get OS templates from node ${node.name}:`, err);
        }
      }
      return templates;
    });
  }

  static async downloadTemplate(nodeId: string, templateUrl: string, storage: string = 'local'): Promise<void> {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Node not found');
    if (node.type !== 'PROXMOX') throw new Error('Only Proxmox nodes support templates');

    const proxmox = createProxmoxClient(node);
    await proxmox.authenticate();
    await proxmox.post(`/nodes/${node.name}/storage/${storage}/download-url`, { url: templateUrl });
    logger.info(`Downloading template ${templateUrl} to node ${node.name}`);
  }

  static async deleteTemplate(nodeId: string, storage: string, volumeId: string): Promise<void> {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Node not found');

    const proxmox = createProxmoxClient(node);
    await proxmox.authenticate();
    await proxmox.del(`/nodes/${node.name}/storage/${storage}/content/${volumeId}`);
    logger.info(`Deleted template ${volumeId} from node ${node.name}`);
  }
}
