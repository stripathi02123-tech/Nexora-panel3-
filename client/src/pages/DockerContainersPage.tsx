import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Play, Square, RotateCcw, Trash2, Terminal, FileText, Container, Plus, X, Cpu, HardDrive, Server, Globe, Shield } from 'lucide-react';
import api from '@/utils/api';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';
import { DockerContainer } from '@/types';
import { formatRelativeTime } from '@/utils/helpers';

const OS_IMAGES = new Set(['ubuntu:latest', 'alpine:latest']);
const POPULAR_IMAGES = [
  { name: 'Ubuntu', image: 'ubuntu:latest', desc: 'Latest Ubuntu LTS', cmd: 'sleep infinity' },
  { name: 'Nginx', image: 'nginx:alpine', desc: 'Web server' },
  { name: 'Redis', image: 'redis:alpine', desc: 'In-memory cache' },
  { name: 'PostgreSQL', image: 'postgres:16-alpine', desc: 'Relational database' },
  { name: 'MySQL', image: 'mysql:8.4', desc: 'Relational database' },
  { name: 'Alpine', image: 'alpine:latest', desc: 'Minimal Linux', cmd: 'sleep infinity' },
  { name: 'Node.js', image: 'node:22-alpine', desc: 'Node.js runtime' },
  { name: 'Python', image: 'python:3.12-slim', desc: 'Python runtime' },
  { name: 'MongoDB', image: 'mongo:7', desc: 'NoSQL database' },
  { name: 'Mariadb', image: 'mariadb:lts', desc: 'Database server' },
];

const VDS_IMAGES = [
  { name: 'Webtop Ubuntu', image: 'linuxserver/webtop', desc: 'Ubuntu KDE desktop + RDP + web access' },
  { name: 'Ubuntu XFCE', image: 'danielguerra/ubuntu-xrdp', desc: 'Ubuntu with XFCE + xrdp' },
];

const DockerContainersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ image: '', name: '', ports: '', cmd: '', allocatedRamMB: '', allocatedCpuCores: '', type: 'vps' });
  const [creating, setCreating] = useState(false);

  const fetch = async () => {
    try {
      const res = await api.get('/docker/containers');
      setContainers(Array.isArray(res.data) ? res.data : res.data.containers || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const typeParam = params.get('type');
    if (typeParam === 'vds' || typeParam === 'vps') {
      setTypeFilter(typeParam);
    }
    if (location.pathname.endsWith('/new')) {
      setShowCreate(true);
      navigate('/docker/containers', { replace: true });
    }
  }, [location.pathname, location.search]);

  const handleAction = async (id: string, action: string) => {
    try {
      await api.post(`/docker/containers/${id}/${action}`);
      toast.success(`Container ${action}ed`);
      fetch();
    } catch {}
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/docker/containers/${deleteId}`);
      toast.success('Container removed');
      setDeleteId(null);
      fetch();
    } catch {}
  };

  const handleCreate = async () => {
    const image = createForm.image.trim();
    if (!image) { toast.error('Image name is required'); return; }
    setCreating(true);
    try {
      const payload: any = { image, type: createForm.type };
      if (createForm.name.trim()) payload.name = createForm.name.trim();
      if (createForm.ports.trim()) payload.ports = createForm.ports.trim();
      if (createForm.cmd.trim()) payload.cmd = createForm.cmd.trim();
      if (createForm.allocatedRamMB.trim()) payload.allocatedRamMB = createForm.allocatedRamMB.trim();
      if (createForm.allocatedCpuCores.trim()) payload.allocatedCpuCores = createForm.allocatedCpuCores.trim();
      await api.post('/docker/containers', payload);
      toast.success(createForm.type === 'vds' ? 'VDS created' : 'Container created');
      setShowCreate(false);
      setCreateForm({ image: '', name: '', ports: '', cmd: '', allocatedRamMB: '', allocatedCpuCores: '', type: 'vps' });
      fetch();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create');
    } finally { setCreating(false); }
  };

  const selectImage = (img: typeof POPULAR_IMAGES[0] | typeof VDS_IMAGES[0]) => {
    const isVds = VDS_IMAGES.some((v) => v.image === img.image);
    setCreateForm((prev) => ({ ...prev, image: img.image, cmd: (img as any).cmd || '', type: isVds ? 'vds' : 'vps' }));
  };

  const iconFor = (val: string) => val ? <span className="text-xs font-mono">{val}</span> : '-';

  const filtered = statusFilter === 'all' ? containers : containers.filter((c) => c.status === statusFilter);
  const typeFiltered = typeFilter === 'all' ? filtered : filtered.filter((c) => (c as any).type === typeFilter);

  const columns = [
    {
      key: 'name', header: 'Name', sortable: true, searchable: true,
      render: (c: any) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white hover:text-primary-600 cursor-pointer"
            onClick={() => navigate(`/docker/containers/${c.id}`)}>{c.name}</span>
          {c.type === 'vds' && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
              VDS
            </span>
          )}
        </div>
      )
    },
    { key: 'image', header: 'Image', sortable: true, searchable: true, render: (c: DockerContainer) => <span className="text-xs font-mono">{c.image}</span> },
    { key: 'status', header: 'Status', render: (c: DockerContainer) => <StatusBadge status={c.status} /> },
    { key: 'state', header: 'State', render: (c: DockerContainer) => <span className="text-xs">{c.state || '-'}</span> },
    { key: 'ports', header: 'Ports', render: (c: DockerContainer) => (
      <span className="text-xs font-mono">{(c.ports?.map((p: any) => `${p.host}:${p.container}`) || []).join(', ') || '-'}</span>
    )},
    { key: 'created', header: 'Created', sortable: true, render: (c: DockerContainer) => <span className="text-xs">{formatRelativeTime(c.created)}</span> },
    { key: 'resources', header: 'Resources', render: (c: DockerContainer) => (
      <span className="text-xs">
        {c.allocatedRamMB || c.allocatedCpuCores
          ? `${c.allocatedRamMB || '-'}MB / ${c.allocatedCpuCores || '-'} vCPU`
          : '-'}
      </span>
    )},
    {
      key: 'actions', header: 'Actions',
      render: (c: DockerContainer) => (
        <div className="flex gap-1">
          {c.status === 'running' ? (
            <button onClick={() => handleAction(c.id, 'stop')} className="btn-ghost p-1"><Square className="w-4 h-4 text-red-500" /></button>
          ) : (
            <button onClick={() => handleAction(c.id, 'start')} className="btn-ghost p-1"><Play className="w-4 h-4 text-green-500" /></button>
          )}
          <button onClick={() => handleAction(c.id, 'restart')} className="btn-ghost p-1"><RotateCcw className="w-4 h-4 text-yellow-500" /></button>
          <button onClick={() => navigate(`/docker/containers/${c.id}`)} className="btn-ghost p-1"><Terminal className="w-4 h-4 text-blue-500" /></button>
          <button onClick={() => setDeleteId(c.id)} className="btn-ghost p-1"><Trash2 className="w-4 h-4 text-red-500" /></button>
        </div>
      )
    },
  ];

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Docker Containers</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your VPS and VDS instances</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setCreateForm((prev) => ({ ...prev, type: 'vds' })); setShowCreate(true); }} className="btn-secondary">
            <Server className="w-4 h-4" /> New VDS
          </button>
          <button onClick={() => { setCreateForm((prev) => ({ ...prev, type: 'vps' })); setShowCreate(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Pull & Run
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 mr-3">
          <button onClick={() => setTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeFilter === 'all' ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>All</button>
          <button onClick={() => setTypeFilter('vps')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeFilter === 'vps' ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>VPS</button>
          <button onClick={() => setTypeFilter('vds')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${typeFilter === 'vds' ? 'bg-purple-50 text-purple-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>VDS</button>
        </div>
        <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />
        {['all', 'running', 'exited', 'paused', 'created'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
              statusFilter === s ? 'bg-primary-50 text-primary-600' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}>{s}</button>
        ))}
      </div>

      {typeFiltered.length === 0 ? (
        <EmptyState icon={Container} title={typeFilter === 'vds' ? 'No VDS instances' : 'No containers'} description="Create a new instance to get started."
          action={{ label: typeFilter === 'vds' ? 'New VDS' : 'Pull & Run', onClick: () => { setCreateForm((prev) => ({ ...prev, type: typeFilter === 'vds' ? 'vds' : 'vps' })); setShowCreate(true); } }} />
      ) : (
        <DataTable columns={columns} data={typeFiltered} keyExtractor={(item: DockerContainer) => item.id} />
      )}

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete}
        title="Remove Container" message="This will permanently remove the container and its data." confirmText="Remove" />

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                {createForm.type === 'vds' ? <Server className="w-5 h-5 text-purple-500" /> : <Container className="w-5 h-5 text-primary-500" />}
                <h2 className="text-lg font-semibold">{createForm.type === 'vds' ? 'Create VDS' : 'Pull & Run'}</h2>
              </div>
              <button onClick={() => setShowCreate(false)} className="btn-ghost p-1"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {createForm.type === 'vds' && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium mb-1">
                    <Shield className="w-4 h-4" /> Virtual Dedicated Server — RDP Desktop
                  </div>
                  <p className="text-xs text-purple-600 dark:text-purple-400">Full Linux desktop with RDP access (port 3389) and web access (port 3000). Includes systemd, SSH, privileged mode, dedicated resources, and auto-restart. Default credentials: <span className="font-mono bg-purple-100 dark:bg-purple-800 px-1 rounded">abcuser</span> / <span className="font-mono bg-purple-100 dark:bg-purple-800 px-1 rounded">abcabc</span></p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setCreateForm((prev) => ({ ...prev, type: 'vps' }))}
                  className={`flex-1 p-3 rounded-lg border text-sm font-medium text-center transition-all ${createForm.type === 'vps' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                  <Container className="w-4 h-4 mx-auto mb-1" /> VPS (Lightweight)
                </button>
                <button onClick={() => setCreateForm((prev) => ({ ...prev, type: 'vds' }))}
                  className={`flex-1 p-3 rounded-lg border text-sm font-medium text-center transition-all ${createForm.type === 'vds' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700' : 'border-gray-200 dark:border-gray-600 text-gray-500'}`}>
                  <Server className="w-4 h-4 mx-auto mb-1" /> VDS (RDP Desktop)
                </button>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">{createForm.type === 'vds' ? 'RDP Desktop Images' : 'Popular Images'}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(createForm.type === 'vds' ? VDS_IMAGES : POPULAR_IMAGES).map((img) => (
                    <button key={img.image} onClick={() => selectImage(img)}
                      className={`text-left p-3 rounded-lg border text-sm transition-all ${
                        createForm.image === img.image
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-400'
                          : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
                      }`}>
                      <span className="font-medium block">{img.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{img.image}</span>
                      <span className="text-xs text-gray-400 block mt-0.5">{img.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Custom Image</label>
                <input value={createForm.image} onChange={(e) => setCreateForm((prev) => ({ ...prev, image: e.target.value }))}
                  placeholder="e.g. nginx:latest"
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Container Name (optional)</label>
                <input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="my-container"
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Port Mapping (optional)</label>
                <input value={createForm.ports} onChange={(e) => setCreateForm((prev) => ({ ...prev, ports: e.target.value }))}
                  placeholder="e.g. 8080:80, 3000:3000"
                  className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
                <p className="text-xs text-gray-500 mt-1">Format: hostPort:containerPort, comma-separated</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Command (optional)</label>
                <input value={createForm.cmd} onChange={(e) => setCreateForm((prev) => ({ ...prev, cmd: e.target.value }))}
                  placeholder="e.g. sleep infinity"
                  className="w-full px-3 py-2 text-sm font-mono bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
                <p className="text-xs text-gray-500 mt-1">Command to run (OS images like Ubuntu need <code>sleep infinity</code> to stay alive)</p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Resource Limits (optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1"><Cpu className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-500">RAM (MB)</span></div>
                    <input value={createForm.allocatedRamMB} onChange={(e) => setCreateForm((prev) => ({ ...prev, allocatedRamMB: e.target.value }))}
                      type="number" min="0" placeholder="e.g. 512"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1"><HardDrive className="w-3 h-3 text-gray-400" /><span className="text-xs text-gray-500">vCPU Cores</span></div>
                    <input value={createForm.allocatedCpuCores} onChange={(e) => setCreateForm((prev) => ({ ...prev, allocatedCpuCores: e.target.value }))}
                      type="number" min="0" step="0.5" placeholder="e.g. 1"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreate} disabled={creating || !createForm.image.trim()} className="btn-primary">
                {creating ? 'Creating...' : 'Pull & Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DockerContainersPage;
