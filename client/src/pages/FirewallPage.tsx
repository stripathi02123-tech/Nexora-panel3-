import React, { useState, useEffect } from "react";
import { Plus, Trash2, Shield, GripVertical } from "lucide-react";
import api from "@/utils/api";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import StatusBadge from "@/components/ui/StatusBadge";
import toast from "react-hot-toast";
import { FirewallRule } from "@/types";
import { formatDate } from "@/utils/helpers";
const FirewallPage: React.FC = () => {
  const [rules, setRules] = useState<FirewallRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    direction: "in" as string,
    action: "accept" as string,
    protocol: "tcp" as string,
    ports: "",
    sourceIp: "",
    destinationIp: "",
    priority: 100,
    enabled: true,
  });
  const fetch = async () => {
    try {
      const res = await api.get("/firewall");
      setRules(Array.isArray(res.data) ? res.data : res.data.rules || []);
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
      await api.patch(`/firewall/${id}`, { enabled: !enabled });
      toast.success(`Rule ${!enabled ? "enabled" : "disabled"}`);
      fetch();
    } catch {}
  };
  const handleCreate = async () => {
    try {
      await api.post("/firewall", form);
      toast.success("Rule created");
      setShowCreateModal(false);
      setForm({
        name: "",
        direction: "in",
        action: "accept",
        protocol: "tcp",
        ports: "",
        sourceIp: "",
        destinationIp: "",
        priority: 100,
        enabled: true,
      });
      fetch();
    } catch {}
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/firewall/${deleteId}`);
      toast.success("Rule deleted");
      setDeleteId(null);
      fetch();
    } catch {}
  };
  const columns = [
    {
      key: "priority",
      header: "#",
      render: (r: FirewallRule) => (
        <span className="text-xs text-gray-400">{r.priority}</span>
      ),
    },
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      render: (r: FirewallRule) => (
        <span className="font-medium">{r.name}</span>
      ),
    },
    {
      key: "direction",
      header: "Direction",
      sortable: true,
      render: (r: FirewallRule) => (
        <span className="uppercase text-xs">{r.direction}</span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (r: FirewallRule) => (
        <span
          className={`inline-flex px-2 py-0.5 text-xs rounded-full font-medium ${r.action === "accept" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : r.action === "drop" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400"}`}
        >
          {r.action}
        </span>
      ),
    },
    {
      key: "protocol",
      header: "Protocol",
      render: (r: FirewallRule) => (
        <span className="uppercase text-xs">{r.protocol}</span>
      ),
    },
    {
      key: "ports",
      header: "Ports",
      render: (r: FirewallRule) => r.ports || "Any",
    },
    {
      key: "sourceIp",
      header: "Source",
      render: (r: FirewallRule) => (
        <span className="font-mono text-xs">{r.sourceIp || "0.0.0.0/0"}</span>
      ),
    },
    {
      key: "enabled",
      header: "Status",
      render: (r: FirewallRule) => (
        <StatusBadge status={r.enabled ? "active" : "inactive"} />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r: FirewallRule) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {" "}
          <button
            onClick={() => handleToggle(r.id, r.enabled)}
            className="btn-ghost p-1.5"
          >
            <Shield
              className={`w-4 h-4 ${r.enabled ? "text-green-500" : "text-gray-400"}`}
            />
          </button>{" "}
          <button
            onClick={() => setDeleteId(r.id)}
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
          <h1 className="text-2xl font-bold">Firewall</h1>{" "}
          <p className="text-sm text-gray-500 mt-1">
            Manage firewall rules
          </p>{" "}
        </div>{" "}
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Add Rule
        </button>{" "}
      </div>{" "}
      {rules.length > 0 ? (
        <DataTable
          columns={columns}
          data={rules}
          keyExtractor={(r) => r.id}
          pageSize={20}
        />
      ) : (
        <EmptyState
          icon={Shield}
          title="No firewall rules"
          description="Add rules to control network traffic to your infrastructure."
          action={{
            label: "Add Rule",
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Firewall Rule"
        size="lg"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div>
            <label className="label-field">Rule Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
            />
          </div>{" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div>
              <label className="label-field">Direction</label>
              <select
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value })
                }
                className="input-field"
              >
                <option value="in">Inbound</option>
                <option value="out">Outbound</option>
                <option value="forward">Forward</option>
              </select>
            </div>{" "}
            <div>
              <label className="label-field">Action</label>
              <select
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
                className="input-field"
              >
                <option value="accept">Accept</option>
                <option value="drop">Drop</option>
                <option value="reject">Reject</option>
              </select>
            </div>{" "}
            <div>
              <label className="label-field">Protocol</label>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                className="input-field"
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="icmp">ICMP</option>
                <option value="any">Any</option>
              </select>
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              <label className="label-field">Ports</label>
              <input
                type="text"
                value={form.ports}
                onChange={(e) => setForm({ ...form, ports: e.target.value })}
                className="input-field"
                placeholder="80,443 or 3000-4000"
              />
            </div>{" "}
            <div>
              <label className="label-field">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: parseInt(e.target.value) })
                }
                className="input-field"
              />
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              <label className="label-field">Source IP</label>
              <input
                type="text"
                value={form.sourceIp}
                onChange={(e) => setForm({ ...form, sourceIp: e.target.value })}
                className="input-field"
                placeholder="0.0.0.0/0"
              />
            </div>{" "}
            <div>
              <label className="label-field">Destination IP</label>
              <input
                type="text"
                value={form.destinationIp}
                onChange={(e) =>
                  setForm({ ...form, destinationIp: e.target.value })
                }
                className="input-field"
                placeholder="0.0.0.0/0"
              />
            </div>{" "}
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
            Create Rule
          </button>{" "}
        </div>{" "}
      </Modal>{" "}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Rule"
        message="This will permanently remove the firewall rule."
        confirmText="Delete"
      />{" "}
    </div>
  );
};
export default FirewallPage;
