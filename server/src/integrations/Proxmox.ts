import axios, { AxiosInstance, AxiosError } from 'axios';
import https from 'https';
import { logger } from '../utils/logger';
import { decryptNodeSecret } from '../utils/helpers';
import { config } from '../config';
import { classifyConnectionError } from '../utils/connectionErrors';

interface ProxmoxNode {
  node: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  type: string;
  id: string;
}

interface ProxmoxVM {
  vmid: number;
  name: string;
  status: string;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  uptime: number;
  template?: number;
}

interface ProxmoxTicket {
  ticket: string;
  username: string;
  CSRFPreventionToken: string;
}

export class ProxmoxClient {
  private axios: AxiosInstance | null = null;
  private ticket: ProxmoxTicket | null = null;
  private host: string;
  private port: number;
  private credentials: { username: string; password?: string; token?: string };
  private authType: string;

  constructor(host: string, port: number, credentials: string, authType: string = 'password', encryptionKey: string = config.encryptionKey) {
    this.host = host;
    this.port = port;
    this.authType = authType;
    // Never lets a decrypt failure (e.g. ENCRYPTION_KEY changed after this
    // node was created) throw a raw, confusing crypto error, and never
    // treats undecryptable ciphertext as if it were the real credential.
    const decrypted = decryptNodeSecret(credentials, encryptionKey);
    if (authType === 'token') {
      const [username, token] = decrypted.split(':');
      this.credentials = { username, token };
    } else {
      const [username, password] = decrypted.split(':');
      this.credentials = { username, password };
    }
  }

  private getBaseUrl(): string {
    return `https://${this.host}:${this.port}/api2/json`;
  }

  private getAxios(): AxiosInstance {
    if (this.axios) return this.axios;
    this.axios = axios.create({
      baseURL: this.getBaseUrl(),
      timeout: config.proxmoxTimeout,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: { 'Content-Type': 'application/json' },
    });

    this.axios.interceptors.request.use((reqConfig) => {
      if (this.ticket) {
        reqConfig.headers.Cookie = `PVEAuthCookie=${this.ticket.ticket}`;
        if (this.ticket.CSRFPreventionToken) {
          reqConfig.headers.CSRFPreventionToken = this.ticket.CSRFPreventionToken;
        }
      }
      if (this.authType === 'token' && this.credentials.token) {
        reqConfig.headers.Authorization = `PVEAPIToken=${this.credentials.username}=${this.credentials.token}`;
      }
      return reqConfig;
    });

    this.axios.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401 && this.authType === 'password') {
          await this.authenticate();
          if (error.config) {
            const retryConfig = { ...error.config };
            if (this.ticket) {
              retryConfig.headers = {
                ...retryConfig.headers,
                Cookie: `PVEAuthCookie=${this.ticket.ticket}`,
                CSRFPreventionToken: this.ticket.CSRFPreventionToken,
              } as any;
            }
            return axios(retryConfig);
          }
        }
        throw error;
      }
    );

    return this.axios;
  }

  async connect(): Promise<boolean> {
    try {
      await this.getAxios().get('/version');
      logger.info(`Connected to Proxmox at ${this.host}:${this.port}`);
      return true;
    } catch (error) {
      // Previously this swallowed the real error and returned false, which
      // is why an unreachable/misconfigured Proxmox node showed a bare
      // "OFFLINE" with no diagnostic information. Log the classified reason
      // AND rethrow it so NodeService.checkHealth can capture and surface it.
      const { code, message } = classifyConnectionError(error);
      logger.warn(`Proxmox connect failed: host=${this.host} port=${this.port} code=${code} error="${message}"`);
      throw new Error(message);
    }
  }

  async authenticate(): Promise<void> {
    if (this.authType === 'token') return;
    try {
      const response = await axios.post(
        `https://${this.host}:${this.port}/api2/json/access/ticket`,
        { username: this.credentials.username, password: this.credentials.password },
        { httpsAgent: new https.Agent({ rejectUnauthorized: false }), timeout: config.proxmoxTimeout }
      );
      this.ticket = response.data.data;
      logger.info('Proxmox authentication successful');
    } catch (error) {
      logger.error('Proxmox authentication failed:', error);
      throw new Error('Proxmox authentication failed');
    }
  }

  private async get(path: string): Promise<any> {
    const response = await this.getAxios().get(path);
    return response.data.data;
  }

  async post(path: string, data?: any): Promise<any> {
    const response = await this.getAxios().post(path, data);
    return response.data.data;
  }

  async put(path: string, data?: any): Promise<any> {
    const response = await this.getAxios().put(path, data);
    return response.data.data;
  }

  async del(path: string): Promise<any> {
    const response = await this.getAxios().delete(path);
    return response.data.data;
  }

  async getNodes(): Promise<ProxmoxNode[]> {
    return this.get('/nodes');
  }

  async getNodeStatus(node: string): Promise<any> {
    return this.get(`/nodes/${node}/status`);
  }

  async getVMs(node: string): Promise<ProxmoxVM[]> {
    return this.get(`/nodes/${node}/qemu`);
  }

  async getVM(node: string, vmid: number): Promise<any> {
    return this.get(`/nodes/${node}/qemu/${vmid}`);
  }

  async createVM(node: string, config: any): Promise<any> {
    return this.post(`/nodes/${node}/qemu`, config);
  }

  async deleteVM(node: string, vmid: number): Promise<any> {
    return this.del(`/nodes/${node}/qemu/${vmid}`);
  }

  async startVM(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/status/start`);
  }

  async stopVM(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/status/stop`);
  }

  async restartVM(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/status/reboot`);
  }

  async shutdownVM(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/status/shutdown`);
  }

  async suspendVM(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/status/suspend`);
  }

  async resumeVM(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/status/resume`);
  }

  async getVMConfig(node: string, vmid: number): Promise<any> {
    return this.get(`/nodes/${node}/qemu/${vmid}/config`);
  }

  async setVMConfig(node: string, vmid: number, config: any): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/config`, config);
  }

  async getVMStatus(node: string, vmid: number): Promise<any> {
    return this.get(`/nodes/${node}/qemu/${vmid}/status/current`);
  }

  async getVMSnapshots(node: string, vmid: number): Promise<any[]> {
    return this.get(`/nodes/${node}/qemu/${vmid}/snapshot`);
  }

  async createVMSnapshot(node: string, vmid: number, name: string): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/snapshot`, { snapname: name });
  }

  async deleteVMSnapshot(node: string, vmid: number, name: string): Promise<any> {
    return this.del(`/nodes/${node}/qemu/${vmid}/snapshot/${name}`);
  }

  async rollbackVMSnapshot(node: string, vmid: number, name: string): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/snapshot/${name}/rollback`);
  }

  async getVMBackups(node: string, vmid: number): Promise<any[]> {
    return this.get(`/nodes/${node}/qemu/${vmid}/backup`);
  }

  async createVMBackup(node: string, vmid: number, storage?: string): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/backup`, { storage: storage || 'local' });
  }

  async migrateVM(node: string, vmid: number, target: string): Promise<any> {
    return this.post(`/nodes/${node}/qemu/${vmid}/migrate`, { target });
  }

  async getVMConsole(node: string, vmid: number): Promise<any> {
    return this.get(`/nodes/${node}/qemu/${vmid}/vncproxy`);
  }

  async getContainers(node: string): Promise<any[]> {
    return this.get(`/nodes/${node}/lxc`);
  }

  async getContainer(node: string, vmid: number): Promise<any> {
    return this.get(`/nodes/${node}/lxc/${vmid}`);
  }

  async createContainer(node: string, config: any): Promise<any> {
    return this.post(`/nodes/${node}/lxc`, config);
  }

  async deleteContainer(node: string, vmid: number): Promise<any> {
    return this.del(`/nodes/${node}/lxc/${vmid}`);
  }

  async startContainer(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/lxc/${vmid}/status/start`);
  }

  async stopContainer(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/lxc/${vmid}/status/stop`);
  }

  async restartContainer(node: string, vmid: number): Promise<any> {
    return this.post(`/nodes/${node}/lxc/${vmid}/status/reboot`);
  }

  async getContainerConfig(node: string, vmid: number): Promise<any> {
    return this.get(`/nodes/${node}/lxc/${vmid}/config`);
  }

  async setContainerConfig(node: string, vmid: number, config: any): Promise<any> {
    return this.post(`/nodes/${node}/lxc/${vmid}/config`, config);
  }

  async getTemplates(node: string, type: string = 'vztmpl'): Promise<any[]> {
    return this.get(`/nodes/${node}/storage/local/content`).then((content) =>
      content.filter((item: any) => item.content === type || item.template === 1)
    );
  }

  async getStorages(node: string): Promise<any[]> {
    return this.get(`/nodes/${node}/storage`);
  }

  async getStorageContent(node: string, storage: string): Promise<any[]> {
    return this.get(`/nodes/${node}/storage/${storage}/content`);
  }

  async getNodeMetrics(node: string): Promise<any> {
    const rrdData = await this.get(`/nodes/${node}/rrddata?timeframe=hour`);
    const status = await this.getNodeStatus(node);
    return { rrd: rrdData, status };
  }

  async getClusterStatus(): Promise<any> {
    return this.get('/cluster/status');
  }

  async getPools(): Promise<any[]> {
    return this.get('/pools');
  }

  async createPool(name: string): Promise<any> {
    return this.post('/pools', { poolid: name });
  }

  async deletePool(id: string): Promise<any> {
    return this.del(`/pools/${id}`);
  }

  async getUsers(): Promise<any[]> {
    return this.get('/access/users');
  }

  async createUser(config: any): Promise<any> {
    return this.post('/access/users', config);
  }

  async createTicket(username: string, password: string): Promise<any> {
    const response = await axios.post(
      `https://${this.host}:${this.port}/api2/json/access/ticket`,
      { username, password },
      { httpsAgent: new https.Agent({ rejectUnauthorized: false }), timeout: config.proxmoxTimeout }
    );
    return response.data.data;
  }
}

export function createProxmoxClient(node: { host: string; port: number; credentials: string; authType: string }): ProxmoxClient {
  return new ProxmoxClient(node.host, node.port, node.credentials, node.authType);
}
