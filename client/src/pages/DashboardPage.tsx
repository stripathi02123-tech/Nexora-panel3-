import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Monitor,
  Box,
  Server,
  Plus,
  Play,
  Activity,
  HardDrive,
  Cpu,
  Database,
  Network,
  ArrowRight,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import api from '@/utils/api';
import { useAuth } from '@/hooks/useAuth';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ResourceBar from '@/components/ui/ResourceBar';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatRelativeTime, formatBytes, formatDuration } from '@/utils/helpers';
import { Node, Activity as ActivityType, Metric } from '@/types';

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDocker: 0,
    runningDocker: 0,
    totalNodes: 0,
    onlineNodes: 0,
  });
  const [nodes, setNodes] = useState<Node[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityType[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dockerRes, nodeRes, activityRes, metricRes] = await Promise.allSettled([
          api.get('/docker/containers'),
          api.get('/nodes'),
          api.get('/activity?limit=10'),
          api.get('/metrics?limit=20'),
        ]);

        const docker = dockerRes.status === 'fulfilled' ? dockerRes.value.data : [];
        const nodesData = nodeRes.status === 'fulfilled' ? nodeRes.value.data : [];
        const activity = activityRes.status === 'fulfilled' ? activityRes.value.data : [];
        const metricsData = metricRes.status === 'fulfilled' ? metricRes.value.data : [];

        const dockerList = Array.isArray(docker) ? docker : docker.containers || [];
        const nodeList = Array.isArray(nodesData) ? nodesData : nodesData.nodes || [];
        const activityList = Array.isArray(activity) ? activity : activity.activity || [];
        const metricsList = Array.isArray(metricsData) ? metricsData : metricsData.metrics || [];

        setStats({
          totalDocker: dockerList.length,
          runningDocker: dockerList.filter((d: any) => d.status === 'running').length,
          totalNodes: nodeList.length,
          onlineNodes: nodeList.filter((n: any) => n.status === 'online').length,
        });
        setNodes(nodeList);
        setRecentActivity(activityList);
        setMetrics(metricsList);
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingSpinner size="lg" className="h-96" />;

  const totalResources = nodes.reduce(
    (acc, n) => ({
      cpu: acc.cpu + (n.cpuCores || 0),
      ram: acc.ram + (n.ramTotal || 0),
      disk: acc.disk + (n.storageTotal || 0),
      usedRam: acc.usedRam + (n.ramUsed || 0),
      usedDisk: acc.usedDisk + (n.storageUsed || 0),
      usedCpu: acc.usedCpu + (n.cpuUsage || 0),
    }),
    { cpu: 0, ram: 0, disk: 0, usedRam: 0, usedDisk: 0, usedCpu: 0 }
  );

  const chartData = metrics.map((m) => ({
    time: m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '',
    cpu: m.cpu?.percent || 0,
    ram: m.ram?.percent || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ textShadow: '0 0 10px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.3)' }}>Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Welcome back, {user?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/docker/containers/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New VPS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Monitor}
          label="VPS Instances"
          value={`${stats.runningDocker}/${stats.totalDocker}`}
          subtitle="Running / Total"
          onClick={() => navigate('/docker/containers')}
        />
        <StatCard
          icon={Box}
          label="Docker Containers"
          value={`${stats.runningDocker}/${stats.totalDocker}`}
          subtitle="Running / Total"
          onClick={() => navigate('/docker')}
        />
        <StatCard
          icon={Server}
          label="Nodes"
          value={`${stats.onlineNodes}/${stats.totalNodes}`}
          subtitle="Online / Total"
          onClick={() => navigate('/admin?tab=nodes')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Resource Usage</h3>
            <div className="space-y-4">
              <ResourceBar label="CPU" used={totalResources.usedCpu} total={totalResources.cpu} unit="number" />
              <ResourceBar label="RAM" used={totalResources.usedRam} total={totalResources.ram} unit="bytes" />
              <ResourceBar label="Storage" used={totalResources.usedDisk} total={totalResources.disk} unit="bytes" />
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">CPU & RAM Usage</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
                    <YAxis stroke="#9ca3af" fontSize={12} />
                    <Tooltip />
                    <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#cpuGrad)" name="CPU %" />
                    <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#ramGrad)" name="RAM %" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No recent activity</p>
              ) : (
                recentActivity.map((a) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 mt-0.5">
                      <Activity className="w-3.5 h-3.5 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white truncate">{a.action}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatRelativeTime(a.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <button onClick={() => navigate('/docker/containers/new')} className="w-full btn-secondary justify-start">
                <Plus className="w-4 h-4" />
                Create VPS
              </button>
              <button onClick={() => navigate('/docker/compose')} className="w-full btn-secondary justify-start">
                <Play className="w-4 h-4" />
                Deploy Docker Stack
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
