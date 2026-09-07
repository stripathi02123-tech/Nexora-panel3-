import React, { useState, useEffect } from "react";
import { Trash2, Download, Plus, Upload } from "lucide-react";
import api from "@/utils/api";
import DataTable from "@/components/ui/DataTable";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import toast from "react-hot-toast";
import { DockerImage } from "@/types";
import { formatBytes, formatDate } from "@/utils/helpers";
const DockerImagesPage: React.FC = () => {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPullModal, setShowPullModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pullForm, setPullForm] = useState({ repository: "", tag: "latest" });
  const [pulling, setPulling] = useState(false);
  const fetch = async () => {
    try {
      const res = await api.get("/docker/images");
      setImages(Array.isArray(res.data) ? res.data : res.data.images || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetch();
  }, []);
  const handlePull = async () => {
    if (!pullForm.repository) return;
    setPulling(true);
    try {
      await api.post("/docker/images/pull", pullForm);
      toast.success("Image pulled successfully");
      setShowPullModal(false);
      setPullForm({ repository: "", tag: "latest" });
      fetch();
    } catch {
    } finally {
      setPulling(false);
    }
  };
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/docker/images/${deleteId}`);
      toast.success("Image deleted");
      setDeleteId(null);
      fetch();
    } catch {}
  };
  const columns = [
    {
      key: "repository",
      header: "Repository",
      sortable: true,
      searchable: true,
      render: (img: DockerImage) => (
        <span className="font-medium">{img.repository}</span>
      ),
    },
    {
      key: "tag",
      header: "Tag",
      render: (img: DockerImage) => (
        <span className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full">
          {img.tag}
        </span>
      ),
    },
    {
      key: "size",
      header: "Size",
      sortable: true,
      render: (img: DockerImage) => formatBytes(img.size),
    },
    {
      key: "containers",
      header: "Containers",
      sortable: true,
      render: (img: DockerImage) => img.containers || 0,
    },
    {
      key: "created",
      header: "Created",
      sortable: true,
      render: (img: DockerImage) => formatDate(img.created),
    },
    {
      key: "actions",
      header: "Actions",
      render: (img: DockerImage) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {" "}
          <button
            onClick={() => setDeleteId(img.id)}
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
          <h1 className="text-2xl font-bold">Docker Images</h1>{" "}
          <p className="text-sm text-gray-500 mt-1">
            Manage your Docker images
          </p>{" "}
        </div>{" "}
        <button onClick={() => setShowPullModal(true)} className="btn-primary">
          <Download className="w-4 h-4" /> Pull Image
        </button>{" "}
      </div>{" "}
      {images.length > 0 ? (
        <DataTable
          columns={columns}
          data={images}
          keyExtractor={(i) => i.id}
          pageSize={20}
        />
      ) : (
        <EmptyState
          icon={Download}
          title="No images"
          description="Pull an image from a registry to get started."
          action={{
            label: "Pull Image",
            onClick: () => setShowPullModal(true),
          }}
        />
      )}{" "}
      <Modal
        isOpen={showPullModal}
        onClose={() => setShowPullModal(false)}
        title="Pull Docker Image"
      >
        {" "}
        <div className="space-y-4">
          {" "}
          <div>
            {" "}
            <label className="label-field">Image Repository</label>{" "}
            <input
              type="text"
              value={pullForm.repository}
              onChange={(e) =>
                setPullForm({ ...pullForm, repository: e.target.value })
              }
              className="input-field"
              placeholder="e.g., nginx, ubuntu, node"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">Tag</label>{" "}
            <input
              type="text"
              value={pullForm.tag}
              onChange={(e) =>
                setPullForm({ ...pullForm, tag: e.target.value })
              }
              className="input-field"
              placeholder="latest"
            />{" "}
          </div>{" "}
        </div>{" "}
        <div className="flex justify-end gap-3 mt-4">
          {" "}
          <button
            onClick={() => setShowPullModal(false)}
            className="btn-secondary"
          >
            Cancel
          </button>{" "}
          <button
            onClick={handlePull}
            disabled={pulling}
            className="btn-primary"
          >
            {pulling ? "Pulling..." : "Pull Image"}
          </button>{" "}
        </div>{" "}
      </Modal>{" "}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Image"
        message="This will permanently remove the image."
        confirmText="Delete"
      />{" "}
    </div>
  );
};
export default DockerImagesPage;
