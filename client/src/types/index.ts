export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  avatar?: string;
  isActive: boolean;
  twoFactorSecret?: string;
  twoFactorEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Node {
  id: string;
  name: string;
  host: string;
  port: number;
  type: string;
  authType: string;
  credentials?: string;
  status: string;
  region?: string;
  description?: string;
  storageTotal?: number;
  storageUsed?: number;
  ramTotal?: number;
  ramUsed?: number;
  cpuCores?: number;
  cpuUsage?: number;
  cpu?: { total: number; used: number };
  ram?: { total: number; used: number };
  disk?: { total: number; used: number };
  uptime?: number;
  version?: string;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    virtualMachines: number;
    containers: number;
    dockerContainers: number;
  };
}

export interface VirtualMachine {
  id: string;
  name: string;
  node: string | Node;
  user: string | User;
  status: 'running' | 'stopped' | 'error' | 'paused';
  type: 'qemu' | 'kvm';
  vmid: number;
  cpu: { cores: number; used: number; total: number };
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  diskSize: number;
  os: string;
  template: string;
  iso: string;
  ipAddresses: string[];
  macAddress: string;
  vncPort?: number;
  vncPassword?: string;
  snapshot: string[];
  backup: string[];
  firewallRules: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Container {
  id: string;
  name: string;
  node: string | Node;
  user: string | User;
  status: 'running' | 'stopped' | 'error' | 'paused';
  type: 'lxc' | 'docker';
  ctid: number;
  cpu: { cores: number; used: number; total: number };
  ram: { used: number; total: number };
  disk: { used: number; total: number };
  diskSize: number;
  os: string;
  template: string;
  ipAddresses: string[];
  macAddress: string;
  vncPort?: number;
  vncPassword?: string;
  snapshot: string[];
  backup: string[];
  firewallRules: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'exited' | 'paused' | 'created' | 'restarting';
  state: string;
  containerId?: string;
  nodeId?: string;
  node: string | Node;
  user: string | User;
  ports: { host: string; container: string; type: string }[];
  volumes: { name: string; path: string; driver: string }[];
  networks: string[];
  env: Record<string, string>;
  command: string;
  created: string;
  started: string;
  finished: string;
  restartPolicy: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  allocatedRamMB?: number;
  allocatedCpuCores?: number;
  platform: string;
  healthcheck: string;
  healthStatus: string;
  labels: Record<string, string>;
  mounts: { source: string; target: string; type: string }[];
  size: number;
  createdAt: string;
  updatedAt: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  imageId: string;
  created: string;
  size: number;
  virtualSize: number;
  node: string | Node;
  user: string | User;
  labels: Record<string, string>;
  os: string;
  architecture: string;
  dockerVersion: string;
  description: string;
  starCount: number;
  isOfficial: boolean;
  containers?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DockerCompose {
  id: string;
  name: string;
  yaml: string;
  node: string | Node;
  user: string | User;
  status: 'running' | 'stopped' | 'error' | 'partial';
  projectName: string;
  services: { name: string; status: string; image: string; ports: string[] }[];
  volumes: string[];
  networks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  price: number;
  interval?: string;
  popular?: boolean;
  vmCpuLimit?: number;
  vmRamLimit?: number;
  vmDiskLimit?: number;
  containerCpuLimit?: number;
  containerRamLimit?: number;
  containerDiskLimit?: number;
  dockerLimit?: number;
  bandwidthLimit?: number;
  backupLimit?: number;
  snapshotLimit?: number;
  features?: Record<string, number>;
  isActive: boolean;
  active?: boolean;
  createdAt: string;
}

export interface Subscription {
  id: string;
  user: string | User;
  plan: string | Plan;
  status: 'active' | 'cancelled' | 'expired' | 'pending';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  user: string | User;
  subscription: string | Subscription;
  number: string;
  status: 'paid' | 'unpaid' | 'overdue' | 'cancelled' | 'refunded';
  amount: number;
  currency: string;
  taxPercentage: number;
  taxAmount: number;
  total: number;
  periodStart: string;
  periodEnd: string;
  paidAt?: string;
  dueDate: string;
  items: { description: string; amount: number; quantity: number }[];
  description?: string;
  invoiceUrl?: string;
  pdfUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  id: string;
  name: string;
  vm: string | VirtualMachine;
  container: string | Container;
  node: string | Node;
  user: string | User;
  type: 'vm' | 'container';
  size: number;
  status: 'created' | 'creating' | 'failed' | 'deleting';
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Backup {
  id: string;
  name: string;
  vm: string | VirtualMachine;
  container: string | Container;
  node: string | Node;
  user: string | User;
  type: 'vm' | 'container';
  size: number;
  status: 'completed' | 'running' | 'failed' | 'pending';
  storage: string;
  mode: 'snapshot' | 'stop' | 'suspend';
  schedule?: string;
  retention?: number;
  compressed: boolean;
  encrypted: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FirewallRule {
  id: string;
  name: string;
  node: string | Node;
  user: string | User;
  vm: string | VirtualMachine;
  container: string | Container;
  direction: 'in' | 'out' | 'forward';
  action: 'accept' | 'drop' | 'reject';
  protocol: 'tcp' | 'udp' | 'icmp' | 'any';
  ports?: string;
  sourceIp?: string;
  destinationIp?: string;
  priority: number;
  enabled: boolean;
  log: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Network {
  id: string;
  name: string;
  node: string | Node;
  user: string | User;
  type: 'bridge' | 'nat' | 'host' | 'macvlan' | 'vlan';
  subnet: string;
  gateway: string;
  dns: string;
  vlanId?: number;
  mtu: number;
  dhcp: boolean;
  dhcpStart?: string;
  dhcpEnd?: string;
  status: 'active' | 'inactive' | 'error';
  interfaces: string[];
  cidr: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPAddress {
  id: string;
  address: string;
  type: 'ipv4' | 'ipv6';
  network: string | Network;
  node: string | Node;
  user: string | User;
  vm: string | VirtualMachine;
  container: string | Container;
  isPrimary: boolean;
  isPublic: boolean;
  ptr: string;
  macAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface SSHKey {
  id: string;
  name: string;
  publicKey: string;
  fingerprint: string;
  user: string | User;
  createdAt: string;
  updatedAt: string;
}

export interface Domain {
  id: string;
  name: string;
  user: string | User;
  registrar: string;
  autoRenew: boolean;
  expirationDate: string;
  nameservers: string[];
  status: 'active' | 'expired' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface DNSRecord {
  id: string;
  domain: string | Domain;
  type: 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SRV' | 'CAA';
  name: string;
  value: string;
  priority?: number;
  ttl: number;
  proxied: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Alert {
  id: string;
  name: string;
  node: string | Node;
  user: string | User;
  metric: string;
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration: number;
  notificationMethod: 'email' | 'webhook' | 'both';
  enabled: boolean;
  lastTriggered?: string;
  cooldown: number;
  createdAt: string;
  updatedAt: string;
}

export interface Webhook {
  id: string;
  name: string;
  url: string;
  user: string | User;
  events: string[];
  secret?: string;
  enabled: boolean;
  active?: boolean;
  retryCount: number;
  lastTriggered?: string;
  lastResponse?: number;
  contentType: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix?: string;
  user: string | User;
  lastUsed?: string;
  expiresAt?: string;
  permissions: string[];
  ipWhitelist: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  user: string | User;
  action: string;
  resource: string;
  resourceType?: string;
  resourceId: string;
  details?: Record<string, any>;
  ip: string;
  userAgent: string;
  status: 'success' | 'failure' | 'pending';
  createdAt: string;
}

export interface Metric {
  id: string;
  node: string | Node;
  vm: string | VirtualMachine;
  container: string | Container;
  timestamp: string;
  cpu: { percent: number; load1: number; load5: number; load15: number };
  ram: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number };
  network: { rxBytes: number; txBytes: number; rxSpeed: number; txSpeed: number };
  diskIO: { readSpeed: number; writeSpeed: number; iops: number };
  uptime: number;
  processes: number;
  temperature?: number;
}

export interface Activity {
  id: string;
  user: string | User;
  action: string;
  resource: string;
  resourceId: string;
  resourceName: string;
  details?: string;
  ip: string;
  createdAt: string;
}
