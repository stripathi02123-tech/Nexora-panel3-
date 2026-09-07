import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity, Terminal, Camera, HardDrive, Shield, BarChart3, Settings,
  Play, Square, RotateCcw, Trash2, Plus, RefreshCw,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '@/utils/api';
import StatusBadge from '@/components/ui/StatusBadge';
import ResourceBar from '@/components/ui/ResourceBar';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { Container, Metric, Snapshot, Backup, FirewallRule } from '@/types';
import { formatBytes, formatDate } from '@/utils/helpers';

type Tab = 'overview' | 'console' | 'snapshots' | 'backups' | 'firewall' | 'metrics' | 'settings';

const ContainerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [container, setContainer] = useState<Container | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchContainer = useCallback(async () => {
    try {
      const res = await api.get(`/containers/${id}`);
      setContainer(res.data.container || res.data);
    } catch { navigate('/containers'); } finally { setLoading(false); }
  }, [id, navigate]);

  const fetchTabData = useCallback(async () => {
    try {
      if (activeTab === 'metrics') {
        const res = await api.get(`/containers/${id}/metrics?limit=30`);
        setMetrics(Array.isArray(res.data) ? res.data : res.data.metrics || []);
      } else if (activeTab === 'snapshots') {
        const res = await api.get(`/containers/${id}/snapshots`);
        setSnapshots(Array.isArray(res.data) ? res.data : res.data.snapshots || []);
      } else if (activeTab === 'backups') {
        const res = await api.get(`/containers/${id}/backups`);
        setBackups(Array.isArray(res.data) ? res.data : res.data.backups || []);
      } else if (activeTab === 'firewall') {
        const res = await api.get(`/containers/${id}/firewall`);
        setRules(Array.isArray(res.data) ? res.data : res.data.rules || []);
      }
    } catch {}
  }, [id, activeTab]);

  useEffect(() => { fetchContainer(); }, [fetchContainer]);
  useEffect(() => { fetchTabData(); }, [fetchTabData]);

  const handleAction = async (action: string) => {
    setActionLoading(true);
    try {
      await api.post(`/containers/${id}/${action}`);
      toast.success(`Container ${action}ed`);
      fetchContainer();
    } catch {} finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/containers/${id}`);
      toast.success('Container deleted');
      navigate('/containers');
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
  if (!container) return null;

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
          <button onClick={() => navigate('/containers')} className="btn-ghost p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{container.name}</h1>
              <StatusBadge status={container.status} />
            </div>
            <p className="text-sm text-gray-500 mt-1">Created {formatDate(container.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {container.status === 'stopped' ? (
            <button onClick={() => handleAction('start')} disabled={actionLoading} className="btn-primary"><Play className="w-4 h-4" /> Start</button>
          ) : (
            <button onClick={() => handleAction('stop')} disabled={actionLoading} className="btn-secondary"><Square className="w-4 h-4" /> Stop</button>
          )}
          <button onClick={() => handleAction('restart')} disabled={actionLoading} className="btn-secondary"><RotateCcw className="w-4 h-4" /> Restart</button>
          <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger"><Trash2 className="w-4 h-4" /> Delete</button>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
              activeTab === tab.key ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-4">Resource Usage</h3>
                <ResourceBar label="CPU" used={container.cpu?.used || 0} total={container.cpu?.total || 1} unit="percent" />
                <div className="mt-3" />
                <ResourceBar label="RAM" used={container.ram?.used || 0} total={container.ram?.total || 1} unit="bytes" />
                <div className="mt-3" />
                <ResourceBar label="Disk" used={container.disk?.used || 0} total={container.disk?.total || 1} unit="bytes" />
              </div>
              {chartData.length > 0 && (
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold mb-4">Metrics</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="ccpu" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                          <linearGradient id="cram" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                        <YAxis stroke="#9ca3af" fontSize={12} />
                        <Tooltip />
                        <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#ccpu)" name="CPU %" />
                        <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#cram)" name="RAM %" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold mb-4">Details</h3>
              <dl className="space-y-3">
                <div className="flex justify-between"><dt className="text-sm text-gray-500">OS</dt><dd className="text-sm font-medium">{container.os || '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-sm text-gray-500">Template</dt><dd className="text-sm font-medium">{container.template || '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-sm text-gray-500">CPU</dt><dd className="text-sm font-medium">{container.cpu?.cores || 0} cores</dd></div>
                <div className="flex justify-between"><dt className="text-sm text-gray-500">RAM</dt><dd className="text-sm font-medium">{formatBytes(container.ram?.total || 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-sm text-gray-500">Disk</dt><dd className="text-sm font-medium">{formatBytes(container.disk?.total || 0)}</dd></div>
                <div className="flex justify-between"><dt className="text-sm text-gray-500">IP</dt><dd className="text-sm font-medium font-mono">{container.ipAddresses?.[0] || '-'}</dd></div>
              </dl>
            </div>
          </div>
        )}

        {activeTab === 'console' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Console</h3>
            {container.vncPort ? (
              <div className="bg-black rounded-lg p-4 text-green-400 font-mono text-sm h-96 overflow-y-auto">
                <p>VNC Console available on port {container.vncPort}</p>
              </div>
            ) : (
              <EmptyState icon={Terminal} title="Console not available" description="Start the container to access the console." />
            )}
          </div>
        )}

        {activeTab === 'snapshots' && (
          <EmptyState icon={Camera} title="Snapshots" description="Snapshot management coming soon." />
        )}

        {activeTab === 'backups' && (
          <EmptyState icon={HardDrive} title="Backups" description="Backup management coming soon." />
        )}

        {activeTab === 'firewall' && (
          <EmptyState icon={Shield} title="Firewall Rules" description="Firewall management coming soon." />
        )}

        {activeTab === 'metrics' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Performance Metrics</h3>
            {chartData.length === 0 ? (
              <EmptyState icon={BarChart3} title="No metrics available" />
            ) : (
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip />
                    <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#ccpu)" name="CPU %" />
                    <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#cram)" name="RAM %" />
                    <Area type="monotone" dataKey="disk" stroke="#f59e0b" fill="url(#cdisk)" name="Disk %" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Container Settings</h3>
            <p className="text-sm text-gray-500">Settings panel coming soon.</p>
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete}
        title="Delete Container" message={`Are you sure you want to delete "${container.name}"?`} confirmText="Delete" />
    </div>
  );
};

export default ContainerDetailPage;
