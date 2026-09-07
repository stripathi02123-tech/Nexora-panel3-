import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Check, Server, Cpu, Database, HardDrive, Network as NetworkIcon, Monitor
} from 'lucide-react';
import api from '@/utils/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import { Node, Plan } from '@/types';

const steps = ['Select Node & Template', 'Configure Resources', 'Network Config', 'Review & Create'];

const CreateVMPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({
    nodeId: '',
    name: '',
    template: '',
    cpuCores: 1,
    ram: 2048,
    disk: 20,
    networkType: 'bridge' as 'bridge' | 'nat' | 'host',
    ipAddress: '',
    gateway: '',
    dns: '8.8.8.8',
    sshKeyId: '',
    password: '',
    startOnCreate: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [nodeRes, planRes] = await Promise.all([
          api.get('/nodes?type=proxmox'),
          api.get('/plans'),
        ]);
        const nodesArr = Array.isArray(nodeRes.data) ? nodeRes.data : nodeRes.data.nodes || [];
        const plansArr = Array.isArray(planRes.data) ? planRes.data : planRes.data.plans || [];
        setNodes(nodesArr);
        setPlans(plansArr);
        if (nodesArr.length > 0) setForm((f) => ({ ...f, nodeId: nodesArr[0].id }));
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.nodeId) errs.nodeId = 'Please select a node';
    if (!form.name.trim()) errs.name = 'Name is required';
    if (step >= 1) {
      if (form.cpuCores < 1) errs.cpuCores = 'Minimum 1 core';
      if (form.ram < 512) errs.ram = 'Minimum 512 MB';
      if (form.disk < 5) errs.disk = 'Minimum 5 GB';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (!validate()) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const handlePrev = () => setStep((s) => Math.max(s - 1, 0));

  const handleCreate = async () => {
    if (!validate()) return;
    setCreating(true);
    try {
      await api.post('/vms', form);
      toast.success('Virtual machine created successfully!');
      navigate('/vms');
    } catch {
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  const selectedNode = nodes.find((n) => n.id === form.nodeId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Create Virtual Machine</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Provision a new virtual machine</p>
      </div>

      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i <= step ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
            }`}>
              {i < step ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium hidden sm:block ${i <= step ? 'text-primary-600' : 'text-gray-500'}`}>
              {s}
            </span>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'}`} />}
          </div>
        ))}
      </div>

      <div className="glass-card p-6">
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Node & Template</h3>

            <div>
              <label className="label-field">Node</label>
              <select
                value={form.nodeId}
                onChange={(e) => setForm((f) => ({ ...f, nodeId: e.target.value }))}
                className="input-field"
              >
                <option value="">Select a node...</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name} ({node.host})
                  </option>
                ))}
              </select>
              {errors.nodeId && <p className="text-xs text-red-500 mt-1">{errors.nodeId}</p>}
            </div>

            <div>
              <label className="label-field">VM Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-field"
                placeholder="my-vm"
              />
              {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="label-field">Template / OS</label>
              {selectedNode && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                  {['ubuntu-22.04', 'ubuntu-24.04', 'debian-12', 'centos-9', 'rocky-9', 'almalinux-9', 'windows-2022', 'windows-2019'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, template: t }))}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        form.template === t
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                          : 'border-gray-200 dark:border-gray-600 hover:border-primary-300'
                      }`}
                    >
                      <span className="text-sm font-medium">{t}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {plans.length > 0 && (
              <div>
                <label className="label-field">Or select a plan (optional)</label>
                <select
                  onChange={(e) => {
                    const plan = plans.find((p) => p.id === e.target.value);
                    if (plan) {
                      setForm((f) => ({
                        ...f,
                        cpuCores: plan.vmCpuLimit || f.cpuCores,
                        ram: plan.vmRamLimit || f.ram,
                        disk: plan.vmDiskLimit || f.disk,
                      }));
                    }
                  }}
                  className="input-field"
                >
                  <option value="">Custom configuration</option>
                  {plans.filter((p) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} - ${p.price}/mo</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Configure Resources</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label-field">CPU Cores</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setForm((f) => ({ ...f, cpuCores: Math.max(1, f.cpuCores - 1) }))}
                    className="btn-ghost p-2"
                  >-</button>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white w-12 text-center">{form.cpuCores}</span>
                  <button
                    onClick={() => setForm((f) => ({ ...f, cpuCores: f.cpuCores + 1 }))}
                    className="btn-ghost p-2"
                  >+</button>
                </div>
                {errors.cpuCores && <p className="text-xs text-red-500 mt-1">{errors.cpuCores}</p>}
              </div>

              <div>
                <label className="label-field">RAM (MB)</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setForm((f) => ({ ...f, ram: Math.max(512, f.ram - 512) }))}
                    className="btn-ghost p-2"
                  >-</button>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white w-20 text-center">{form.ram}</span>
                  <button
                    onClick={() => setForm((f) => ({ ...f, ram: f.ram + 512 }))}
                    className="btn-ghost p-2"
                  >+</button>
                </div>
                {errors.ram && <p className="text-xs text-red-500 mt-1">{errors.ram}</p>}
              </div>

              <div>
                <label className="label-field">Disk (GB)</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setForm((f) => ({ ...f, disk: Math.max(5, f.disk - 5) }))}
                    className="btn-ghost p-2"
                  >-</button>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white w-16 text-center">{form.disk}</span>
                  <button
                    onClick={() => setForm((f) => ({ ...f, disk: f.disk + 5 }))}
                    className="btn-ghost p-2"
                  >+</button>
                </div>
                {errors.disk && <p className="text-xs text-red-500 mt-1">{errors.disk}</p>}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Network Configuration</h3>

            <div>
              <label className="label-field">Network Type</label>
              <div className="flex gap-3">
                {(['bridge', 'nat', 'host'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, networkType: t }))}
                    className={`px-4 py-2 rounded-lg border capitalize ${
                      form.networkType === t
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label-field">IP Address (optional)</label>
                <input
                  type="text"
                  value={form.ipAddress}
                  onChange={(e) => setForm((f) => ({ ...f, ipAddress: e.target.value }))}
                  className="input-field"
                  placeholder="192.168.1.100"
                />
              </div>
              <div>
                <label className="label-field">Gateway (optional)</label>
                <input
                  type="text"
                  value={form.gateway}
                  onChange={(e) => setForm((f) => ({ ...f, gateway: e.target.value }))}
                  className="input-field"
                  placeholder="192.168.1.1"
                />
              </div>
              <div>
                <label className="label-field">DNS Server</label>
                <input
                  type="text"
                  value={form.dns}
                  onChange={(e) => setForm((f) => ({ ...f, dns: e.target.value }))}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Review & Create</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Node</span>
                <span className="text-sm font-medium">{selectedNode?.name || form.nodeId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Name</span>
                <span className="text-sm font-medium">{form.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Template</span>
                <span className="text-sm font-medium">{form.template}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">CPU</span>
                <span className="text-sm font-medium">{form.cpuCores} cores</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">RAM</span>
                <span className="text-sm font-medium">{form.ram} MB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Disk</span>
                <span className="text-sm font-medium">{form.disk} GB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Network</span>
                <span className="text-sm font-medium capitalize">{form.networkType}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={step === 0 ? () => navigate('/vms') : handlePrev}
          className="btn-secondary"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        {step < steps.length - 1 ? (
          <button onClick={handleNext} className="btn-primary">
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={handleCreate} disabled={creating} className="btn-primary">
            {creating ? <LoadingSpinner size="sm" /> : <Check className="w-4 h-4" />}
            Create VM
          </button>
        )}
      </div>
    </div>
  );
};

export default CreateVMPage;
