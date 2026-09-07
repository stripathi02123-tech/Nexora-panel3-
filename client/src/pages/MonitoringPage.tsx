import React, { useState, useEffect } from "react";
import {
  Server,
  Cpu,
  Database,
  HardDrive,
  Activity,
  Network,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import api from "@/utils/api";
import StatusBadge from "@/components/ui/StatusBadge";
import ResourceBar from "@/components/ui/ResourceBar";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  formatBytes,
  formatDuration,
  formatDate,
  formatRelativeTime,
} from "@/utils/helpers";
import { Node, Metric } from "@/types";
const MonitoringPage: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("1h");
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [nRes, mRes] = await Promise.allSettled([
          api.get("/nodes"),
          api.get(`/metrics?range=${timeRange}`),
        ]);
        if (nRes.status === "fulfilled")
          setNodes(
            Array.isArray(nRes.value.data)
              ? nRes.value.data
              : nRes.value.data.nodes || [],
          );
        if (mRes.status === "fulfilled")
          setMetrics(
            Array.isArray(mRes.value.data)
              ? mRes.value.data
              : mRes.value.data.metrics || [],
          );
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeRange]);
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  const chartData = metrics.map((m) => ({
    time: formatDate(m.timestamp, "HH:mm"),
    cpu: m.cpu?.percent || 0,
    ram: m.ram?.percent || 0,
    disk: m.disk?.percent || 0,
    rx: m.network?.rxSpeed || 0,
    tx: m.network?.txSpeed || 0,
  }));
  const totalResources = nodes.reduce(
    (acc, n) => ({
      cpu: acc.cpu + (n.cpu?.total || 0),
      ram: acc.ram + (n.ram?.total || 0),
      disk: acc.disk + (n.disk?.total || 0),
      usedCpu: acc.usedCpu + (n.cpu?.used || 0),
      usedRam: acc.usedRam + (n.ram?.used || 0),
      usedDisk: acc.usedDisk + (n.disk?.used || 0),
    }),
    { cpu: 0, ram: 0, disk: 0, usedCpu: 0, usedRam: 0, usedDisk: 0 },
  );
  return (
    <div className="space-y-6">
      {" "}
      <div className="flex items-center justify-between">
        {" "}
        <div>
          {" "}
          <h1 className="text-2xl font-bold">Monitoring</h1>{" "}
          <p className="text-sm text-gray-500 mt-1">
            Real-time infrastructure monitoring
          </p>{" "}
        </div>{" "}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
          {" "}
          {["1h", "6h", "24h", "7d"].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${timeRange === range ? "bg-primary-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
            >
              {" "}
              {range}{" "}
            </button>
          ))}{" "}
        </div>{" "}
      </div>{" "}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {" "}
        <div className="glass-card p-5">
          {" "}
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-primary-500" />
            <span className="text-sm font-medium">CPU Usage</span>
          </div>{" "}
          <ResourceBar
            label="CPU"
            used={totalResources.usedCpu}
            total={totalResources.cpu}
            unit="number"
          />{" "}
        </div>{" "}
        <div className="glass-card p-5">
          {" "}
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-green-500" />
            <span className="text-sm font-medium">RAM Usage</span>
          </div>{" "}
          <ResourceBar
            label="RAM"
            used={totalResources.usedRam}
            total={totalResources.ram}
            unit="bytes"
          />{" "}
        </div>{" "}
        <div className="glass-card p-5">
          {" "}
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-medium">Disk Usage</span>
          </div>{" "}
          <ResourceBar
            label="Disk"
            used={totalResources.usedDisk}
            total={totalResources.disk}
            unit="bytes"
          />{" "}
        </div>{" "}
      </div>{" "}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {" "}
        <div className="glass-card p-5">
          {" "}
          <h3 className="text-sm font-semibold mb-4">CPU History</h3>{" "}
          <div className="h-64">
            {" "}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  stroke="#6b7280"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.2}
                  name="CPU %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>{" "}
        </div>{" "}
        <div className="glass-card p-5">
          {" "}
          <h3 className="text-sm font-semibold mb-4">RAM History</h3>{" "}
          <div className="h-64">
            {" "}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  stroke="#6b7280"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="ram"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  name="RAM %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>{" "}
        </div>{" "}
        <div className="glass-card p-5">
          {" "}
          <h3 className="text-sm font-semibold mb-4">Disk History</h3>{" "}
          <div className="h-64">
            {" "}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  stroke="#6b7280"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="disk"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.2}
                  name="Disk %"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>{" "}
        </div>{" "}
        <div className="glass-card p-5">
          {" "}
          <h3 className="text-sm font-semibold mb-4">Network Traffic</h3>{" "}
          <div className="h-64">
            {" "}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  stroke="#6b7280"
                />
                <YAxis tick={{ fontSize: 10 }} stroke="#6b7280" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="rx"
                  stroke="#6366f1"
                  fill="#6366f1"
                  fillOpacity={0.2}
                  name="RX"
                />
                <Area
                  type="monotone"
                  dataKey="tx"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.2}
                  name="TX"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>{" "}
        </div>{" "}
      </div>{" "}
      <div className="glass-card">
        {" "}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          {" "}
          <h2 className="text-lg font-semibold">Nodes Overview</h2>{" "}
        </div>{" "}
        <div className="overflow-x-auto">
          {" "}
          <table className="w-full">
            {" "}
            <thead>
              {" "}
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                {" "}
                <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500">
                  Node
                </th>{" "}
                <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500">
                  Status
                </th>{" "}
                <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500">
                  CPU
                </th>{" "}
                <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500">
                  RAM
                </th>{" "}
                <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500">
                  Disk
                </th>{" "}
                <th className="text-left p-3 text-xs font-semibold uppercase text-gray-500">
                  Uptime
                </th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {" "}
              {nodes.map((node) => (
                <tr
                  key={node.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                >
                  {" "}
                  <td className="p-3 text-sm font-medium">{node.name}</td>{" "}
                  <td className="p-3">
                    <StatusBadge status={node.status} />
                  </td>{" "}
                  <td className="p-3">
                    <ResourceBar
                      label=""
                      used={node.cpu?.used || 0}
                      total={node.cpu?.total || 1}
                      unit="number"
                    />
                  </td>{" "}
                  <td className="p-3">
                    <ResourceBar
                      label=""
                      used={node.ram?.used || 0}
                      total={node.ram?.total || 1}
                      unit="bytes"
                    />
                  </td>{" "}
                  <td className="p-3">
                    <ResourceBar
                      label=""
                      used={node.disk?.used || 0}
                      total={node.disk?.total || 1}
                      unit="bytes"
                    />
                  </td>{" "}
                  <td className="p-3 text-sm text-gray-500">
                    {formatDuration(node.uptime ?? 0)}
                  </td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
};
export default MonitoringPage;
