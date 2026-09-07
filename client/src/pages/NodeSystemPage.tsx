import React, { useState, useEffect } from "react";
import { Server, Activity, HardDrive, Cpu, RefreshCw, Database } from "lucide-react";
import api from "@/utils/api";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";

interface AgentInfo {
  id: string;
  name: string;
  host: string;
  port: number;
  status: string;
  uptime: number;
  latencyMs?: number | null;
  errorCode?: string | null;
  error?: string | null;
}

interface ConnectionTestResult {
  online: boolean;
  latencyMs: number | null;
  stage: string;
  code: string;
  message: string;
}

interface AllocationStats {
  limits: { ramMB: number; cores: number };
  used: { ramMB: number; cores: number };
  available: { ramMB: number; cores: number };
  count: number;
}

interface ResourceEntry {
  id: string;
  type: string;
  label: string;
  allocatedRamMB: number;
  allocatedCpuCores: number;
  pid: number | null;
  status: string;
}

const NodeSystemPage: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [allocation, setAllocation] = useState<AllocationStats | null>(null);
  const [resources, setResources] = useState<ResourceEntry[]>([]);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await api.get("/node-system/discover");
      setAgents(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Failed to fetch agents:", error);
      toast.error("Failed to load node agents");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  };

  const testConnection = async (agent: AgentInfo) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post(`/node-system/${agent.id}/test-connection`);
      setTestResult(res.data);
    } catch (error) {
      console.error('Connection test failed:', error);
      toast.error('Connection test failed to run');
    } finally {
      setTesting(false);
    }
  };

  const selectAgent = async (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setAllocation(null);
    setResources([]);
    setTestResult(null);

    try {
      const [allocRes, resRes] = await Promise.all([
        api.get(`/node-system/${agent.id}/allocation`),
        api.get(`/node-system/${agent.id}/resources`),
      ]);
      setAllocation(allocRes.data);
      setResources(Array.isArray(resRes.data?.servers) ? resRes.data.servers : []);
    } catch (error) {
      console.error("Failed to load agent details:", error);
      toast.error("Failed to load agent details");
      setAllocation(null);
      setResources([]);
    }
  };

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Node Agents</h1>
          <p className="text-sm text-gray-500 mt-1">Manage resource allocation and process orchestration agents</p>
        </div>
        <button onClick={fetchAgents} className="btn-secondary">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Server className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">No node agents found</h3>
          <p className="text-sm text-gray-400 mt-1">
            Run a node-system agent and add it as a Node with type "AGENT" in Admin &gt; Nodes
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => selectAgent(agent)}
              className={`glass-card p-4 text-left transition-all hover:shadow-md ${
                selectedAgent?.id === agent.id ? "ring-2 ring-primary-500" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${agent.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-medium">{agent.name}</span>
                </div>
                <span className="text-xs text-gray-400">{agent.host}:{agent.port}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {agent.status}</span>
                {agent.status === 'ok' ? (
                  <span>Uptime: {Math.floor(agent.uptime)}s{agent.latencyMs != null ? ` · ${agent.latencyMs}ms` : ''}</span>
                ) : (
                  <span className="text-red-500 truncate">{agent.error || 'Connection failed'}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedAgent && selectedAgent.status !== 'ok' && (
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Connection diagnostics — {selectedAgent.name}</h3>
            <button onClick={() => testConnection(selectedAgent)} className="btn-secondary" disabled={testing}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>Host</span><span className="text-gray-700 dark:text-gray-300">{selectedAgent.host}</span>
            <span>Port</span><span className="text-gray-700 dark:text-gray-300">{selectedAgent.port}</span>
            <span>Reason</span><span className="text-gray-700 dark:text-gray-300">{selectedAgent.error || '—'}</span>
          </div>
          {testResult && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>Result</span>
              <span className={testResult.online ? 'text-green-600' : 'text-red-500'}>{testResult.online ? 'Online' : 'Offline'}</span>
              <span>Stage</span><span className="text-gray-700 dark:text-gray-300">{testResult.stage}</span>
              <span>Reason</span><span className="text-gray-700 dark:text-gray-300">{testResult.message}</span>
              <span>Latency</span><span className="text-gray-700 dark:text-gray-300">{testResult.latencyMs != null ? `${testResult.latencyMs}ms` : '—'}</span>
            </div>
          )}
        </div>
      )}

      {selectedAgent && allocation && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Cpu className="w-4 h-4" /> CPU
            </div>
            <p className="text-lg font-bold">{allocation.used.cores.toFixed(1)} / {allocation.limits.cores}</p>
            <p className="text-xs text-gray-400">{allocation.available.cores.toFixed(1)} cores available</p>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Database className="w-4 h-4" /> RAM
            </div>
            <p className="text-lg font-bold">{allocation.used.ramMB} / {allocation.limits.ramMB} MB</p>
            <p className="text-xs text-gray-400">{allocation.available.ramMB} MB available</p>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <HardDrive className="w-4 h-4" /> Resources
            </div>
            <p className="text-lg font-bold">{allocation.count} registered</p>
            <p className="text-xs text-gray-400">{resources.filter((r) => r.status === 'running').length} running</p>
          </div>
        </div>
      )}

      {selectedAgent && resources.length > 0 && (
        <div className="glass-card">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 font-medium text-sm">
            Registered Resources
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {resources.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${r.status === 'running' ? 'bg-green-500' : r.status === 'crashed' ? 'bg-red-500' : 'bg-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium">{r.label}</p>
                    <p className="text-xs text-gray-400">{r.type} · {r.allocatedRamMB}MB · {r.allocatedCpuCores} cores</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.pid != null && <span className="text-xs text-gray-400">PID {r.pid}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === 'running' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    r.status === 'crashed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NodeSystemPage;
