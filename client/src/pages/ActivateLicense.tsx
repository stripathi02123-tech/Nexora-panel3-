import React, { useEffect, useState } from 'react';
import { ShieldCheck, KeyRound, Lock, Server, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/utils/api';

const ActivateLicense: React.FC = () => {
  const [machineId, setMachineId] = useState('Loading...');
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/license/status').then((res) => {
      setMachineId(res.data.machineId || 'Unknown');
      if (res.data.activated) window.location.href = '/dashboard';
    }).catch(() => setMachineId('Unable to load'));
  }, []);

  const activate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return toast.error('Enter your Nexora license key');
    setLoading(true);
    try {
      await api.post('/license/activate', { licenseKey: licenseKey.trim() });
      toast.success('License activated successfully');
      setTimeout(() => { window.location.href = '/dashboard'; }, 800);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Invalid license key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050814] text-white flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#2563eb33,transparent_35%),radial-gradient(circle_at_bottom,#7c3aed22,transparent_35%)]" />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
            <ShieldCheck className="h-9 w-9 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold">Nexora Panel</h1>
          <p className="text-slate-400 mt-2">License Activation Required</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex gap-2 items-center"><CheckCircle2 className="text-emerald-400 h-4 w-4" /> Live server check</div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 flex gap-2 items-center"><Lock className="text-emerald-400 h-4 w-4" /> Machine binding</div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 mb-6">
          <div className="flex items-center gap-2 text-blue-300 font-semibold mb-2"><Server className="h-4 w-4" /> Machine ID</div>
          <code className="text-xs text-slate-300 break-all">{machineId}</code>
        </div>

        <form onSubmit={activate}>
          <label className="block text-sm font-semibold mb-2"><KeyRound className="inline h-4 w-4 mr-1" /> License Key</label>
          <input
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
            placeholder="Enter your license key..."
            className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-4 outline-none focus:border-blue-500 mb-5"
          />
          <button disabled={loading} className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 py-4 font-bold shadow-lg shadow-blue-600/20">
            {loading ? 'Activating...' : 'Activate License'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-6">Validated with Nexora License Server • Re-check every 5 minutes</p>
      </div>
    </div>
  );
};

export default ActivateLicense;
