import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity, Terminal, Camera, HardDrive, Shield, BarChart3, Settings,
  Play, Square, RotateCcw, Trash2, Plus, Download, Upload, RefreshCw,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import api from '@/utils/api';
import StatusBadge from '@/components/ui/StatusBadge';
import ResourceBar from '@/components/ui/ResourceBar';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable from '@/components/ui/DataTable';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import { VirtualMachine, Snapshot, Backup, FirewallRule, Metric } from '@/types';
import { formatBytes, formatDate, formatRelativeTime } from '@/utils/helpers';

type Tab = 'overview' | 'console' | 'snapshots' | 'backups' | 'firewall' | 'metrics' | 'settings';

const VMDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vm, setVm] = useState<VirtualMachine | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [snapshotName, setSnapshotName] = useState('');
  const [backupForm, setBackupForm] = useState({ name: '', storage: 'local', mode: 'snapshot' as 'snapshot' | 'stop' | 'suspend' });
  const [ruleForm, setRuleForm] = useState({ name: '', direction: 'in', action: 'accept', protocol: 'tcp', ports: '', sourceIp: '', priority: 100, enabled: true });
  const [editForm, setEditForm] = useState({ name: '', cpuCores: 0, ram: 0, disk: 0 });
  const [actionLoading, setActionLoading] = useState(false);

  const fetchVM = useCallback(async () => {
    try {
      const res = await api.get(`/vms/${id}`);
      const data = res.data.vm || res.data;
      setVm(data);
      setEditForm({ name: data.name || '', cpuCores: data.cpu?.cores || 0, ram: data.ram?.total || 0, disk: data.disk?.total || 0 });
    } catch {
      navigate('/vms');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchTabData = useCallback(async () => {
    try {
      if (activeTab === 'snapshots') {
        const res = await api.get(`/vms/${id}/snapshots`);
        setSnapshots(Array.isArray(res.data) ? res.data : res.data.snapshots || []);
      } else if (activeTab === 'backups') {
        const res = await api.get(`/vms/${id}/backups`);
        setBackups(Array.isArray(res.data) ? res.data : res.data.backups || []);
      } else if (activeTab === 'firewall') {
        const res = await api.get(`/vms/${id}/firewall`);
        setRules(Array.isArray(res.data) ? res.data : res.data.rules || []);
      } else if (activeTab === 'metrics') {
        const res = await api.get(`/vms/${id}/metrics?limit=30`);
        setMetrics(Array.isArray(res.data) ? res.data : res.data.metrics || []);
      }
    } catch {}
  }, [id, activeTab]);

  useEffect(() => { fetchVM(); }, [fetchVM]);
  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const handleAction = async (action: string) => {
    setActionLoading(true);
    try {
      await api.post(`/vms/${id}/${action}`);
      toast.success(`VM ${action}ed successfully`);
      fetchVM();
    } catch {} finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/vms/${id}`);
      toast.success('VM deleted');
      navigate('/vms');
    } catch {}
  };

  const handleCreateSnapshot = async () => {
    try {
      await api.post(`/vms/${id}/snapshots`, { name: snapshotName });
      toast.success('Snapshot created');
      setShowSnapshotModal(false);
      setSnapshotName('');
      fetchTabData();
    } catch {}
  };

  const handleCreateBackup = async () => {
    try {
      await api.post(`/vms/${id}/backups`, backupForm);
      toast.success('Backup created');
      setShowBackupModal(false);
      setBackupForm({ name: '', storage: 'local', mode: 'snapshot' });
      fetchTabData();
    } catch {}
  };

  const handleCreateRule = async () => {
    try {
      await api.post(`/vms/${id}/firewall`, ruleForm);
      toast.success('Rule created');
      setShowRuleModal(false);
      setRuleForm({ name: '', direction: 'in', action: 'accept', protocol: 'tcp', ports: '', sourceIp: '', priority: 100, enabled: true });
      fetchTabData();
    } catch {}
  };

  const handleEdit = async () => {
    try {
      await api.put(`/vms/${id}`, editForm);
      toast.success('VM updated');
      setShowEditModal(false);
      fetchVM();
    } catch {}
  };

  const handleRestoreSnapshot = async (snapId: string) => {
    try {
      await api.post(`/vms/${id}/snapshots/${snapId}/restore`);
      toast.success('Snapshot restored');
    } catch {}
  };

  const handleRestoreBackup = async (backupId: string) => {
    try {
      await api.post(`/vms/${id}/backups/${backupId}/restore`);
      toast.success('Backup restored');
    } catch {}
  };

  const handleDeleteSnapshot = async (snapId: string) => {
    try {
      await api.delete(`/vms/${id}/snapshots/${snapId}`);
      toast.success('Snapshot deleted');
      fetchTabData();
    } catch {}
  };

  const handleDeleteBackup = async (backupId: string) => {
    try {
      await api.delete(`/vms/${id}/backups/${backupId}`);
      toast.success('Backup deleted');
      fetchTabData();
    } catch {}
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await api.delete(`/vms/${id}/firewall/${ruleId}`);
      toast.success('Rule deleted');
      fetchTabData();
    } catch {}
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { key: 'console', label: 'Console', icon: <Terminal className="w-4 h-4" /> },
    { key: 'snapshots', label: 'Snapshots', icon: <Camera className="w-4 h-4" /> },
    { key: 'backups', label: 'Backups', icon: <HardDrive className="w-4 h-4" /> },
    { key: 'firewall', label: 'Firewall', icon: <Shield className="w-4 h-4" /> },
    { key: 'metrics', label: 'Metrics', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  if (!vm) return null;

  const chartData = metrics.map((m) => ({
    time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '',
    cpu: m.cpu?.percent || 0,
    ram: m.ram?.percent || 0,
    disk: m.disk?.percent || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/vms')} className="btn-ghost p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{vm.name}</h1>
              <StatusBadge status={vm.status} />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">VM ID: {vm.id} | Created {formatDate(vm.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {vm.status === 'stopped' ? (
            <button onClick={() => handleAction('start')} disabled={actionLoading} className="btn-primary">
              <Play className="w-4 h-4" /> Start
            </button>
          ) : (
            <button onClick={() => handleAction('stop')} disabled={actionLoading} className="btn-secondary">
              <Square className="w-4 h-4" /> Stop
            </button>
          )}
          <button onClick={() => handleAction('restart')} disabled={actionLoading} className="btn-secondary">
            <RotateCcw className="w-4 h-4" /> Restart
          </button>
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Resource Usage</h3>
                <ResourceBar label="CPU" used={vm.cpu?.used || 0} total={vm.cpu?.total || 1} unit="percent" />
                <div className="mt-3" />
                <ResourceBar label="RAM" used={vm.ram?.used || 0} total={vm.ram?.total || 1} unit="bytes" />
                <div className="mt-3" />
                <ResourceBar label="Disk" used={vm.disk?.used || 0} total={vm.disk?.total || 1} unit="bytes" />
              </div>
              {chartData.length > 0 && (
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Metrics</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="vcpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                          <linearGradient id="vram" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} />
                        <Tooltip />
                        <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#vcpu)" name="CPU %" />
                        <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#vram)" name="RAM %" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-6">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Details</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">OS</dt><dd className="text-sm font-medium">{vm.os || '-'}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">Template</dt><dd className="text-sm font-medium">{vm.template || '-'}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">CPU</dt><dd className="text-sm font-medium">{vm.cpu?.cores || 0} cores</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">RAM</dt><dd className="text-sm font-medium">{formatBytes(vm.ram?.total || 0)}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">Disk</dt><dd className="text-sm font-medium">{formatBytes(vm.disk?.total || 0)}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">IP Address</dt><dd className="text-sm font-medium font-mono">{vm.ipAddresses?.[0] || '-'}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">MAC Address</dt><dd className="text-sm font-medium font-mono">{vm.macAddress || '-'}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">Type</dt><dd className="text-sm font-medium uppercase">{vm.type}</dd></div>
                  <div className="flex justify-between"><dt className="text-sm text-gray-500">Tags</dt><dd className="text-sm font-medium">{vm.tags?.join(', ') || '-'}</dd></div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Console</h3>
            {vm.vncPort ? (
              <div className="bg-black rounded-lg p-4 text-green-400 font-mono text-sm h-96 overflow-y-auto">
                <p>VNC Console available on port {vm.vncPort}</p>
                <p>Password: {vm.vncPassword || 'Not set'}</p>
                <p className="mt-4 text-gray-500">Click "Open Console" to launch the VNC client.</p>
              </div>
            ) : (
              <EmptyState icon={Terminal} title="Console not available" description="Start the VM to access the console." />
            )}
          </div>
        )}

        {activeTab === 'snapshots' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowSnapshotModal(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Create Snapshot
              </button>
            </div>
            {snapshots.length === 0 ? (
              <EmptyState icon={Camera} title="No snapshots" description="Create a snapshot to save the current state." />
            ) : (
              <DataTable
                columns={[
                  { key: 'name', header: 'Name', sortable: true, searchable: true, render: (s: Snapshot) => s.name },
                  { key: 'size', header: 'Size', sortable: true, render: (s: Snapshot) => formatBytes(s.size) },
                  { key: 'status', header: 'Status', render: (s: Snapshot) => <StatusBadge status={s.status} /> },
                  { key: 'createdAt', header: 'Created', sortable: true, render: (s: Snapshot) => formatDate(s.createdAt) },
                  { key: 'actions', header: 'Actions',
                    render: (s: Snapshot) => (
                      <div className="flex gap-1">
                        <button onClick={() => handleRestoreSnapshot(s.id)} className="btn-ghost p-1" title="Restore"><RefreshCw className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteSnapshot(s.id)} className="btn-ghost p-1 text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )
                  },
                ]}
                data={snapshots}
                keyExtractor={(item: Snapshot) => item.id}
              />
            )}
          </div>
        )}

        {activeTab === 'backups' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowBackupModal(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Create Backup
              </button>
            </div>
            {backups.length === 0 ? (
              <EmptyState icon={HardDrive} title="No backups" description="Create a backup to protect your data." />
            ) : (
              <DataTable
                columns={[
                  { key: 'name', header: 'Name', sortable: true, searchable: true, render: (b: Backup) => b.name },
                  { key: 'size', header: 'Size', sortable: true, render: (b: Backup) => formatBytes(b.size) },
                  { key: 'status', header: 'Status', render: (b: Backup) => <StatusBadge status={b.status} /> },
                  { key: 'createdAt', header: 'Created', sortable: true, render: (b: Backup) => formatDate(b.createdAt) },
                  { key: 'actions', header: 'Actions',
                    render: (b: Backup) => (
                      <div className="flex gap-1">
                        <button onClick={() => handleRestoreBackup(b.id)} className="btn-ghost p-1" title="Restore"><RefreshCw className="w-4 h-4" /></button>
                        <button onClick={() => handleDeleteBackup(b.id)} className="btn-ghost p-1 text-red-500" title="Delete"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )
                  },
                ]}
                data={backups}
                keyExtractor={(item: Backup) => item.id}
              />
            )}
          </div>
        )}

        {activeTab === 'firewall' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setShowRuleModal(true)} className="btn-primary">
                <Plus className="w-4 h-4" /> Add Rule
              </button>
            </div>
            {rules.length === 0 ? (
              <EmptyState icon={Shield} title="No firewall rules" description="Add rules to control network traffic." />
            ) : (
              <DataTable
                columns={[
                  { key: 'name', header: 'Name', sortable: true, searchable: true, render: (r: FirewallRule) => r.name },
                  { key: 'direction', header: 'Direction', render: (r: FirewallRule) => <StatusBadge status={r.direction} /> },
                  { key: 'action', header: 'Action', render: (r: FirewallRule) => <StatusBadge status={r.action} /> },
                  { key: 'protocol', header: 'Protocol', render: (r: FirewallRule) => r.protocol.toUpperCase() },
                  { key: 'ports', header: 'Ports', render: (r: FirewallRule) => r.ports || '*' },
                  { key: 'enabled', header: 'Enabled', render: (r: FirewallRule) => r.enabled ? 'Yes' : 'No' },
                  { key: 'actions', header: 'Actions',
                    render: (r: FirewallRule) => (
                      <button onClick={() => handleDeleteRule(r.id)} className="btn-ghost p-1 text-red-500"><Trash2 className="w-4 h-4" /></button>
                    )
                  },
                ]}
                data={rules}
                keyExtractor={(item: FirewallRule) => item.id}
              />
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Performance Metrics</h3>
            {chartData.length === 0 ? (
              <EmptyState icon={BarChart3} title="No metrics available" />
            ) : (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip />
                    <Line type="monotone" dataKey="cpu" stroke="#6366f1" name="CPU %" />
                    <Line type="monotone" dataKey="ram" stroke="#10b981" name="RAM %" />
                    <Line type="monotone" dataKey="disk" stroke="#f59e0b" name="Disk %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">VM Settings</h3>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="label-field">Name</label>
                <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="label-field">CPU Cores</label>
                <input type="number" value={editForm.cpuCores} onChange={(e) => setEditForm((f) => ({ ...f, cpuCores: parseInt(e.target.value) || 0 }))} className="input-field" />
              </div>
              <div>
                <label className="label-field">RAM (MB)</label>
                <input type="number" value={editForm.ram} onChange={(e) => setEditForm((f) => ({ ...f, ram: parseInt(e.target.value) || 0 }))} className="input-field" />
              </div>
              <div>
                <label className="label-field">Disk (GB)</label>
                <input type="number" value={editForm.disk} onChange={(e) => setEditForm((f) => ({ ...f, disk: parseInt(e.target.value) || 0 }))} className="input-field" />
              </div>
              <button onClick={handleEdit} className="btn-primary">Save Changes</button>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showSnapshotModal} onClose={() => setShowSnapshotModal(false)} title="Create Snapshot" size="sm">
        <div className="space-y-4">
          <div>
            <label className="label-field">Snapshot Name</label>
            <input type="text" value={snapshotName} onChange={(e) => setSnapshotName(e.target.value)} className="input-field" placeholder="e.g. Before Update" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowSnapshotModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreateSnapshot} className="btn-primary">Create</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showBackupModal} onClose={() => setShowBackupModal(false)} title="Create Backup" size="md">
        <div className="space-y-4">
          <div>
            <label className="label-field">Backup Name</label>
            <input type="text" value={backupForm.name} onChange={(e) => setBackupForm((f) => ({ ...f, name: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="label-field">Storage</label>
            <select value={backupForm.storage} onChange={(e) => setBackupForm((f) => ({ ...f, storage: e.target.value }))} className="input-field">
              <option value="local">Local</option>
              <option value="nfs">NFS</option>
              <option value="s3">S3</option>
            </select>
          </div>
          <div>
            <label className="label-field">Mode</label>
            <div className="flex gap-2">
              {(['snapshot', 'stop', 'suspend'] as const).map((m) => (
                <button key={m} onClick={() => setBackupForm((f) => ({ ...f, mode: m }))}
                  className={`px-3 py-1.5 rounded-lg text-sm capitalize ${backupForm.mode === m ? 'bg-primary-50 text-primary-600 border border-primary-300' : 'bg-gray-100 dark:bg-gray-700'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowBackupModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreateBackup} className="btn-primary">Create Backup</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showRuleModal} onClose={() => setShowRuleModal(false)} title="Add Firewall Rule" size="md">
        <div className="space-y-4">
          <div>
            <label className="label-field">Name</label>
            <input type="text" value={ruleForm.name} onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))} className="input-field" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Direction</label>
              <select value={ruleForm.direction} onChange={(e) => setRuleForm((f) => ({ ...f, direction: e.target.value }))} className="input-field">
                <option value="in">Inbound</option>
                <option value="out">Outbound</option>
              </select>
            </div>
            <div>
              <label className="label-field">Action</label>
              <select value={ruleForm.action} onChange={(e) => setRuleForm((f) => ({ ...f, action: e.target.value }))} className="input-field">
                <option value="accept">Accept</option>
                <option value="drop">Drop</option>
                <option value="reject">Reject</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Protocol</label>
              <select value={ruleForm.protocol} onChange={(e) => setRuleForm((f) => ({ ...f, protocol: e.target.value }))} className="input-field">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP</option>
                <option value="any">Any</option>
              </select>
            </div>
            <div>
              <label className="label-field">Ports</label>
              <input type="text" value={ruleForm.ports} onChange={(e) => setRuleForm((f) => ({ ...f, ports: e.target.value }))} className="input-field" placeholder="80,443 or 1-1000" />
            </div>
          </div>
          <div>
            <label className="label-field">Source IP</label>
            <input type="text" value={ruleForm.sourceIp} onChange={(e) => setRuleForm((f) => ({ ...f, sourceIp: e.target.value }))} className="input-field" placeholder="0.0.0.0/0" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowRuleModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleCreateRule} className="btn-primary">Add Rule</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit VM" size="md">
        <div className="space-y-4 max-w-md">
          <div>
            <label className="label-field">Name</label>
            <input type="text" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="label-field">CPU Cores</label>
            <input type="number" value={editForm.cpuCores} onChange={(e) => setEditForm((f) => ({ ...f, cpuCores: parseInt(e.target.value) || 0 }))} className="input-field" />
          </div>
          <div>
            <label className="label-field">RAM (MB)</label>
            <input type="number" value={editForm.ram} onChange={(e) => setEditForm((f) => ({ ...f, ram: parseInt(e.target.value) || 0 }))} className="input-field" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleEdit} className="btn-primary">Save</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete VM"
        message={`Are you sure you want to delete "${vm.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
};

export default VMDetailPage;
