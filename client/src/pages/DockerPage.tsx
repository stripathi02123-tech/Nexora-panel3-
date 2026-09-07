import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Image, Play, Square, ArrowRight, Server, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import api from '@/utils/api';
import StatCard from '@/components/ui/StatCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatBytes } from '@/utils/helpers';

const COLORS = ['#10b981', '#ef4444', '#f59e0b', '#6366f1'];

const DockerPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, running: 0, paused: 0, exited: 0, images: 0, composeCount: 0 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cRes, iRes, compRes] = await Promise.allSettled([
          api.get('/docker/containers'),
          api.get('/docker/images'),
          api.get('/docker/compose'),
        ]);
        const containers = cRes.status === 'fulfilled' ? (Array.isArray(cRes.value.data) ? cRes.value.data : cRes.value.data.containers || []) : [];
        const images = iRes.status === 'fulfilled' ? (Array.isArray(iRes.value.data) ? iRes.value.data : iRes.value.data.images || []) : [];
        const compose = compRes.status === 'fulfilled' ? (Array.isArray(compRes.value.data) ? compRes.value.data : compRes.value.data.stacks || []) : [];
        setStats({
          total: containers.length,
          running: containers.filter((c: any) => c.status === 'running').length,
          paused: containers.filter((c: any) => c.status === 'paused').length,
          exited: containers.filter((c: any) => c.status === 'exited').length,
          images: images.length,
          composeCount: compose.length,
        });
      } catch {} finally { setLoading(false); }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  const pieData = [
    { name: 'Running', value: stats.running },
    { name: 'Exited', value: stats.exited },
    { name: 'Paused', value: stats.paused },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Docker</h1>
        <p className="text-sm text-gray-500 mt-1">Manage Docker containers, images, and stacks</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Container} label="Total Containers" value={stats.total} subtitle="All containers" onClick={() => navigate('/docker/containers')} />
        <StatCard icon={Play} label="Running" value={stats.running} color="bg-green-500" onClick={() => navigate('/docker/containers')} />
        <StatCard icon={Image} label="Images" value={stats.images} onClick={() => navigate('/docker/images')} />
        <StatCard icon={Server} label="Compose Stacks" value={stats.composeCount} onClick={() => navigate('/docker/compose')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Container Status</h3>
          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-8">No containers</p>
          )}
        </div>

        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={() => navigate('/docker/containers')} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 transition-colors text-left">
              <Container className="w-6 h-6 text-primary-500 mb-2" />
              <p className="font-medium">View Containers</p>
              <p className="text-xs text-gray-500 mt-1">Manage running containers</p>
            </button>
            <button onClick={() => navigate('/docker/images')} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 transition-colors text-left">
              <Image className="w-6 h-6 text-green-500 mb-2" />
              <p className="font-medium">Manage Images</p>
              <p className="text-xs text-gray-500 mt-1">Pull and manage images</p>
            </button>
            <button onClick={() => navigate('/docker/compose')} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 transition-colors text-left">
              <Server className="w-6 h-6 text-purple-500 mb-2" />
              <p className="font-medium">Compose Stacks</p>
              <p className="text-xs text-gray-500 mt-1">Deploy compose files</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DockerPage;
