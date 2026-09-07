import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { createDockerClient, DockerClient } from '../integrations/Docker';
import { ResourceChecker } from './ResourceChecker';

export class DockerService {
  static async getDockerClient(nodeId: string): Promise<DockerClient> {
    if (!nodeId) throw new Error('No Docker node configured');
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Node not found');
    return createDockerClient(node);
  }

  static async listContainers(nodeId: string, all: boolean = true): Promise<any[]> {
    const docker = await this.getDockerClient(nodeId);
    return docker.listContainers(all);
  }

  static async getContainer(containerId: string): Promise<any> {
    let container = await prisma.dockerContainer.findUnique({
      where: { id: containerId },
      include: { node: true },
    });
    if (!container) {
      container = await prisma.dockerContainer.findFirst({
        where: { containerId },
        include: { node: true },
      });
    }
    if (!container) throw new Error('Container not found');
    const rawPorts = container.ports ? JSON.parse(container.ports) : [];
    const normalizedPorts = Array.isArray(rawPorts) ? rawPorts.map((p: any) => ({
      host: p.hostPort || p.PublicPort || p.HostPort || p.host || '',
      container: p.containerPort || p.PrivatePort || p.ContainerPort || p.container || '',
      type: p.protocol || p.Type || p.type || 'tcp',
    })) : [];
    return {
      ...container,
      ports: normalizedPorts,
      state: container.status,
      created: container.createdAt,
      env: container.env ? container.env.split('\n').filter(Boolean) : [],
      volumes: container.mounts ? container.mounts.split('\n').filter(Boolean).map((m: string) => {
        const parts = m.split(':');
        return { hostPath: parts[0] || '', containerPath: parts[1] || '', mode: parts[2] || 'rw' };
      }) : [],
    };
  }

  static async createContainer(data: any, userId?: string): Promise<any> {
    if (userId && data.planId) {
      await ResourceChecker.checkDockerLimits(userId, data.planId);
    }

    const docker = await this.getDockerClient(data.nodeId);
    const isVds = data.type === 'vds';
    const baseOsImages = ['ubuntu', 'debian', 'alpine', 'centos', 'fedora', 'rockylinux', 'archlinux'];
    const imageName = (data.image || '').toLowerCase().split(':')[0];
    const isBaseOs = baseOsImages.some((os) => imageName === os || imageName.startsWith(os + '/'));
    const needsSystemd = isVds && isBaseOs && !data.cmd;

    const config: any = {
      Image: data.image,
      Cmd: data.cmd ? data.cmd.trim().split(/\s+/).filter(Boolean) : needsSystemd ? ['/sbin/init'] : undefined,
      Env: data.env ? data.env.split('\n').filter((e: string) => e.trim()) : undefined,
      HostConfig: {
        Dns: ['168.63.129.16', '8.8.8.8', '1.1.1.1'],
        RestartPolicy: { Name: data.restartPolicy || (isVds ? 'always' : 'no') },
        Binds: data.mounts ? data.mounts.split('\n').filter((m: string) => m.trim()) : undefined,
        PortBindings: data.ports ? this.parsePortBindings(data.ports) : undefined,
        NetworkMode: 'host',
        Privileged: isVds,
      },
    };

    if (isVds) {
      config.StopSignal = 'SIGRTMIN+3';
      if (!data.ports) {
        if (imageName === 'linuxserver/webtop' || imageName.startsWith('linuxserver/')) {
          config.Env = [...(config.Env || []), 'CUSTOM_USER=abcuser', 'PASSWORD=abcabc', 'TZ=Etc/UTC'];
        }
        const vdsPorts = '22:22';
        config.HostConfig.PortBindings = this.parsePortBindings(vdsPorts);
      }
    }

    if (data.name) config.name = data.name;

    let result;
    try {
      result = await docker.createContainer(config);
    } catch (err: any) {
      if (err.response?.status === 404) {
        logger.info(`Image ${data.image} not found locally, pulling...`);
        await docker.pullImage(data.image);
        result = await docker.createContainer(config);
      } else {
        throw err;
      }
    }
    if (result.Id) {
      await docker.startContainer(result.Id);
    }

    let assignedPorts = data.ports ? this.normalizePorts(data.ports) : undefined;
    try {
      const info = await docker.getContainer(result.Id);
      if (info?.NetworkSettings?.Ports) {
        const actualPorts: any[] = [];
        for (const [containerPortProto, bindings] of Object.entries(info.NetworkSettings.Ports)) {
          const [containerPort, protocol] = containerPortProto.split('/');
          if (Array.isArray(bindings)) {
            for (const b of bindings) {
              actualPorts.push({
                hostPort: (b as any).HostPort || '0',
                containerPort,
                protocol: protocol || 'tcp',
                hostIp: (b as any).HostIp || '0.0.0.0',
              });
            }
          }
        }
        if (actualPorts.length > 0) {
          assignedPorts = JSON.stringify(actualPorts);
        }
      }
    } catch { }

    if (isVds && !assignedPorts) {
      const vdsPorts = [
        { hostPort: '22', containerPort: '22', protocol: 'tcp' },
        { hostPort: '3000', containerPort: '3000', protocol: 'tcp' },
        { hostPort: '3389', containerPort: '3389', protocol: 'tcp' },
      ];
      assignedPorts = JSON.stringify(vdsPorts);
    }

    const container = await prisma.dockerContainer.create({
      data: {
        nodeId: data.nodeId,
        containerId: result.Id,
        name: data.name || result.Id.substring(0, 12),
        image: data.image,
        ports: assignedPorts,
        env: data.env,
        mounts: data.mounts,
        network: data.network || 'bridge',
        restartPolicy: data.restartPolicy || (isVds ? 'always' : 'no'),
        allocatedRamMB: data.allocatedRamMB ? parseFloat(data.allocatedRamMB) : (isVds ? 2048 : null),
        allocatedCpuCores: data.allocatedCpuCores ? parseFloat(data.allocatedCpuCores) : (isVds ? 2 : null),
        allocatedDiskGB: data.allocatedDiskGB ? parseFloat(data.allocatedDiskGB) : (isVds ? 20 : null),
        type: data.type || 'vps',
        sshPort: 22,
        userId: userId || data.userId,
        planId: data.planId,
        status: 'running',
      },
    });

    await this.syncNodeResources(data.nodeId);
    logger.info(`Docker container created: ${container.id} (${isVds ? 'VDS' : 'VPS'})`);
    return container;
  }

  static async syncNodeResources(nodeId: string): Promise<void> {
    const containers = await prisma.dockerContainer.findMany({ where: { nodeId, status: 'running' } });
    let totalRamMB = 0, totalCpuCores = 0;
    for (const c of containers) {
      if (c.allocatedRamMB) totalRamMB += c.allocatedRamMB;
      if (c.allocatedCpuCores) totalCpuCores += c.allocatedCpuCores;
    }
    await prisma.node.update({ where: { id: nodeId }, data: { ramUsed: totalRamMB, cpuUsage: totalCpuCores } });
  }

  static async removeContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.removeContainer(container.containerId, true);
    }
    await prisma.dockerContainer.delete({ where: { id } });
    await this.syncNodeResources(container.nodeId);
  }

  static async startContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.startContainer(container.containerId);
      await prisma.dockerContainer.update({ where: { id }, data: { status: 'running' } });
      await this.syncNodeResources(container.nodeId);
    }
  }

  static async stopContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.stopContainer(container.containerId);
      await prisma.dockerContainer.update({ where: { id }, data: { status: 'exited' } });
      await this.syncNodeResources(container.nodeId);
    }
  }

  static async restartContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.restartContainer(container.containerId);
    }
  }

  static async killContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.killContainer(container.containerId);
      await prisma.dockerContainer.update({ where: { id }, data: { status: 'exited' } });
    }
  }

  static async pauseContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.pauseContainer(container.containerId);
      await prisma.dockerContainer.update({ where: { id }, data: { status: 'paused' } });
    }
  }

  static async unpauseContainer(id: string): Promise<void> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (container.containerId) {
      await docker.unpauseContainer(container.containerId);
      await prisma.dockerContainer.update({ where: { id }, data: { status: 'running' } });
    }
  }

  static async getContainerLogs(id: string, tail: number = 100): Promise<string> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (!container.containerId) return '';
    return docker.getContainerLogs(container.containerId, tail);
  }

  static async getContainerStats(id: string): Promise<any> {
    const container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) throw new Error('Container not found');
    const docker = await this.getDockerClient(container.nodeId);
    if (!container.containerId) throw new Error('Container not running');
    return docker.getContainerStats(container.containerId);
  }

  static async execCommand(id: string, cmd: string[], workdir?: string): Promise<any> {
    const container = await DockerService._getContainer(id);
    const docker = await DockerService._getDockerClient(container.nodeId);
    if (!container.containerId) throw new Error('Container not running');
    return docker.execCommand(container.containerId, cmd, workdir);
  }

  static async getContainerForExec(id: string): Promise<any> {
    return DockerService._getContainer(id);
  }

  static async getDockerClientForExec(nodeId: string) {
    return DockerService._getDockerClient(nodeId);
  }

  static async listDirectory(id: string, path: string = '/'): Promise<any[]> {
    const container = await DockerService._getContainer(id);
    if (!container.containerId) throw new Error('Container not running');
    const docker = await DockerService._getDockerClient(container.nodeId);
    return docker.listDirectory(container.containerId, path);
  }

  static async readFile(id: string, path: string): Promise<string> {
    const container = await DockerService._getContainer(id);
    if (!container.containerId) throw new Error('Container not running');
    const docker = await DockerService._getDockerClient(container.nodeId);
    return docker.readFile(container.containerId, path);
  }

  static async writeFile(id: string, path: string, content: string): Promise<void> {
    const container = await DockerService._getContainer(id);
    if (!container.containerId) throw new Error('Container not running');
    const docker = await DockerService._getDockerClient(container.nodeId);
    return docker.writeFile(container.containerId, path, content);
  }

  private static async _getContainer(id: string): Promise<any> {
    let container = await prisma.dockerContainer.findUnique({ where: { id } });
    if (!container) {
      container = await prisma.dockerContainer.findFirst({ where: { containerId: id } });
    }
    if (!container) throw new Error('Container not found');
    return container;
  }

  private static async _getDockerClient(nodeId: string) {
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error('Node not found');
    return createDockerClient(node);
  }

  static async listImages(nodeId: string): Promise<any[]> {
    const docker = await this.getDockerClient(nodeId);
    return docker.listImages();
  }

  static async pullImage(nodeId: string, name: string): Promise<void> {
    const docker = await this.getDockerClient(nodeId);
    await docker.pullImage(name);
    const images = await docker.listImages();
    const pulled = images.find((i: any) => i.RepoTags?.includes(name));
    if (pulled) {
      await prisma.dockerImage.create({
        data: {
          nodeId,
          imageId: pulled.Id,
          name,
          tag: name.split(':')[1] || 'latest',
          size: pulled.Size,
        },
      });
    }
  }

  static async removeImage(nodeId: string, imageId: string): Promise<void> {
    const docker = await this.getDockerClient(nodeId);
    const image = await prisma.dockerImage.findUnique({ where: { id: imageId } });
    if (image?.imageId) {
      await docker.removeImage(image.imageId);
    }
    await prisma.dockerImage.delete({ where: { id: imageId } });
  }

  static async listCompose(nodeId?: string): Promise<any[]> {
    const where: any = {};
    if (nodeId) where.nodeId = nodeId;
    return prisma.dockerCompose.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  static async createCompose(data: any, userId?: string): Promise<any> {
    const docker = await this.getDockerClient(data.nodeId);
    return docker.createCompose(data.name, data.file);
  }

  static async startCompose(id: string): Promise<void> {
    const compose = await prisma.dockerCompose.findUnique({ where: { id } });
    if (!compose) throw new Error('Compose not found');
    const docker = await this.getDockerClient(compose.nodeId);
    await docker.startCompose(compose.name);
  }

  static async stopCompose(id: string): Promise<void> {
    const compose = await prisma.dockerCompose.findUnique({ where: { id } });
    if (!compose) throw new Error('Compose not found');
    const docker = await this.getDockerClient(compose.nodeId);
    await docker.stopCompose(compose.name);
  }

  static async removeCompose(id: string): Promise<void> {
    const compose = await prisma.dockerCompose.findUnique({ where: { id } });
    if (!compose) throw new Error('Compose not found');
    const docker = await this.getDockerClient(compose.nodeId);
    await docker.removeCompose(compose.name);
  }

  static async listVolumes(nodeId: string): Promise<any[]> {
    const docker = await this.getDockerClient(nodeId);
    return docker.listVolumes();
  }

  static async createVolume(nodeId: string, config: any): Promise<any> {
    const docker = await this.getDockerClient(nodeId);
    return docker.createVolume(config);
  }

  static async removeVolume(nodeId: string, volumeId: string): Promise<void> {
    const docker = await this.getDockerClient(nodeId);
    await docker.removeVolume(volumeId);
  }

  static async listNetworks(nodeId: string): Promise<any[]> {
    const docker = await this.getDockerClient(nodeId);
    return docker.listNetworks();
  }

  static async createNetwork(nodeId: string, config: any): Promise<any> {
    const docker = await this.getDockerClient(nodeId);
    return docker.createNetwork(config);
  }

  static async removeNetwork(nodeId: string, networkId: string): Promise<void> {
    const docker = await this.getDockerClient(nodeId);
    await docker.removeNetwork(networkId);
  }

  private static normalizePorts(ports: string): string {
    try { JSON.parse(ports); return ports; } catch {}
    const entries = ports.split(',').map((p: string) => p.trim());
    const result: any[] = [];
    for (const entry of entries) {
      if (!entry) continue;
      const match = entry.match(/^(\d+):(\d+)(?:\/(tcp|udp))?$/);
      if (match) {
        result.push({ hostPort: match[1], containerPort: match[2], protocol: match[3] || 'tcp' });
      }
    }
    return JSON.stringify(result);
  }

  private static parsePortBindings(ports: string): Record<string, any[]> {
    const bindings: Record<string, any[]> = {};
    const entries = ports.split(',').map((p: string) => p.trim());
    for (const entry of entries) {
      const match = entry.match(/^(\d+):(\d+)(?:\/(tcp|udp))?$/);
      if (match) {
        const containerPort = `${match[2]}/${match[3] || 'tcp'}`;
        bindings[containerPort] = bindings[containerPort] || [];
        bindings[containerPort].push({ HostPort: match[1] });
      }
    }
    return bindings;
  }
}
