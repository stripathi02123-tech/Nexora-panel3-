import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, Square, RotateCcw, Terminal, Monitor } from 'lucide-react';
import api from '@/utils/api';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { VirtualMachine } from '@/types';
import { formatBytes } from '@/utils/helpers';

const VMsPage: React.FC = () => {
  const navigate = useNavigate();
  const [vms, setVms] = useState<VirtualMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchVMs = async () => {
    try {
      const res = await api.get('/vms');
      setVms(Array.isArray(res.data) ? res.data : res.data.vms || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchVMs(); }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      await api.post(`/vms/${id}/${action}`);
      toast.success(`VM ${action}ed successfully`);
      fetchVMs();
    } catch {}
  };

  const filtered = statusFilter === 'all' ? vms : vms.filter((vm) => vm.status === statusFilter);

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true, searchable: true,
      render: (vm: VirtualMachine) => (
        <span className="font-medium text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer"
          onClick={() => navigate(`/vms/${vm.id}`)}>{vm.name}</span>
      )
    },
    { key: 'status', header: 'Status', sortable: true,
      render: (vm: VirtualMachine) => <StatusBadge status={vm.status} />
    },
    { key: 'ipAddresses', header: 'IP Address', searchable: true,
      render: (vm: VirtualMachine) => (
        <span className="text-xs font-mono">{vm.ipAddresses?.[0] || '-'}</span>
      )
    },
    {
      key: 'cpu', header: 'CPU', sortable: true,
      render: (vm: VirtualMachine) => `${vm.cpu?.cores || 0} cores`
    },
    {
      key: 'ram', header: 'RAM', sortable: true,
      render: (vm: VirtualMachine) => formatBytes(vm.ram?.total || 0)
    },
    {
      key: 'disk', header: 'Disk', sortable: true,
      render: (vm: VirtualMachine) => formatBytes(vm.disk?.total || 0)
    },
    {
      key: 'os', header: 'OS', searchable: true,
      render: (vm: VirtualMachine) => (
        <span className="text-xs">{vm.os || '-'}</span>
      )
    },
    {
      key: 'actions', header: 'Actions',
      render: (vm: VirtualMachine) => (
        <div className="flex items-center gap-1">
          {vm.status === 'stopped' ? (
            <button onClick={() => handleAction(vm.id, 'start')} className="btn-ghost p-1" title="Start">
              <Play className="w-4 h-4 text-green-500" />
            </button>
          ) : (
            <button onClick={() => handleAction(vm.id, 'stop')} className="btn-ghost p-1" title="Stop">
              <Square className="w-4 h-4 text-red-500" />
            </button>
          )}
          <button onClick={() => handleAction(vm.id, 'restart')} className="btn-ghost p-1" title="Restart">
            <RotateCcw className="w-4 h-4 text-yellow-500" />
          </button>
          <button onClick={() => navigate(`/vms/${vm.id}`)} className="btn-ghost p-1" title="Details">
            <Terminal className="w-4 h-4 text-blue-500" />
          </button>
        </div>
      )
    },
  ];

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Virtual Machines</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your virtual machines</p>
        </div>
        <button onClick={() => navigate('/vms/new')} className="btn-primary">
          <Plus className="w-4 h-4" />
          Create VM
        </button>
      </div>

      <div className="flex items-center gap-2">
        {['all', 'running', 'stopped', 'error', 'paused'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              statusFilter === s
                ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Monitor}
          title="No virtual machines"
          description="Create your first virtual machine to get started."
          action={{ label: 'Create VM', onClick: () => navigate('/vms/new') }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(item: VirtualMachine) => item.id}
          onRowClick={(vm) => navigate(`/vms/${vm.id}`)}
        />
      )}
    </div>
  );
};

export default VMsPage;
