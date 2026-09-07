import React, { useState, useEffect } from "react";
import { Plus, Trash2, Globe } from "lucide-react";
import api from "@/utils/api";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { Network } from "@/types";
import { formatDate } from "@/utils/helpers";
const NetworkPage: React.FC = () => {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: "",
    nodeId: "",
    type: "bridge" as string,
    subnet: "",
    gateway: "",
    dns: "",
    vlanId: undefined as number | undefined,
    mtu: 1500,
    dhcp: true,
    dhcpStart: "",
    dhcpEnd: "",
  });
  const fetch = async () => {
    try {
      const [nwRes, nRes] = await Promise.allSettled([
        api.get("/networks"),
        api.get("/nodes"),
      ]);
      if (nwRes.status === "fulfilled")
        setNetworks(
          Array.isArray(nwRes.value.data)
            ? nwRes.value.data
            : nwRes.value.data.networks || [],
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
  const handleCreate = async () => {
    try {
      await api.post("/networks", form);
      toast.success("Network created");
      setShowCreateModal(false);
      setForm({
        name: "",
        nodeId: "",
        type: "bridge",
        subnet: "",
        gateway: "",
        dns: "",
        vlanId: undefined,
        mtu: 1500,
        dhcp: true,
        dhcpStart: "",
        dhcpEnd: "",
      });
      fetch();
    } catch {}
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/networks/${deleteId}`);
      toast.success("Network deleted");
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
      render: (n: Network) => <span className="font-medium">{n.name}</span>,
    },
    {
      key: "type",
      header: "Type",
      sortable: true,
      render: (n: Network) => (
        <span className="uppercase text-xs font-bold">{n.type}</span>
      ),
    },
    {
      key: "subnet",
      header: "Subnet",
      render: (n: Network) => (
        <span className="font-mono text-xs">{n.subnet}</span>
      ),
    },
    {
      key: "gateway",
      header: "Gateway",
      render: (n: Network) => (
        <span className="font-mono text-xs">{n.gateway || "-"}</span>
      ),
    },
    { key: "vlanId", header: "VLAN", render: (n: Network) => n.vlanId ?? "-" },
    { key: "mtu", header: "MTU", render: (n: Network) => n.mtu },
    {
      key: "node",
      header: "Node",
      render: (n: Network) => (n.node as any)?.name || "-",
    },
    {
      key: "createdAt",
      header: "Created",
      render: (n: Network) => formatDate(n.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      render: (n: Network) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {" "}
          <button
            onClick={() => setDeleteId(n.id)}
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
          <h1 className="text-2xl font-bold">Networks</h1>{" "}
          <p className="text-sm text-gray-500 mt-1">
            Manage virtual networks
          </p>{" "}
        </div>{" "}
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Create Network
        </button>{" "}
      </div>{" "}
      {networks.length > 0 ? (
        <DataTable
          columns={columns}
          data={networks}
          keyExtractor={(n) => n.id}
          pageSize={20}
        />
      ) : (
        <EmptyState
          icon={Globe}
          title="No networks"
          description="Create a network to connect your resources."
          action={{
            label: "Create Network",
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Network"
        size="lg"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div className="grid grid-cols-2 gap-4">
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
              <label className="label-field">Node</label>
              <select
                value={form.nodeId}
                onChange={(e) => setForm({ ...form, nodeId: e.target.value })}
                className="input-field"
              >
                <option value="">Select...</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              <label className="label-field">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="input-field"
              >
                <option value="bridge">Bridge</option>
                <option value="nat">NAT</option>
                <option value="host">Host</option>
                <option value="macvlan">Macvlan</option>
              </select>
            </div>{" "}
            <div>
              <label className="label-field">Subnet</label>
              <input
                type="text"
                value={form.subnet}
                onChange={(e) => setForm({ ...form, subnet: e.target.value })}
                className="input-field"
                placeholder="10.0.0.0/24"
              />
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-2 gap-4">
            {" "}
            <div>
              <label className="label-field">Gateway</label>
              <input
                type="text"
                value={form.gateway}
                onChange={(e) => setForm({ ...form, gateway: e.target.value })}
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">DNS</label>
              <input
                type="text"
                value={form.dns}
                onChange={(e) => setForm({ ...form, dns: e.target.value })}
                className="input-field"
              />
            </div>{" "}
          </div>{" "}
          <div className="grid grid-cols-3 gap-4">
            {" "}
            <div>
              <label className="label-field">VLAN ID</label>
              <input
                type="number"
                value={form.vlanId || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    vlanId: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className="input-field"
              />
            </div>{" "}
            <div>
              <label className="label-field">MTU</label>
              <input
                type="number"
                value={form.mtu}
                onChange={(e) =>
                  setForm({ ...form, mtu: parseInt(e.target.value) })
                }
                className="input-field"
              />
            </div>{" "}
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.dhcp}
                  onChange={(e) => setForm({ ...form, dhcp: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600"
                />
                <span className="text-sm">Enable DHCP</span>
              </label>
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
            Create Network
          </button>{" "}
        </div>{" "}
      </Modal>{" "}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Network"
        message="This will permanently remove the network."
        confirmText="Delete"
      />{" "}
    </div>
  );
};
export default NetworkPage;
