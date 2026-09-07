import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Server, Cpu, Database, HardDrive, Terminal } from 'lucide-react';
import api from '@/utils/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { Node } from '@/types';

const steps = ['Select Node & Template', 'Configure Resources', 'Review & Create'];

const CreateContainerPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [form, setForm] = useState({
    nodeId: '', name: '', template: 'ubuntu-22.04',
    cpuCores: 1, ram: 512, disk: 10,
    ipAddress: '', gateway: '', password: '',
    startOnCreate: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get('/nodes?type=lxc').then((res) => {
      const n = Array.isArray(res.data) ? res.data : res.data.nodes || [];
      setNodes(n);
      if (n.length > 0) setForm((f) => ({ ...f, nodeId: n[0].id }));
    }).finally(() => setLoading(false));
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.nodeId) errs.nodeId = 'Select a node';
    if (!form.name.trim()) errs.name = 'Name is required';
    if (form.cpuCores < 1) errs.cpuCores = 'Min 1 core';
    if (form.ram < 128) errs.ram = 'Min 128 MB';
    if (form.disk < 1) errs.disk = 'Min 1 GB';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    setCreating(true);
    try {
      await api.post('/containers', form);
      toast.success('Container created successfully!');
      navigate('/containers');
    } catch {} finally { setCreating(false); }
  };

  const templates = [
    { value: 'ubuntu-22.04', label: 'Ubuntu 22.04 LTS' },
    { value: 'ubuntu-24.04', label: 'Ubuntu 24.04 LTS' },
    { value: 'debian-12', label: 'Debian 12' },
    { value: 'centos-9', label: 'CentOS 9' },
    { value: 'alpine-3.19', label: 'Alpine 3.19' },
    { value: 'fedora-40', label: 'Fedora 40' },
  ];

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  const selectedNode = nodes.find((n) => n.id === form.nodeId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Container</h1>
        <p className="text-sm text-gray-500 mt-1">Provision a new LXC container</p>
      </div>

      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i <= step ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
            }`}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium hidden sm:block ${i <= step ? 'text-primary-600' : 'text-gray-500'}`}>{s}</span>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
          </div>
        ))}
      </div>

      <div className="glass-card p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Node & Template</h3>
            <div>
              <label className="label-field">Node</label>
              <select value={form.nodeId} onChange={(e) => setForm((f) => ({ ...f, nodeId: e.target.value }))} className="input-field">
                <option value="">Select a node...</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>{node.name} ({node.host})</option>
                ))}
              </select>
              {errors.nodeId && <p className="text-xs text-red-500 mt-1">{errors.nodeId}</p>}
            </div>
            <div>
              <label className="label-field">Container Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="my-container" />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="label-field">Template</label>
              <select value={form.template} onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))} className="input-field">
                {templates.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Configure Resources</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-field">CPU Cores</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setForm((f) => ({ ...f, cpuCores: Math.max(1, f.cpuCores - 1) }))} className="btn-ghost p-2">-</button>
                  <span className="text-2xl font-bold w-12 text-center">{form.cpuCores}</span>
                  <button onClick={() => setForm((f) => ({ ...f, cpuCores: f.cpuCores + 1 }))} className="btn-ghost p-2">+</button>
                </div>
                {errors.cpuCores && <p className="text-xs text-red-500 mt-1">{errors.cpuCores}</p>}
              </div>
              <div>
                <label className="label-field">RAM (MB)</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setForm((f) => ({ ...f, ram: Math.max(128, f.ram - 128) }))} className="btn-ghost p-2">-</button>
                  <span className="text-2xl font-bold w-20 text-center">{form.ram}</span>
                  <button onClick={() => setForm((f) => ({ ...f, ram: f.ram + 128 }))} className="btn-ghost p-2">+</button>
                </div>
                {errors.ram && <p className="text-xs text-red-500 mt-1">{errors.ram}</p>}
              </div>
              <div>
                <label className="label-field">Disk (GB)</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setForm((f) => ({ ...f, disk: Math.max(1, f.disk - 1) }))} className="btn-ghost p-2">-</button>
                  <span className="text-2xl font-bold w-16 text-center">{form.disk}</span>
                  <button onClick={() => setForm((f) => ({ ...f, disk: f.disk + 1 }))} className="btn-ghost p-2">+</button>
                </div>
                {errors.disk && <p className="text-xs text-red-500 mt-1">{errors.disk}</p>}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Review & Create</h3>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-sm text-gray-500">Node</span><span className="text-sm font-medium">{selectedNode?.name || form.nodeId}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Name</span><span className="text-sm font-medium">{form.name}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Template</span><span className="text-sm font-medium">{form.template}</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">CPU</span><span className="text-sm font-medium">{form.cpuCores} cores</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">RAM</span><span className="text-sm font-medium">{form.ram} MB</span></div>
              <div className="flex justify-between"><span className="text-sm text-gray-500">Disk</span><span className="text-sm font-medium">{form.disk} GB</span></div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={step === 0 ? () => navigate('/containers') : () => setStep((s) => s - 1)} className="btn-secondary">
          <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < steps.length - 1 ? (
          <button onClick={() => { if (validate()) setStep((s) => s + 1); }} className="btn-primary">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={handleCreate} disabled={creating} className="btn-primary">
            {creating ? <LoadingSpinner size="sm" /> : <Check className="w-4 h-4" />}
            Create Container
          </button>
        )}
      </div>
    </div>
  );
};

export default CreateContainerPage;
