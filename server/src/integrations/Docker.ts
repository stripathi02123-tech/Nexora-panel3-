import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { decryptNodeSecret } from '../utils/helpers';
import { config } from '../config';
import { classifyConnectionError } from '../utils/connectionErrors';

interface DockerContainerInfo {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  Command: string;
  Created: number;
  Ports: any[];
  Labels: Record<string, string>;
  State: string;
  Status: string;
  HostConfig: { NetworkMode: string };
  NetworkSettings: { Networks: Record<string, any> };
  Mounts: any[];
}

export class DockerClient {
  private axios: AxiosInstance | null = null;
  private host: string;
  private port: number;
  private credentials: string;
  private encryptionKey: string;

  constructor(host: string, port: number, credentials: string, encryptionKey: string = config.encryptionKey) {
    this.host = host;
    this.port = port;
    this.credentials = credentials;
    this.encryptionKey = encryptionKey;
  }

  private getBaseUrl(): string {
    // Docker's own docs and tooling refer to the remote API as
    // "tcp://host:port" — admins very commonly paste that form in, or a
    // "host:port" pair, or an http:// URL. The old code did a blind
    // `http://${host}:${port}` template with no normalization at all, so
    // any of those forms produced a broken URL (e.g.
    // "http://tcp://1.2.3.4:2375:2375") and the node would show OFFLINE
    // with no indication why. Normalize the same way the Node Agent client
    // does.
    let host = String(this.host || '').trim().replace(/\/+$/, '');
    if (!host) throw new Error('Docker host is empty');

    if (/^tcp:\/\//i.test(host)) host = host.replace(/^tcp:\/\//i, 'http://');

    if (/^https?:\/\//i.test(host)) {
      const parsed = new URL(host);
      if (parsed.protocol === 'https:') {
        throw new Error(
          'Docker host is configured with https:// but this client does not perform TLS client-cert negotiation. ' +
          'Use http:// (or tcp://) and expose the Docker daemon over plain TCP, or put a TLS-terminating proxy in front of it.'
        );
      }
      host = parsed.hostname;
      if (parsed.port && Number(parsed.port) !== this.port) {
        throw new Error(`Docker host URL port ${parsed.port} does not match configured port ${this.port}`);
      }
    } else if (!host.startsWith('[') && (host.match(/:/g) || []).length === 1) {
      const [bareHost, portStr] = host.split(':');
      const embeddedPort = Number(portStr);
      if (!bareHost) throw new Error('Docker host is empty');
      if (Number.isInteger(embeddedPort) && embeddedPort >= 1 && embeddedPort <= 65535) {
        if (embeddedPort !== this.port) {
          throw new Error(`Docker host embeds port ${embeddedPort}, which does not match the configured port ${this.port}.`);
        }
        host = bareHost;
      }
    }

    const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
    return `http://${urlHost}:${this.port}`;
  }

  private getAxios(): AxiosInstance {
    if (this.axios) return this.axios;

    let authHeader: string | undefined;
    const trimmedCredentials = String(this.credentials || '').trim();
    if (trimmedCredentials) {
      // Never let a decrypt failure crash the request with a raw crypto
      // error, and never send undecryptable ciphertext as if it were the
      // real credential.
      const decrypted = decryptNodeSecret(trimmedCredentials, this.encryptionKey);
      if (decrypted && decrypted !== 'none') {
        authHeader = `Basic ${Buffer.from(decrypted).toString('base64')}`;
      }
    }

    this.axios = axios.create({
      baseURL: this.getBaseUrl(),
      timeout: config.dockerTimeout,
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    return this.axios;
  }

  async connect(): Promise<boolean> {
    try {
      await this.getInfo();
      logger.info(`Connected to Docker at ${this.host}:${this.port}`);
      return true;
    } catch (error) {
      // Previously this swallowed the real error and just returned false,
      // which is why a misconfigured/unreachable Docker node showed a bare
      // "OFFLINE" with zero diagnostic information. Log the classified
      // reason AND rethrow it so callers (NodeService.checkHealth) can
      // surface it instead of guessing.
      const { code, message } = classifyConnectionError(error);
      logger.warn(`Docker connect failed: host=${this.host} port=${this.port} code=${code} error="${message}"`);
      throw new Error(message);
    }
  }

  async getInfo(): Promise<any> {
    const response = await this.getAxios().get('/info');
    return response.data;
  }

  async listContainers(all: boolean = true): Promise<DockerContainerInfo[]> {
    const response = await this.getAxios().get('/containers/json', { params: { all } });
    return response.data;
  }

  async getContainer(id: string): Promise<any> {
    const response = await this.getAxios().get(`/containers/${id}/json`);
    return response.data;
  }

  async createContainer(config: any): Promise<any> {
    const response = await this.getAxios().post('/containers/create', config);
    return response.data;
  }

  async startContainer(id: string): Promise<void> {
    await this.getAxios().post(`/containers/${id}/start`);
  }

  async stopContainer(id: string): Promise<void> {
    await this.getAxios().post(`/containers/${id}/stop`);
  }

  async restartContainer(id: string): Promise<void> {
    await this.getAxios().post(`/containers/${id}/restart`);
  }

  async removeContainer(id: string, force: boolean = false): Promise<void> {
    await this.getAxios().delete(`/containers/${id}`, { params: { force, v: true } });
  }

  async killContainer(id: string): Promise<void> {
    await this.getAxios().post(`/containers/${id}/kill`);
  }

  async pauseContainer(id: string): Promise<void> {
    await this.getAxios().post(`/containers/${id}/pause`);
  }

  async unpauseContainer(id: string): Promise<void> {
    await this.getAxios().post(`/containers/${id}/unpause`);
  }

  async getContainerLogs(id: string, tail: number = 100): Promise<string> {
    const response = await this.getAxios().get(`/containers/${id}/logs`, {
      params: { stdout: true, stderr: true, tail },
      responseType: 'text',
    });
    return response.data;
  }

  async getContainerStats(id: string): Promise<any> {
    const response = await this.getAxios().get(`/containers/${id}/stats`, { params: { stream: false } });
    return response.data;
  }

  async listImages(): Promise<any[]> {
    const response = await this.getAxios().get('/images/json');
    return response.data;
  }

  async pullImage(name: string): Promise<void> {
    await this.getAxios().post('/images/create', null, { params: { fromImage: name }, timeout: 300000 });
  }

  async removeImage(id: string, force: boolean = false): Promise<void> {
    await this.getAxios().delete(`/images/${id}`, { params: { force } });
  }

  async buildImage(context: any): Promise<any> {
    const response = await this.getAxios().post('/build', context, {
      headers: { 'Content-Type': 'application/x-tar' },
    });
    return response.data;
  }

  async listVolumes(): Promise<any[]> {
    const response = await this.getAxios().get('/volumes');
    return response.data.Volumes || [];
  }

  async createVolume(config: any): Promise<any> {
    const response = await this.getAxios().post('/volumes/create', config);
    return response.data;
  }

  async removeVolume(id: string): Promise<void> {
    await this.getAxios().delete(`/volumes/${id}`, { params: { force: true } });
  }

  async listNetworks(): Promise<any[]> {
    const response = await this.getAxios().get('/networks');
    return response.data;
  }

  async createNetwork(config: any): Promise<any> {
    const response = await this.getAxios().post('/networks/create', config);
    return response.data;
  }

  async removeNetwork(id: string): Promise<void> {
    await this.getAxios().delete(`/networks/${id}`);
  }

  async connectContainer(networkId: string, containerId: string): Promise<void> {
    await this.getAxios().post(`/networks/${networkId}/connect`, { container: containerId });
  }

  async listCompose(): Promise<any[]> {
    const { prisma } = require('../utils/database');
    return prisma.dockerCompose.findMany();
  }

  async createCompose(name: string, file: string): Promise<any> {
    const { prisma } = require('../utils/database');
    const compose = await prisma.dockerCompose.create({ data: { name, file, status: 'created' } });
    const { execSync } = require('child_process');
    const tmpFile = `${require('os').tmpdir()}/docker-compose-${name}.yml`;
    require('fs').writeFileSync(tmpFile, file);
    try {
      execSync(`docker-compose -f ${tmpFile} up -d`, { timeout: 120000 });
      await prisma.dockerCompose.update({ where: { id: compose.id }, data: { status: 'running' } });
    } finally {
      try { require('fs').unlinkSync(tmpFile); } catch { }
    }
    return compose;
  }

  async startCompose(name: string): Promise<void> {
    const { prisma } = require('../utils/database');
    const compose = await prisma.dockerCompose.findUnique({ where: { name } });
    if (!compose) throw new Error('Compose not found');
    const { execSync } = require('child_process');
    const tmpFile = `${require('os').tmpdir()}/docker-compose-${name}.yml`;
    require('fs').writeFileSync(tmpFile, compose.file);
    try {
      execSync(`docker-compose -f ${tmpFile} up -d`, { timeout: 120000 });
      await prisma.dockerCompose.update({ where: { id: compose.id }, data: { status: 'running' } });
    } finally {
      try { require('fs').unlinkSync(tmpFile); } catch { }
    }
  }

  async stopCompose(name: string): Promise<void> {
    const { prisma } = require('../utils/database');
    const compose = await prisma.dockerCompose.findUnique({ where: { name } });
    if (!compose) throw new Error('Compose not found');
    const { execSync } = require('child_process');
    const tmpFile = `${require('os').tmpdir()}/docker-compose-${name}.yml`;
    require('fs').writeFileSync(tmpFile, compose.file);
    try {
      execSync(`docker-compose -f ${tmpFile} down`, { timeout: 60000 });
      await prisma.dockerCompose.update({ where: { id: compose.id }, data: { status: 'stopped' } });
    } finally {
      try { require('fs').unlinkSync(tmpFile); } catch { }
    }
  }

  async removeCompose(name: string): Promise<void> {
    const { prisma } = require('../utils/database');
    const compose = await prisma.dockerCompose.findUnique({ where: { name } });
    if (!compose) throw new Error('Compose not found');
    const { execSync } = require('child_process');
    const tmpFile = `${require('os').tmpdir()}/docker-compose-${name}.yml`;
    require('fs').writeFileSync(tmpFile, compose.file);
    try {
      execSync(`docker-compose -f ${tmpFile} down --volumes --remove-orphans`, { timeout: 60000 });
      await prisma.dockerCompose.delete({ where: { id: compose.id } });
    } finally {
      try { require('fs').unlinkSync(tmpFile); } catch { }
    }
  }

  async execCommand(containerId: string, cmd: string[], workdir?: string): Promise<any> {
    const shellCmd = cmd.length === 1 ? cmd[0] : cmd.join(' ');
    const wrapped = this.wrapCommand(shellCmd);
    const fullCmd = workdir ? `cd "${workdir}" 2>/dev/null; ${wrapped}` : wrapped;
    const execConfig = {
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ['sh', '-c', fullCmd],
    };
    const execResult = await this.getAxios().post(`/containers/${containerId}/exec`, execConfig);
    const execId = execResult.data.Id;
    const startResponse = await this.getAxios().post(`/exec/${execId}/start`, { Detach: false, Tty: true }, {
      responseType: 'text',
    });
    return { execId, output: startResponse.data };
  }

  async execStream(containerId: string, cmd: string[], workdir?: string): Promise<any> {
    const { default: axios } = require('axios');
    const shellCmd = cmd.length === 1 ? cmd[0] : cmd.join(' ');
    const wrapped = this.wrapCommand(shellCmd);
    const fullCmd = workdir ? `cd "${workdir}" 2>/dev/null; ${wrapped}` : wrapped;
    const execConfig = { AttachStdout: true, AttachStderr: true, Tty: true, Cmd: ['sh', '-c', fullCmd] };
    const execResult = await this.getAxios().post(`/containers/${containerId}/exec`, execConfig);
    const execId = execResult.data.Id;

    const url = `${this.getBaseUrl()}/exec/${execId}/start`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authHeader = this.getAxios().defaults.headers?.Authorization as string;
    if (authHeader) headers.Authorization = authHeader;
    const response = await axios.post(url, { Detach: false, Tty: true }, {
      responseType: 'stream',
      headers,
    });
    return response.data;
  }

  private wrapCommand(cmd: string): string {
    const trimmed = cmd.trim();
    if (/^(apt|apt-get)\b/.test(trimmed)) {
      if (/^(apt\s+install|apt-get\s+install)\b/.test(trimmed) && !trimmed.includes('-y') && !trimmed.includes('--yes')) {
        return `DEBIAN_FRONTEND=noninteractive ${trimmed} -y`;
      }
      return `DEBIAN_FRONTEND=noninteractive ${trimmed}`;
    }
    return trimmed;
  }

  async execBulk(containerId: string, cmds: string[]): Promise<string[]> {
    const results: string[] = [];
    for (const c of cmds) {
      const r = await this.execCommand(containerId, [c]);
      results.push(r.output);
    }
    return results;
  }

  async readFile(containerId: string, path: string): Promise<string> {
    const r = await this.execCommand(containerId, [`cat "${path}" 2>/dev/null || echo -n '__NEXORA_NOT_FOUND__'`]);
    const output = r.output || '';
    if (output.includes('__NEXORA_NOT_FOUND__')) throw new Error('File not found');
    return output;
  }

  async writeFile(containerId: string, path: string, content: string): Promise<void> {
    const marker = 'NEXORA_EOF_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const cmd = `mkdir -p "$(dirname "${path}")" 2>/dev/null; cat > "${path}" << '${marker}'\n${content}\n${marker}`;
    const r = await this.execCommand(containerId, [cmd]);
    if (r.output && (r.output.includes('No such file') || r.output.includes('not found'))) {
      throw new Error('Failed to write file: ' + r.output.trim());
    }
  }

  async listDirectory(containerId: string, path: string): Promise<any[]> {
    const r = await this.execCommand(containerId, [
      `ls -1ap "${path}" 2>/dev/null || echo "__NOT_FOUND__"`,
      `stat -c"%F|%s|%a|%u|%g|%Y" "${path}"/* "${path}"/.* 2>/dev/null || true`,
    ]);
    const lines = r.output.split('\n').filter((l: string) => l.trim() && !l.startsWith('__NOT_FOUND__'));
    if (lines.length === 0) return [];
    
    const entries: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('total ')) continue;
      const isDir = line.endsWith('/');
      const isLink = line.endsWith('@');
      const name = line.replace(/[@*/=>|]$/, '');
      if (name === '.' || name === '..') continue;
      entries.push({
        name,
        isDirectory: isDir,
        isSymlink: isLink,
        size: 0,
        permissions: '',
        owner: '',
        group: '',
        modified: '',
      });
    }
    return entries;
  }
}

export function createDockerClient(node: { host: string; port: number; credentials: string }): DockerClient {
  return new DockerClient(node.host, node.port, node.credentials);
}
