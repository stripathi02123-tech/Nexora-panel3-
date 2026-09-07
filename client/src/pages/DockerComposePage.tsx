import React, { useState, useEffect } from "react";
import { Play, Square, Trash2, Plus, FileCode, Eye } from "lucide-react";
import api from "@/utils/api";
import DataTable from "@/components/ui/DataTable";
import StatusBadge from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { DockerCompose } from "@/types";
import { formatDate } from "@/utils/helpers";
const DockerComposePage: React.FC = () => {
  const [stacks, setStacks] = useState<DockerCompose[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewYaml, setViewYaml] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", yaml: "", nodeId: "" });
  const [nodes, setNodes] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const fetch = async () => {
    try {
      const [sRes, nRes] = await Promise.allSettled([
        api.get("/docker/compose"),
        api.get("/nodes?type=docker"),
      ]);
      if (sRes.status === "fulfilled")
        setStacks(
          Array.isArray(sRes.value.data)
            ? sRes.value.data
            : sRes.value.data.stacks || [],
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
  const handleAction = async (id: string, action: string) => {
    try {
      await api.post(`/docker/compose/${id}/${action}`);
      toast.success(`Stack ${action}ed`);
      fetch();
    } catch {}
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/docker/compose/${deleteId}`);
      toast.success("Stack deleted");
      setDeleteId(null);
      fetch();
    } catch {}
  };
  const handleCreate = async () => {
    if (!form.name || !form.yaml) return;
    setCreating(true);
    try {
      await api.post("/docker/compose", form);
      toast.success("Stack created");
      setShowCreateModal(false);
      setForm({ name: "", yaml: "", nodeId: "" });
      fetch();
    } catch {
    } finally {
      setCreating(false);
    }
  };
  const columns = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      searchable: true,
      render: (s: DockerCompose) => (
        <span className="font-medium">{s.name}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (s: DockerCompose) => <StatusBadge status={s.status} />,
    },
    {
      key: "services",
      header: "Services",
      render: (s: DockerCompose) => s.services || 0,
    },
    {
      key: "node",
      header: "Node",
      render: (s: DockerCompose) => (s.node as any)?.name || "-",
    },
    {
      key: "createdAt",
      header: "Created",
      render: (s: DockerCompose) => formatDate(s.createdAt),
    },
    {
      key: "actions",
      header: "Actions",
      render: (s: DockerCompose) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {" "}
          {s.status === "running" ? (
            <button
              onClick={() => handleAction(s.id, "stop")}
              className="btn-ghost p-1.5"
            >
              <Square className="w-4 h-4 text-red-500" />
            </button>
          ) : (
            <button
              onClick={() => handleAction(s.id, "start")}
              className="btn-ghost p-1.5"
            >
              <Play className="w-4 h-4 text-green-500" />
            </button>
          )}{" "}
          <button
            onClick={() => setViewYaml(s.yaml)}
            className="btn-ghost p-1.5"
          >
            <FileCode className="w-4 h-4" />
          </button>{" "}
          <button
            onClick={() => setDeleteId(s.id)}
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
          <h1 className="text-2xl font-bold">Docker Compose</h1>{" "}
          <p className="text-sm text-gray-500 mt-1">
            Manage your Docker Compose stacks
          </p>{" "}
        </div>{" "}
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Create Stack
        </button>{" "}
      </div>{" "}
      {stacks.length > 0 ? (
        <DataTable
          columns={columns}
          data={stacks}
          keyExtractor={(s) => s.id}
          pageSize={20}
        />
      ) : (
        <EmptyState
          icon={FileCode}
          title="No stacks"
          description="Create a Docker Compose stack from YAML."
          action={{
            label: "Create Stack",
            onClick: () => setShowCreateModal(true),
          }}
        />
      )}{" "}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Compose Stack"
        size="xl"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div>
            {" "}
            <label className="label-field">Stack Name</label>{" "}
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="input-field"
              placeholder="my-stack"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">Node</label>{" "}
            <select
              value={form.nodeId}
              onChange={(e) => setForm({ ...form, nodeId: e.target.value })}
              className="input-field"
            >
              {" "}
              <option value="">Select node...</option>{" "}
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}{" "}
            </select>{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">docker-compose.yml</label>{" "}
            <textarea
              value={form.yaml}
              onChange={(e) => setForm({ ...form, yaml: e.target.value })}
              className="input-field font-mono text-xs"
              rows={12}
              placeholder="version: '3'"
            />{" "}
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
          <button
            onClick={handleCreate}
            disabled={creating}
            className="btn-primary"
          >
            {creating ? "Creating..." : "Create Stack"}
          </button>{" "}
        </div>{" "}
      </Modal>{" "}
      <Modal
        isOpen={!!viewYaml}
        onClose={() => setViewYaml(null)}
        title="Compose YAML"
        size="xl"
      >
        {" "}
        <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto text-xs font-mono max-h-96 whitespace-pre-wrap">
          {viewYaml}
        </pre>{" "}
      </Modal>{" "}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Stack"
        message="This will stop and remove the stack."
        confirmText="Delete"
      />{" "}
    </div>
  );
};
export default DockerComposePage;
