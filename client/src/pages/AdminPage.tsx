import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Users,
  Server,
  CreditCard,
  FileText,
  Webhook,
  Activity,
  Plus,
  Trash2,
  Edit,
  Shield,
  Ban,
  CheckCircle,
  RefreshCw,
  Eye,
  MapPin,
  Globe,
  Cpu,
  HardDrive,
  MemoryStick,
  Save,
  X,
} from "lucide-react";
import api from "@/utils/api";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { User, Node, Plan, AuditLog, Webhook as WebhookType } from "@/types";
import { formatDate, formatBytes, formatRelativeTime } from "@/utils/helpers";
type Tab = "users" | "nodes" | "plans" | "audit" | "webhooks" | "locations";
const AdminPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") || "users";
  const [activeTab, setActiveTab] = useState<Tab>(tabParam as Tab);
  useEffect(() => {
    setSearchParams({ tab: activeTab });
  }, [activeTab, setSearchParams]);
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { key: "nodes", label: "Nodes", icon: <Server className="w-4 h-4" /> },
    { key: "locations", label: "Locations", icon: <MapPin className="w-4 h-4" /> },
    { key: "plans", label: "Plans", icon: <CreditCard className="w-4 h-4" /> },
    {
      key: "audit",
      label: "Audit Logs",
      icon: <FileText className="w-4 h-4" />,
    },
    {
      key: "webhooks",
      label: "Webhooks",
      icon: <Webhook className="w-4 h-4" />,
    },
  ];
  return (
    <div className="space-y-6">
      {" "}
      <div>
        {" "}
        <h1 className="text-2xl font-bold">Admin Panel</h1>{" "}
        <p className="text-sm text-gray-500 mt-1">
          Manage your infrastructure
        </p>{" "}
      </div>{" "}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
        {" "}
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key ? "border-primary-600 text-primary-600 dark:text-primary-400" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {" "}
            {tab.icon}
            {tab.label}{" "}
          </button>
        ))}{" "}
      </div>{" "}
      {activeTab === "users" && <AdminUsers />}{" "}
      {activeTab === "nodes" && <AdminNodes />}{" "}
      {activeTab === "plans" && <AdminPlans />}{" "}
      {activeTab === "audit" && <AdminAudit />}{" "}
      {activeTab === "webhooks" && <AdminWebhooks />}{" "}
      {activeTab === "locations" && <AdminLocations />}{" "}
    </div>
  );
};
const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as string,
  });
  const fetch = async () => {
    try {
      const res = await api.get("/admin/users");
      setUsers(Array.isArray(res.data) ? res.data : res.data.users || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetch();
  }, []);
  const handleCreate = async () => {
    try {
      await api.post("/admin/users", form);
      toast.success("User created");
      setShowCreateModal(false);
      setForm({ name: "", email: "", password: "", role: "user" });
      fetch();
    } catch {}
  };
  const handleToggleSuspend = async (id: string) => {
    try {
      await api.post(`/admin/users/${id}/toggle-suspend`);
      toast.success("User status updated");
      fetch();
    } finally {
      setSuspendId(null);
    }
  };
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="space-y-4">
      {" "}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Create User
        </button>
      </div>{" "}
      <DataTable
        columns={[
          {
            key: "name",
            header: "Name",
            sortable: true,
            searchable: true,
            render: (u: User) => <span className="font-medium">{u.name}</span>,
          },
          { key: "email", header: "Email", sortable: true, searchable: true },
          {
            key: "role",
            header: "Role",
            render: (u: User) => (
              <span
                className={`capitalize px-2 py-0.5 text-xs rounded-full ${u.role === "admin" ? "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400" : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"}`}
              >
                {u.role}
              </span>
            ),
          },
          {
            key: "createdAt",
            header: "Joined",
            render: (u: User) => formatDate(u.createdAt),
          },
          {
            key: "actions",
            header: "Actions",
            render: (u: User) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                {" "}
                <button onClick={() => {}} className="btn-ghost p-1.5">
                  <Edit className="w-4 h-4" />
                </button>{" "}
                <button
                  onClick={() => setSuspendId(u.id)}
                  className="btn-ghost p-1.5"
                >
                  <Ban className="w-4 h-4 text-red-500" />
                </button>{" "}
              </div>
            ),
          },
        ]}
        data={users}
        keyExtractor={(u) => u.id}
      />{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create User"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div>
            <label className="label-field">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
            />
          </div>{" "}
          <div>
            <label className="label-field">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
          </div>{" "}
          <div>
            <label className="label-field">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="input-field"
            />
          </div>{" "}
          <div>
            <label className="label-field">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="input-field"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>{" "}
        </div>{" "}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => setShowCreateModal(false)}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button onClick={handleCreate} className="btn-primary">
            Create
          </button>
        </div>{" "}
      </Modal>{" "}
      <ConfirmDialog
        isOpen={!!suspendId}
        onClose={() => setSuspendId(null)}
        onConfirm={() => handleToggleSuspend(suspendId!)}
        title="Toggle User Status"
        message="Suspend or unsuspend this user?"
        confirmText="Confirm"
      />{" "}
    </div>
  );
};
const AdminNodes: React.FC = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: "",
    type: "DOCKER" as string,
    authType: "password" as string,
    credentials: "",
    locationId: "",
    region: "",
    description: "",
  });
  const fetch = async () => {
    try {
      const [res, locRes] = await Promise.all([
        api.get("/nodes"),
        api.get("/locations").catch(() => ({ data: [] })),
      ]);
      setNodes(Array.isArray(res.data) ? res.data : res.data.nodes || []);
      setLocations(Array.isArray(locRes.data) ? locRes.data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetch(); }, []);
  const resetForm = () => setForm({ name: "", host: "", port: "", type: "DOCKER", authType: "password", credentials: "", locationId: "", region: "", description: "" });
  const handleCreate = async () => {
    try {
      const payload: any = { name: form.name, host: form.host, type: form.type, authType: form.authType, region: form.region || undefined, description: form.description || undefined };
      if (form.port) payload.port = form.port;
      if (form.credentials) payload.credentials = form.credentials;
      if (form.locationId) payload.locationId = form.locationId;
      await api.post("/nodes", payload);
      toast.success("Node added");
      setShowCreateModal(false);
      resetForm();
      fetch();
    } catch {}
  };
  const handleEdit = async () => {
    if (!editingNode) return;
    try {
      const payload: any = {};
      if (form.name !== editingNode.name) payload.name = form.name;
      if (form.host !== editingNode.host) payload.host = form.host;
      if (form.port && parseInt(form.port) !== editingNode.port) payload.port = parseInt(form.port);
      if (form.type !== editingNode.type) payload.type = form.type;
      if (form.authType !== editingNode.authType) payload.authType = form.authType;
      if (form.credentials) payload.credentials = form.credentials;
      if (form.locationId !== (editingNode as any).locationId) payload.locationId = form.locationId || null;
      if (form.region !== editingNode.region) payload.region = form.region || null;
      if (form.description !== editingNode.description) payload.description = form.description || null;
      await api.put(`/nodes/${editingNode.id}`, payload);
      toast.success("Node updated");
      setEditingNode(null);
      resetForm();
      fetch();
    } catch {}
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/nodes/${deleteId}`);
      toast.success("Node removed");
      setDeleteId(null);
      fetch();
    } catch {}
  };
  const handleHealthCheck = async (id: string) => {
    try {
      await api.post(`/nodes/${id}/health`);
      toast.success("Health check initiated");
    } catch {}
  };
  const openEdit = (n: Node) => {
    setEditingNode(n);
    setForm({
      name: n.name,
      host: n.host,
      port: String(n.port || ""),
      type: n.type,
      authType: n.authType || "password",
      credentials: "",
      locationId: (n as any).locationId || "",
      region: n.region || "",
      description: n.description || "",
    });
  };
  const renderBar = (used: number | null | undefined, total: number | null | undefined, unit: string = "") => {
    const u = used || 0;
    const t = total || 1;
    const pct = Math.min(100, Math.round((u / t) * 100));
    const color = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : "bg-primary-500";
    return (
      <div className="flex items-center gap-2 text-xs">
        <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-gray-500 w-20 text-right">{formatBytes(u)} / {formatBytes(t)}</span>
      </div>
    );
  };
  const columns = [
    { key: "name", header: "Name", sortable: true, searchable: true, render: (n: Node) => <span className="font-medium">{n.name}</span> },
    { key: "host", header: "Host", render: (n: Node) => <span className="font-mono text-xs">{n.host}:{n.port}</span> },
    { key: "type", header: "Type", render: (n: Node) => <span className="uppercase text-xs font-bold">{n.type}</span> },
    { key: "location", header: "Location", render: (n: any) => n.location?.name || n.region || "-" },
    { key: "status", header: "Status", render: (n: Node) => <StatusBadge status={n.status} /> },
    { key: "cpu", header: "CPU", render: (n: Node) => n.cpuCores ? <span className="text-xs">{n.cpuUsage != null ? `${Math.round(n.cpuUsage)}%` : `${n.cpuCores} cores`}</span> : "-" },
    { key: "ram", header: "RAM", render: (n: Node) => renderBar(n.ramUsed, n.ramTotal) },
    { key: "storage", header: "Storage", render: (n: Node) => renderBar(n.storageUsed, n.storageTotal) },
    {
      key: "actions", header: "Actions", render: (n: Node) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => handleHealthCheck(n.id)} className="btn-ghost p-1.5" title="Health Check"><Activity className="w-4 h-4 text-green-500" /></button>
          <button onClick={() => openEdit(n)} className="btn-ghost p-1.5" title="Edit"><Edit className="w-4 h-4" /></button>
          <button onClick={() => setDeleteId(n.id)} className="btn-ghost p-1.5 text-red-500" title="Remove"><Trash2 className="w-4 h-4" /></button>
        </div>
      ),
    },
  ];
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Add Node</button>
      </div>
      <DataTable columns={columns} data={nodes} keyExtractor={(n: Node) => n.id} />
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add Node" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="my-server-1" />
            </div>
            <div>
              <label className="label-field">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="DOCKER">Docker</option>
                <option value="PROXMOX">Proxmox VE</option>
                <option value="AGENT">Node Agent</option>
              </select>
            </div>
            <div>
              <label className="label-field">Host</label>
              <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="input-field" placeholder="192.168.1.100" />
            </div>
            <div>
              <label className="label-field">Port</label>
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className="input-field" placeholder="Auto: Docker=2375, Proxmox=8006, Agent=4000" />
            </div>
            <div>
              <label className="label-field">Auth Type</label>
              <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })} className="input-field">
                <option value="password">Password</option>
                <option value="key">API Key / Token</option>
              </select>
            </div>
            <div>
              <label className="label-field">Credentials</label>
              <input type="password" value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })} className="input-field" placeholder="Password or API token" />
            </div>
            <div>
              <label className="label-field">Location</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="input-field">
                <option value="">No location</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}{l.city ? ` (${l.city})` : ''}{l.country ? `, ${l.country}` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">Region</label>
              <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input-field" placeholder="us-east-1" />
            </div>
          </div>
          <div>
            <label className="label-field">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} placeholder="Optional description" />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} className="btn-primary" disabled={!form.name || !form.host}>Add Node</button>
        </div>
      </Modal>
      <Modal isOpen={!!editingNode} onClose={() => setEditingNode(null)} title="Edit Node" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="label-field">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input-field">
                <option value="DOCKER">Docker</option>
                <option value="PROXMOX">Proxmox VE</option>
                <option value="AGENT">Node Agent</option>
              </select>
            </div>
            <div>
              <label className="label-field">Host</label>
              <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="label-field">Port</label>
              <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="label-field">Auth Type</label>
              <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })} className="input-field">
                <option value="password">Password</option>
                <option value="key">API Key / Token</option>
              </select>
            </div>
            <div>
              <label className="label-field">New Credentials</label>
              <input type="password" value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })} className="input-field" placeholder="Leave blank to keep current" />
            </div>
            <div>
              <label className="label-field">Location</label>
              <select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })} className="input-field">
                <option value="">No location</option>
                {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label-field">Region</label>
              <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input-field" />
            </div>
          </div>
          <div>
            <label className="label-field">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field" rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setEditingNode(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleEdit} className="btn-primary">Save</button>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Remove Node" message="This will remove the node and all its resources from the panel." confirmText="Remove" />
    </div>
  );
};
const AdminPlans: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    price: 0,
    currency: "USD",
    interval: "monthly" as string,
    popular: false,
    features: {
      vms: 1,
      containers: 1,
      docker: 1,
      cpuCores: 1,
      ram: 1024,
      disk: 20,
      bandwidth: 1000,
      backups: 1,
      snapshots: 1,
    },
  });
  const fetch = async () => {
    try {
      const res = await api.get("/plans");
      setPlans(Array.isArray(res.data) ? res.data : res.data.plans || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetch();
  }, []);
  const handleCreate = async () => {
    try {
      await api.post("/plans", form);
      toast.success("Plan created");
      setShowCreateModal(false);
      fetch();
    } catch {}
  };
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="space-y-4">
      {" "}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Create Plan
        </button>
      </div>{" "}
      <DataTable
        columns={[
          {
            key: "name",
            header: "Name",
            sortable: true,
            render: (p: Plan) => <span className="font-medium">{p.name}</span>,
          },
          {
            key: "price",
            header: "Price",
            render: (p: Plan) => `$${p.price}/${p.interval ?? "mo"}`,
          },
          {
            key: "featuresVms",
            header: "VMs",
            render: (p: Plan) => p.features?.vms ?? 0,
          },
          {
            key: "featuresCpu",
            header: "CPU",
            render: (p: Plan) => p.features?.cpuCores ?? 0,
          },
          {
            key: "featuresRam",
            header: "RAM",
            render: (p: Plan) => `${((p.features?.ram ?? 0) / 1024).toFixed(0)}GB`,
          },
          {
            key: "popular",
            header: "Popular",
            render: (p: Plan) =>
              p.popular ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
              ) : (
                "-"
              ),
          },
          {
            key: "active",
            header: "Status",
            render: (p: Plan) => (
              <StatusBadge status={p.active ? "active" : "inactive"} />
            ),
          },
          {
            key: "actions",
            header: "Actions",
            render: (p: Plan) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                {" "}
                <button className="btn-ghost p-1.5">
                  <Edit className="w-4 h-4" />
                </button>{" "}
              </div>
            ),
          },
        ]}
        data={plans}
        keyExtractor={(p) => p.id}
      />{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Plan"
        size="lg"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-field">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label className="label-field">Price</label>
              <input
                type="number"
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: parseFloat(e.target.value) })
                }
                className="input-field"
                step="0.01"
              />
            </div>
          </div>{" "}
          <div>
            <label className="label-field">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="input-field"
            />
          </div>{" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div>
              <label className="label-field">Interval</label>
              <select
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value })}
                className="input-field"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>{" "}
            <div>
              <label className="label-field">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="input-field"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>{" "}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.popular}
                  onChange={(e) =>
                    setForm({ ...form, popular: e.target.checked })
                  }
                  className="rounded border-gray-300 text-primary-600"
                />
                <span className="text-sm">Popular</span>
              </label>
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div>
              <label className="label-field">Max VMs</label>
              <input
                type="number"
                value={form.features.vms}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      vms: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">Max Containers</label>
              <input
                type="number"
                value={form.features.containers}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      containers: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">Docker</label>
              <input
                type="number"
                value={form.features.docker}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      docker: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div>
              <label className="label-field">CPU Cores</label>
              <input
                type="number"
                value={form.features.cpuCores}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      cpuCores: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">RAM (MB)</label>
              <input
                type="number"
                value={form.features.ram}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      ram: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">Disk (GB)</label>
              <input
                type="number"
                value={form.features.disk}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      disk: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div>
              <label className="label-field">Bandwidth (GB)</label>
              <input
                type="number"
                value={form.features.bandwidth}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      bandwidth: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">Backups</label>
              <input
                type="number"
                value={form.features.backups}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      backups: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">Snapshots</label>
              <input
                type="number"
                value={form.features.snapshots}
                onChange={(e) =>
                  setForm({
                    ...form,
                    features: {
                      ...form.features,
                      snapshots: parseInt(e.target.value),
                    },
                  })
                }
                className="input-field"
              />
            </div>{" "}
          </div>{" "}
        </div>{" "}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => setShowCreateModal(false)}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button onClick={handleCreate} className="btn-primary">
            Create Plan
          </button>
        </div>{" "}
      </Modal>{" "}
    </div>
  );
};
const AdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/audit")
      .then((res) => {
        setLogs(Array.isArray(res.data) ? res.data : res.data.logs || []);
      })
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <DataTable
      columns={[
        {
          key: "createdAt",
          header: "Time",
          sortable: true,
          render: (l: AuditLog) => (
            <span className="text-xs">{formatRelativeTime(l.createdAt)}</span>
          ),
        },
        {
          key: "user",
          header: "User",
          render: (l: AuditLog) =>
            (l.user as any)?.name || (l.user as any)?.email || "System",
        },
        { key: "action", header: "Action", sortable: true, searchable: true },
        {
          key: "resourceType",
          header: "Type",
          render: (l: AuditLog) => (
            <span className="capitalize text-xs">{l.resourceType}</span>
          ),
        },
        {
          key: "resource",
          header: "Resource",
          render: (l: AuditLog) => l.resource,
        },
        {
          key: "details",
          header: "Details",
          render: (l: AuditLog) => l.details || "-",
        },
        {
          key: "ip",
          header: "IP",
          render: (l: AuditLog) => (
            <span className="font-mono text-xs">{l.ip || "-"}</span>
          ),
        },
      ]}
      data={logs}
      keyExtractor={(l) => l.id}
      pageSize={25}
    />
  );
};
const AdminWebhooks: React.FC = () => {
  const [webhooks, setWebhooks] = useState<WebhookType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    url: "",
    events: [] as string[],
    active: true,
  });
  const fetch = async () => {
    try {
      const res = await api.get("/webhooks");
      setWebhooks(Array.isArray(res.data) ? res.data : res.data.webhooks || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetch();
  }, []);
  const handleCreate = async () => {
    try {
      await api.post("/webhooks", form);
      toast.success("Webhook created");
      setShowCreateModal(false);
      setForm({ name: "", url: "", events: [], active: true });
      fetch();
    } catch {}
  };
  const handleToggle = async (id: string, active: boolean) => {
    try {
      await api.patch(`/webhooks/${id}`, { active: !active });
      toast.success("Webhook updated");
      fetch();
    } catch {}
  };
  const eventOptions = [
    "vm.created",
    "vm.started",
    "vm.stopped",
    "vm.deleted",
    "container.created",
    "container.started",
    "container.stopped",
    "backup.completed",
    "backup.failed",
    "alert.triggered",
  ];
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="space-y-4">
      {" "}
      <div className="flex justify-end">
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Add Webhook
        </button>
      </div>{" "}
      {webhooks.length > 0 ? (
        <DataTable
          columns={[
            {
              key: "name",
              header: "Name",
              sortable: true,
              render: (w: WebhookType) => (
                <span className="font-medium">{w.name}</span>
              ),
            },
            {
              key: "url",
              header: "URL",
              render: (w: WebhookType) => (
                <span className="text-xs font-mono">{w.url}</span>
              ),
            },
            {
              key: "events",
              header: "Events",
              render: (w: WebhookType) => (
                <span className="text-xs">{w.events?.length || 0} events</span>
              ),
            },
            {
              key: "lastTriggered",
              header: "Last Trigger",
              render: (w: WebhookType) =>
                w.lastTriggered ? formatRelativeTime(w.lastTriggered) : "Never",
            },
            {
              key: "active",
              header: "Status",
              render: (w: WebhookType) => (
                <StatusBadge status={w.active ? "active" : "inactive"} />
              ),
            },
            {
              key: "actions",
              header: "Actions",
              render: (w: WebhookType) => (
                <div
                  className="flex gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {" "}
                  <button
                    onClick={() => handleToggle(w.id, w.active ?? false)}
                    className="btn-ghost p-1.5"
                  >
                    {w.active ? (
                      <Eye className="w-4 h-4 text-orange-500" />
                    ) : (
                      <Eye className="w-4 h-4 text-green-500" />
                    )}
                  </button>{" "}
                  <button className="btn-ghost p-1.5 text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>{" "}
                </div>
              ),
            },
          ]}
          data={webhooks}
          keyExtractor={(w) => w.id}
        />
      ) : (
        <EmptyState
          icon={Webhook}
          title="No webhooks"
          description="Create webhooks to integrate with external services."
          action={{
            label: "Add Webhook",
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add Webhook"
        size="lg"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div>
            <label className="label-field">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
            />
          </div>{" "}
          <div>
            <label className="label-field">URL</label>
            <input
              type="text"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="input-field"
              placeholder="https://hooks.example.com/webhook"
            />
          </div>{" "}
          <div>
            <label className="label-field">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {" "}
              {eventOptions.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setForm({ ...form, events: [...form.events, ev] });
                      else
                        setForm({
                          ...form,
                          events: form.events.filter((f) => f !== ev),
                        });
                    }}
                    className="rounded border-gray-300 text-primary-600"
                  />
                  {ev}
                </label>
              ))}{" "}
            </div>
          </div>{" "}
        </div>{" "}
        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={() => setShowCreateModal(false)}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button onClick={handleCreate} className="btn-primary">
            Create Webhook
          </button>
        </div>{" "}
      </Modal>{" "}
    </div>
  );
};
const AdminLocations: React.FC = () => {
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", city: "", country: "", datacenter: "", region: "", notes: "" });
  const fetch = async () => {
    try {
      const res = await api.get("/locations");
      setLocations(Array.isArray(res.data) ? res.data : []);
    } catch {
    } finally { setLoading(false); }
  };
  useEffect(() => { fetch(); }, []);
  const resetForm = () => setForm({ name: "", city: "", country: "", datacenter: "", region: "", notes: "" });
  const handleCreate = async () => {
    try {
      await api.post("/locations", form);
      toast.success("Location created");
      setShowCreateModal(false); resetForm(); fetch();
    } catch {}
  };
  const handleEdit = async () => {
    if (!editing) return;
    try {
      await api.put(`/locations/${editing.id}`, form);
      toast.success("Location updated");
      setEditing(null); resetForm(); fetch();
    } catch {}
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/locations/${deleteId}`);
      toast.success("Location deleted");
      setDeleteId(null); fetch();
    } catch {}
  };
  const openEdit = (loc: any) => {
    setEditing(loc);
    setForm({ name: loc.name, city: loc.city || "", country: loc.country || "", datacenter: loc.datacenter || "", region: loc.region || "", notes: loc.notes || "" });
  };
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="btn-primary"><Plus className="w-4 h-4" /> Add Location</button>
      </div>
      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title="No locations" description="Add locations to organize your infrastructure." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => (
            <div key={loc.id} className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary-500" />
                  <h3 className="font-semibold">{loc.name}</h3>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(loc)} className="btn-ghost p-1"><Edit className="w-3 h-3" /></button>
                  <button onClick={() => setDeleteId(loc.id)} className="btn-ghost p-1 text-red-500"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                {loc.city && <span className="block">{loc.city}{loc.country ? `, ${loc.country}` : ''}</span>}
                {loc.datacenter && <span className="block">DC: {loc.datacenter}</span>}
                {loc.region && <span className="block font-mono">{loc.region}</span>}
                {loc.notes && <span className="block italic">{loc.notes}</span>}
              </div>
              <div className="text-xs text-primary-500 font-semibold pt-1 border-t border-gray-100 dark:border-gray-700">
                {loc._count?.nodes || 0} node{(loc._count?.nodes || 0) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add Location" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label-field">Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="US-East-1a" />
          </div>
          <div>
            <label className="label-field">City</label>
            <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input-field" placeholder="Ashburn" />
          </div>
          <div>
            <label className="label-field">Country</label>
            <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="input-field" placeholder="USA" />
          </div>
          <div>
            <label className="label-field">Datacenter</label>
            <input type="text" value={form.datacenter} onChange={(e) => setForm({ ...form, datacenter: e.target.value })} className="input-field" placeholder="Equinix-DC1" />
          </div>
          <div>
            <label className="label-field">Region</label>
            <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input-field" placeholder="us-east-1" />
          </div>
          <div className="col-span-2">
            <label className="label-field">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setShowCreateModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleCreate} className="btn-primary" disabled={!form.name}>Create</button>
        </div>
      </Modal>
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit Location" size="lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label-field">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="label-field">City</label>
            <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="label-field">Country</label>
            <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="label-field">Datacenter</label>
            <input type="text" value={form.datacenter} onChange={(e) => setForm({ ...form, datacenter: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="label-field">Region</label>
            <input type="text" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="input-field" />
          </div>
          <div className="col-span-2">
            <label className="label-field">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field" rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleEdit} className="btn-primary">Save</button>
        </div>
      </Modal>
      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Location" message="This will remove the location. Nodes assigned to this location will not be deleted." confirmText="Delete" />
    </div>
  );
};
export default AdminPage;
