import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Square, RotateCcw, Terminal } from 'lucide-react';
import api from '@/utils/api';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { Container } from '@/types';
import { formatBytes } from '@/utils/helpers';

const ContainersPage: React.FC = () => {
  const navigate = useNavigate();
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const fetch = async () => {
    try {
      const res = await api.get('/containers');
      setContainers(Array.isArray(res.data) ? res.data : res.data.containers || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      await api.post(`/containers/${id}/${action}`);
      toast.success(`Container ${action}ed`);
      fetch();
    } catch {}
  };

  const filtered = statusFilter === 'all' ? containers : containers.filter((c) => c.status === statusFilter);

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true, searchable: true,
      render: (c: Container) => (
        <span className="font-medium text-gray-900 dark:text-white hover:text-primary-600 cursor-pointer"
          onClick={() => navigate(`/containers/${c.id}`)}>{c.name}</span>
      )
    },
    { key: 'status', header: 'Status', render: (c: Container) => <StatusBadge status={c.status} /> },
    { key: 'ipAddresses', header: 'IP Address', render: (c: Container) => <span className="text-xs font-mono">{c.ipAddresses?.[0] || '-'}</span> },
    { key: 'cpu', header: 'CPU', render: (c: Container) => `${c.cpu?.cores || 0} cores` },
    { key: 'ram', header: 'RAM', render: (c: Container) => formatBytes(c.ram?.total || 0) },
    { key: 'disk', header: 'Disk', render: (c: Container) => formatBytes(c.disk?.total || 0) },
    { key: 'os', header: 'OS', render: (c: Container) => <span className="text-xs">{c.os || '-'}</span> },
    {
      key: 'actions', header: 'Actions',
      render: (c: Container) => (
        <div className="flex gap-1">
          {c.status === 'stopped' ? (
            <button onClick={() => handleAction(c.id, 'start')} className="btn-ghost p-1"><Play className="w-4 h-4 text-green-500" /></button>
          ) : (
            <button onClick={() => handleAction(c.id, 'stop')} className="btn-ghost p-1"><Square className="w-4 h-4 text-red-500" /></button>
          )}
          <button onClick={() => handleAction(c.id, 'restart')} className="btn-ghost p-1"><RotateCcw className="w-4 h-4 text-yellow-500" /></button>
          <button onClick={() => navigate(`/containers/${c.id}`)} className="btn-ghost p-1"><Terminal className="w-4 h-4 text-blue-500" /></button>
        </div>
      )
    },
  ];

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Containers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage LXC containers</p>
        </div>
        <button onClick={() => navigate('/containers/new')} className="btn-primary">
          <Plus className="w-4 h-4" /> Create Container
        </button>
      </div>

      <div className="flex items-center gap-2">
        {['all', 'running', 'stopped', 'error', 'paused'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
              statusFilter === s ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}>{s}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Terminal} title="No containers" description="Create your first container to get started."
          action={{ label: 'Create Container', onClick: () => navigate('/containers/new') }} />
      ) : (
        <DataTable columns={columns} data={filtered} keyExtractor={(item: Container) => item.id} />
      )}
    </div>
  );
};

export default ContainersPage;
