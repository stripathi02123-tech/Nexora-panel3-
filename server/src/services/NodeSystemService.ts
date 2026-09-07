import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import dns from 'dns';
import net from 'net';
import { logger } from '../utils/logger';
import { classifyConnectionError } from '../utils/connectionErrors';

export interface NodeSystemAgent {
  id: string;
  host: string;
  port: number;
  secret: string;
}

export interface ResourceEntry {
  id: string;
  type: string;
  label: string;
  allocatedRamMB: number;
  allocatedCpuCores: number;
  pid: number | null;
  status: string;
  running?: boolean;
}

export interface AllocationStats {
  limits: { ramMB: number; cores: number };
  used: { ramMB: number; cores: number };
  available: { ramMB: number; cores: number };
  count: number;
}

export interface MetricsSnapshot {
  ts: number;
  cpu: { totalLoad: number; cores: number[] };
  memory: { totalMB: number; usedMB: number; freeMB: number; pct: number };
  disk: { fs: string; mount: string; sizeGB: number; usedGB: number; pct: number }[];
  network: { iface: string; rxKBs: number; txKBs: number }[];
}

function getBaseURL(agent: NodeSystemAgent): string {
  let host = String(agent.host || '').trim();
  if (!host) throw new Error('Node host is empty');

  if (!Number.isInteger(agent.port) || agent.port < 1 || agent.port > 65535) {
    throw new Error(`Invalid node port: ${agent.port}`);
  }

  host = host.replace(/\/+$/, '');
  let protocol = 'http:';

  if (/^https?:\/\//i.test(host)) {
    const parsed = new URL(host);
    // The Node Agent is a plain-HTTP service unless a TLS proxy is placed in
    // front of it. Silently attempting HTTPS against a plain-HTTP agent
    // produces a confusing TLS/connection-reset error that looks identical
    // to "node is down". Reject it explicitly instead.
    if (parsed.protocol === 'https:') {
      throw new Error(
        'Node host is configured with https:// but the Node Agent only supports plain HTTP. ' +
        'Use http:// (or a bare host/IP) unless you have placed a TLS-terminating proxy in front of the agent.'
      );
    }
    protocol = parsed.protocol;
    host = parsed.hostname;
    if (parsed.port && Number(parsed.port) !== agent.port) {
      throw new Error(`Node host URL port ${parsed.port} does not match configured port ${agent.port}`);
    }
  } else if (!host.startsWith('[') && (host.match(/:/g) || []).length === 1 && !net.isIPv6(host)) {
    // Bare "host:port" or "1.2.3.4:port" entered without a scheme — a common
    // copy/paste mistake. Split it out and validate against the configured
    // port instead of blindly concatenating, which previously produced
    // broken URLs like "http://1.2.3.4:4000:4000".
    const [bareHost, portStr] = host.split(':');
    const embeddedPort = Number(portStr);
    if (!bareHost) throw new Error('Node host is empty');
    if (!Number.isInteger(embeddedPort) || embeddedPort < 1 || embeddedPort > 65535) {
      throw new Error(`Node host "${agent.host}" has an invalid embedded port`);
    }
    if (embeddedPort !== agent.port) {
      throw new Error(`Node host embeds port ${embeddedPort}, which does not match the configured port ${agent.port}. Enter the host without a port, or make them match.`);
    }
    host = bareHost;
  }


  // URL.hostname strips IPv6 brackets, so add them back when needed.
  const urlHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `${protocol}//${urlHost}:${agent.port}`;
}

function authHeaders(agent: NodeSystemAgent) {
  if (!agent.secret || agent.secret.length < 32) throw new Error('Node secret is missing or invalid');
  return {
    'X-Node-Secret': agent.secret,
    'Content-Type': 'application/json',
  };
}

function client(agent: NodeSystemAgent): AxiosInstance {
  return axios.create({
    baseURL: getBaseURL(agent),
    headers: authHeaders(agent),
    timeout: 15_000,
    validateStatus: (status) => status >= 200 && status < 300,
  });
}

function getAxiosMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      const responseMessage = typeof error.response.data?.error === 'string'
        ? error.response.data.error
        : `HTTP ${error.response.status}`;
      return responseMessage;
    }
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'Node request timed out';
    if (error.code === 'ECONNREFUSED') return 'Connection refused';
    if (error.code === 'ENOTFOUND') return 'Node host could not be resolved';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unknown node communication error';
}

// Kept as a thin wrapper around the shared classifier (used by nodesystem.ts).
export function classifyNodeError(error: unknown): { code: string; message: string } {
  return classifyConnectionError(error);
}

async function request<T>(agent: NodeSystemAgent, operation: string, requestConfig: AxiosRequestConfig): Promise<T> {
  try {
    const res = await client(agent).request<T>(requestConfig);
    return res.data;
  } catch (error) {
    const message = getAxiosMessage(error);
    logger.error(`Node system ${operation} failed for node ${agent.id}: ${message}`);
    throw new Error(`Node ${agent.id}: ${message}`);
  }
}

export class NodeSystemService {
  static async health(agent: NodeSystemAgent): Promise<{ status: string; uptime: number; ts?: number; latencyMs: number }> {
    const start = Date.now();
    try {
      const res = await axios.get(`${getBaseURL(agent)}/health`, {
        timeout: 5_000,
        headers: authHeaders(agent),
        validateStatus: (status) => status >= 200 && status < 300,
      });
      const latencyMs = Date.now() - start;
      logger.info(`Node health check ok: id=${agent.id} host=${agent.host} port=${agent.port} stage=success latencyMs=${latencyMs}`);
      return { ...res.data, latencyMs };
    } catch (error) {
      const { code, message } = classifyNodeError(error);
      logger.warn(`Node health check failed: id=${agent.id} host=${agent.host} port=${agent.port} code=${code} error="${message}"`);
      throw new Error(`Node ${agent.id} health check failed: ${message}`);
    }
  }

  // Full server-side connection diagnostic: DNS -> TCP -> authenticated HTTP.
  // Runs FROM the Panel server, since browser reachability is not equivalent
  // to Panel-server reachability (NAT, container networking, firewalls).
  static async testConnection(agent: NodeSystemAgent): Promise<{
    online: boolean;
    latencyMs: number | null;
    stage: 'configuration' | 'dns' | 'tcp' | 'http' | 'authentication' | 'success';
    code: string;
    message: string;
  }> {
    const overallStart = Date.now();

    // Stage: configuration
    let baseURL: string;
    try {
      baseURL = getBaseURL(agent);
      authHeaders(agent); // validates secret length without leaking it
    } catch (error: any) {
      return { online: false, latencyMs: null, stage: 'configuration', code: 'CONFIG_ERROR', message: error.message };
    }

    const parsed = new URL(baseURL);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    const port = Number(parsed.port);

    // Stage: dns (skip for literal IPs)
    if (!net.isIP(hostname)) {
      try {
        await new Promise<void>((resolve, reject) => {
          dns.lookup(hostname, (err) => (err ? reject(err) : resolve()));
        });
      } catch {
        return { online: false, latencyMs: null, stage: 'dns', code: 'ENOTFOUND', message: 'Node host could not be resolved' };
      }
    }

    // Stage: tcp
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.createConnection({ host: hostname, port, timeout: 5_000 });
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('timeout', () => { socket.destroy(); reject(new Error('ETIMEDOUT')); });
        socket.once('error', (err) => { socket.destroy(); reject(err); });
      });
    } catch (error: any) {
      const code: string = error?.code || (error?.message === 'ETIMEDOUT' ? 'ETIMEDOUT' : 'UNKNOWN');
      const tcpMessages: Record<string, string> = {
        ECONNREFUSED: 'Connection refused by Node Agent',
        ETIMEDOUT: 'Node Agent connection timed out',
        EHOSTUNREACH: 'Node host is unreachable',
        ENETUNREACH: 'Node network is unreachable',
      };
      return { online: false, latencyMs: null, stage: 'tcp', code, message: tcpMessages[code] || 'Node Agent TCP connection failed' };
    }

    // Stage: http + authentication (single authenticated request, since /health
    // only proves the process is listening, not that it's a usable Node Agent).
    const httpStart = Date.now();
    try {
      await axios.get(`${baseURL}/health`, {
        timeout: 8_000,
        headers: authHeaders(agent),
        validateStatus: (status) => status >= 200 && status < 300,
      });
      const latencyMs = Date.now() - httpStart;
      return { online: true, latencyMs, stage: 'success', code: 'OK', message: 'Node Agent is reachable and authenticated' };
    } catch (error) {
      const latencyMs = Date.now() - httpStart;
      const { code, message } = classifyNodeError(error);
      const stage: 'http' | 'authentication' = (code === 'AUTH_FAILED' || code === 'AUTH_NOT_CONFIGURED') ? 'authentication' : 'http';
      return { online: false, latencyMs, stage, code, message };
    }
  }

  static async getAllocation(agent: NodeSystemAgent): Promise<AllocationStats> {
    return request(agent, 'get allocation', { method: 'GET', url: '/api/allocation' });
  }

  static async checkAllocation(agent: NodeSystemAgent, allocatedRamMB: number, allocatedCpuCores: number): Promise<{ ok: boolean; reason?: string; available?: unknown }> {
    if (!Number.isFinite(allocatedRamMB) || allocatedRamMB < 0 || !Number.isFinite(allocatedCpuCores) || allocatedCpuCores < 0) {
      throw new Error('Invalid allocation values');
    }
    return request(agent, 'check allocation', { method: 'POST', url: '/api/allocation/check', data: { allocatedRamMB, allocatedCpuCores } });
  }

  static async listResources(agent: NodeSystemAgent): Promise<{ stats: AllocationStats; servers: ResourceEntry[] }> {
    return request(agent, 'list resources', { method: 'GET', url: '/api/resources' });
  }

  static async registerResource(agent: NodeSystemAgent, data: { id?: string; type: string; label: string; allocatedRamMB: number; allocatedCpuCores: number }): Promise<{ entry: ResourceEntry }> {
    if (!data.type || !data.label || !Number.isFinite(data.allocatedRamMB) || data.allocatedRamMB < 0 || !Number.isFinite(data.allocatedCpuCores) || data.allocatedCpuCores < 0) {
      throw new Error('Invalid resource data');
    }
    return request(agent, 'register resource', { method: 'POST', url: '/api/resources', data });
  }

  static async updateResource(agent: NodeSystemAgent, id: string, data: { allocatedRamMB?: number; allocatedCpuCores?: number; label?: string }): Promise<{ entry: ResourceEntry }> {
    if (!id) throw new Error('Resource id is required');
    return request(agent, 'update resource', { method: 'PATCH', url: `/api/resources/${encodeURIComponent(id)}`, data });
  }

  static async deleteResource(agent: NodeSystemAgent, id: string): Promise<void> {
    await request(agent, 'delete resource', { method: 'DELETE', url: `/api/resources/${encodeURIComponent(id)}` });
  }

  static async startProcess(agent: NodeSystemAgent, id: string, processConfig: { command: string; args?: string[]; cwd?: string; env?: Record<string, string>; restartPolicy?: 'always' | 'never' }): Promise<{ pid: number; status: string }> {
    if (!id || !processConfig?.command || processConfig.command.length > 4096) throw new Error('Invalid process configuration');
    return request(agent, 'start process', { method: 'POST', url: `/api/processes/${encodeURIComponent(id)}/start`, data: processConfig });
  }

  static async stopProcess(agent: NodeSystemAgent, id: string, force = false): Promise<void> {
    await request(agent, 'stop process', { method: 'POST', url: `/api/processes/${encodeURIComponent(id)}/stop`, data: { force: Boolean(force) } });
  }

  static async sendInput(agent: NodeSystemAgent, id: string, text: string): Promise<void> {
    if (!id || text.length > 100_000) throw new Error('Invalid process input');
    await request(agent, 'send process input', { method: 'POST', url: `/api/processes/${encodeURIComponent(id)}/input`, data: { text } });
  }

  static async getProcessLogs(agent: NodeSystemAgent, id: string, lines = 100): Promise<{ logs: { ts: number; line: string }[] }> {
    const safeLines = Number.isFinite(lines) ? Math.min(Math.max(Math.floor(lines), 1), 5000) : 100;
    return request(agent, 'get process logs', { method: 'GET', url: `/api/processes/${encodeURIComponent(id)}/logs`, params: { lines: safeLines } });
  }

  static async getProcessStatus(agent: NodeSystemAgent, id: string): Promise<ResourceEntry & { running: boolean }> {
    return request(agent, 'get process status', { method: 'GET', url: `/api/processes/${encodeURIComponent(id)}/status` });
  }

  static async listRunningProcesses(agent: NodeSystemAgent): Promise<{ running: { id: string; pid: number }[] }> {
    return request(agent, 'list processes', { method: 'GET', url: '/api/processes' });
  }

  static async getMetrics(agent: NodeSystemAgent): Promise<MetricsSnapshot> {
    return request(agent, 'get metrics', { method: 'GET', url: '/api/metrics' });
  }

  static async getFreshMetrics(agent: NodeSystemAgent): Promise<MetricsSnapshot> {
    return request(agent, 'get fresh metrics', { method: 'GET', url: '/api/metrics/fresh' });
  }
}
