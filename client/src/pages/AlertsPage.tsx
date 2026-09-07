import React, { useState, useEffect } from "react";
import { Plus, Trash2, Bell, BellOff, Activity } from "lucide-react";
import api from "@/utils/api";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import toast from "react-hot-toast";
import { Alert } from "@/types";
import { formatDate } from "@/utils/helpers";
const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    nodeId: "",
    metric: "cpu" as string,
    condition: "gt" as string,
    threshold: 80,
    duration: 5,
    notificationMethod: "email" as string,
    enabled: true,
  });
  const fetch = async () => {
    try {
      const [aRes, nRes] = await Promise.allSettled([
        api.get("/alerts"),
        api.get("/nodes"),
      ]);
      if (aRes.status === "fulfilled")
        setAlerts(
          Array.isArray(aRes.value.data)
            ? aRes.value.data
            : aRes.value.data.alerts || [],
        );
      if (nRes.status === "fulfilled")
        setNodes(
          Array.isArray(nRes.value.data)
            ? nRes.value.data
            : nRes.value.data.nodes || [],
        );
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetch();
  }, []);
  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await api.patch(`/alerts/${id}`, { enabled: !enabled });
      toast.success(`Alert ${!enabled ? "enabled" : "disabled"}`);
      fetch();
    } catch {}
  };
  const handleCreate = async () => {
    try {
      await api.post("/alerts", form);
      toast.success("Alert created");
      setShowCreateModal(false);
      setForm({
        name: "",
        nodeId: "",
        metric: "cpu",
        condition: "gt",
        threshold: 80,
        duration: 5,
        notificationMethod: "email",
        enabled: true,
      });
      fetch();
    } catch {}
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/alerts/${deleteId}`);
      toast.success("Alert deleted");
      setDeleteId(null);
      fetch();
    } catch {}
  };
  const columns = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      render: (a: Alert) => <span className="font-medium">{a.name}</span>,
    },
    {
      key: "metric",
      header: "Metric",
      sortable: true,
      render: (a: Alert) => (
        <span className="uppercase text-xs font-bold">{a.metric}</span>
      ),
    },
    {
      key: "condition",
      header: "Condition",
      render: (a: Alert) =>
        `${a.condition === "gt" ? ">" : a.condition === "lt" ? "<" : "="} ${a.threshold}`,
    },
    {
      key: "duration",
      header: "Duration",
      render: (a: Alert) => `${a.duration}s`,
    },
    {
      key: "node",
      header: "Node",
      render: (a: Alert) => (a.node as any)?.name || "-",
    },
    {
      key: "enabled",
      header: "Status",
      render: (a: Alert) => (
        <StatusBadge status={a.enabled ? "active" : "inactive"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (a: Alert) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {" "}
          <button
            onClick={() => handleToggle(a.id, a.enabled)}
            className="btn-ghost p-1.5"
          >
            {" "}
            {a.enabled ? (
              <BellOff className="w-4 h-4 text-orange-500" />
            ) : (
              <Bell className="w-4 h-4 text-green-500" />
            )}{" "}
          </button>{" "}
          <button
            onClick={() => setDeleteId(a.id)}
            className="btn-ghost p-1.5 text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>{" "}
        </div>
      ),
    },
  ];
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="space-y-6">
      {" "}
      <div className="flex items-center justify-between">
        {" "}
        <div>
          {" "}
          <h1 className="text-2xl font-bold">Alerts</h1>{" "}
          <p className="text-sm text-gray-500 mt-1">
            Manage monitoring alerts
          </p>{" "}
        </div>{" "}
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Create Alert
        </button>{" "}
      </div>{" "}
      {alerts.length > 0 ? (
        <DataTable
          columns={columns}
          data={alerts}
          keyExtractor={(a) => a.id}
          pageSize={20}
        />
      ) : (
        <EmptyState
          icon={Bell}
          title="No alerts"
          description="Create alerts to get notified of infrastructure issues."
          action={{
            label: "Create Alert",
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Alert"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div>
            <label className="label-field">Alert Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
            />
          </div>{" "}
          <div>
            <label className="label-field">Node</label>
            <select
              value={form.nodeId}
              onChange={(e) => setForm({ ...form, nodeId: e.target.value })}
              className="input-field"
            >
              <option value="">All Nodes</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              <label className="label-field">Metric</label>
              <select
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
                className="input-field"
              >
                <option value="cpu">CPU</option>
                <option value="ram">RAM</option>
                <option value="disk">Disk</option>
                <option value="network">Network</option>
                <option value="uptime">Uptime</option>
              </select>
            </div>{" "}
            <div>
              <label className="label-field">Condition</label>
              <select
                value={form.condition}
                onChange={(e) =>
                  setForm({ ...form, condition: e.target.value })
                }
                className="input-field"
              >
                <option value="gt">Greater Than</option>
                <option value="lt">Less Than</option>
                <option value="eq">Equal To</option>
              </select>
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              <label className="label-field">Threshold</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) =>
                  setForm({ ...form, threshold: parseInt(e.target.value) })
                }
                className="input-field"
                min={0}
                max={100}
              />
            </div>{" "}
            <div>
              <label className="label-field">Duration (seconds)</label>
              <input
                type="number"
                value={form.duration}
                onChange={(e) =>
                  setForm({ ...form, duration: parseInt(e.target.value) })
                }
                className="input-field"
                min={0}
              />
            </div>{" "}
          </div>{" "}
          <div>
            <label className="label-field">Notification Method</label>
            <select
              value={form.notificationMethod}
              onChange={(e) =>
                setForm({ ...form, notificationMethod: e.target.value })
              }
              className="input-field"
            >
              <option value="email">Email</option>
              <option value="webhook">Webhook</option>
              <option value="both">Both</option>
            </select>
          </div>{" "}
        </div>{" "}
        <div className="flex justify-end gap-3 mt-4">
          {" "}
          <button
            onClick={() => setShowCreateModal(false)}
            className="btn-secondary"
          >
            Cancel
          </button>{" "}
          <button onClick={handleCreate} className="btn-primary">
            Create Alert
          </button>{" "}
        </div>{" "}
      </Modal>{" "}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Alert"
        message="This will permanently remove the alert."
        confirmText="Delete"
      />{" "}
    </div>
  );
};
export default AlertsPage;
