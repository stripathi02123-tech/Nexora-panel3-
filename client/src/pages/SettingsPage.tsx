import React, { useState, useEffect } from "react";
import {
  User,
  Lock,
  Key,
  Shield,
  Bell,
  Moon,
  Sun,
  Plus,
  Trash2,
  Copy,
  HardDrive,
} from "lucide-react";
import api from "@/utils/api";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/context/ThemeContext";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { SSHKey, ApiKey } from "@/types";
import { formatDate } from "@/utils/helpers";
type Tab =
  | "general"
  | "profile"
  | "security"
  | "ssh"
  | "api"
  | "notifications"
  | "appearance";
const COLOR_PRESETS = [
  { label: "Indigo", value: "#4f46e5" },
  { label: "Blue", value: "#2563eb" },
  { label: "Green", value: "#16a34a" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Orange", value: "#ea580c" },
  { label: "Red", value: "#dc2626" },
  { label: "Pink", value: "#db2777" },
  { label: "Teal", value: "#0d9488" },
];
const SettingsPage: React.FC = () => {
  const { user, updateUser } = useAuth();
  const { dark, toggleDark, appName, setAppName, primaryColor, setPrimaryColor, backgroundImageUrl, setBackgroundImageUrl } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [sshKeys, setSshKeys] = useState<SSHKey[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddSSH, setShowAddSSH] = useState(false);
  const [showAddApi, setShowAddApi] = useState(false);
  const [sshForm, setSshForm] = useState({ name: "", publicKey: "" });
  const [apiForm, setApiForm] = useState({ name: "" });
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    email: user?.email || "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [appNameInput, setAppNameInput] = useState(appName);
  const [customColorInput, setCustomColorInput] = useState(primaryColor);
  const [bgImageInput, setBgImageInput] = useState(backgroundImageUrl);
  useEffect(() => {
    setAppNameInput(appName);
  }, [appName]);
  useEffect(() => {
    setCustomColorInput(primaryColor);
  }, [primaryColor]);
  useEffect(() => {
    setBgImageInput(backgroundImageUrl);
  }, [backgroundImageUrl]);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [sshRes, apiRes] = await Promise.allSettled([
          api.get("/ssh-keys"),
          api.get("/api-keys"),
        ]);
        if (sshRes.status === "fulfilled")
          setSshKeys(
            Array.isArray(sshRes.value.data)
              ? sshRes.value.data
              : sshRes.value.data.keys || [],
          );
        if (apiRes.status === "fulfilled")
          setApiKeys(
            Array.isArray(apiRes.value.data)
              ? apiRes.value.data
              : apiRes.value.data.keys || [],
          );
      } catch {
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);
  const handleUpdateProfile = async () => {
    try {
      const res = await api.put("/auth/profile", profileForm);
      updateUser(res.data.user || res.data);
      toast.success("Profile updated");
    } catch {}
  };
  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await api.put("/auth/password", passwordForm);
      toast.success("Password changed");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch {}
  };
  const handleAddSSH = async () => {
    try {
      await api.post("/ssh-keys", sshForm);
      toast.success("SSH key added");
      setShowAddSSH(false);
      setSshForm({ name: "", publicKey: "" });
      const res = await api.get("/ssh-keys");
      setSshKeys(Array.isArray(res.data) ? res.data : res.data.keys || []);
    } catch {}
  };
  const handleDeleteSSH = async (id: string) => {
    try {
      await api.delete(`/ssh-keys/${id}`);
      toast.success("SSH key deleted");
      setSshKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {}
  };
  const handleCreateApi = async () => {
    try {
      const res = await api.post("/api-keys", apiForm);
      setShowNewKey(res.data.key || res.data.token);
      setApiForm({ name: "" });
      toast.success("API key created");
      const keysRes = await api.get("/api-keys");
      setApiKeys(
        Array.isArray(keysRes.data) ? keysRes.data : keysRes.data.keys || [],
      );
    } catch {}
  };
  const handleRevokeApi = async (id: string) => {
    try {
      await api.delete(`/api-keys/${id}`);
      toast.success("API key revoked");
      setApiKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {}
  };
  const handleSaveAppName = () => {
    setAppName(appNameInput.trim() || "Nexora Panel");
    toast.success("App name updated");
  };
  const handleApplyColor = (color: string) => {
    setPrimaryColor(color);
    setCustomColorInput(color);
    toast.success("Theme color updated");
  };
  const handleCustomColorApply = () => {
    const hex = customColorInput.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      handleApplyColor(hex);
    } else {
      toast.error("Enter a valid hex color (e.g. #4f46e5)");
    }
  };
  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "general", label: "General", icon: <HardDrive className="w-4 h-4" /> },
    { key: "profile", label: "Profile", icon: <User className="w-4 h-4" /> },
    { key: "security", label: "Security", icon: <Lock className="w-4 h-4" /> },
    { key: "ssh", label: "SSH Keys", icon: <Key className="w-4 h-4" /> },
    { key: "api", label: "API Keys", icon: <Shield className="w-4 h-4" /> },
    {
      key: "notifications",
      label: "Notifications",
      icon: <Bell className="w-4 h-4" />,
    },
    {
      key: "appearance",
      label: "Appearance",
      icon: dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />,
    },
  ];
  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  return (
    <div className="max-w-4xl space-y-6">
      {" "}
      <div>
        {" "}
        <h1 className="text-2xl font-bold">Settings</h1>{" "}
        <p className="text-sm text-gray-500 mt-1">
          Manage your account and panel settings
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
      {activeTab === "general" && (
        <div className="glass-card p-6 space-y-6 max-w-xl">
          {" "}
          <div>
            {" "}
            <h3 className="text-sm font-semibold mb-1">Panel Name</h3>{" "}
            <p className="text-xs text-gray-500 mb-3">
              This is displayed in the sidebar and throughout the panel.
            </p>{" "}
            <div className="flex items-center gap-3">
              {" "}
              <input
                type="text"
                value={appNameInput}
                onChange={(e) => setAppNameInput(e.target.value)}
                className="input-field flex-1"
                placeholder="e.g., Nexora Panel"
              />{" "}
              <button onClick={handleSaveAppName} className="btn-primary whitespace-nowrap">
                Save
              </button>{" "}
            </div>{" "}
            <div className="mt-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              {" "}
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: primaryColor }}
              >
                <HardDrive className="w-5 h-5 text-white" />
              </div>{" "}
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">Preview</p>
                <p className="text-sm text-gray-500">{appNameInput || "Nexora Panel"}</p>
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
      {activeTab === "profile" && (
        <div className="glass-card p-6 space-y-5 max-w-xl">
          {" "}
          <div>
            {" "}
            <label className="label-field">Full Name</label>{" "}
            <input
              type="text"
              value={profileForm.name}
              onChange={(e) =>
                setProfileForm({ ...profileForm, name: e.target.value })
              }
              className="input-field"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">Email</label>{" "}
            <input
              type="email"
              value={profileForm.email}
              onChange={(e) =>
                setProfileForm({ ...profileForm, email: e.target.value })
              }
              className="input-field"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">Avatar URL</label>{" "}
            <input
              type="text"
              defaultValue={user?.avatar || ""}
              className="input-field"
              placeholder="https://example.com/avatar.png"
            />{" "}
          </div>{" "}
          <button onClick={handleUpdateProfile} className="btn-primary">
            Save Changes
          </button>{" "}
        </div>
      )}{" "}
      {activeTab === "security" && (
        <div className="glass-card p-6 space-y-5 max-w-xl">
          {" "}
          <div>
            {" "}
            <label className="label-field">Current Password</label>{" "}
            <input
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({
                  ...passwordForm,
                  currentPassword: e.target.value,
                })
              }
              className="input-field"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">New Password</label>{" "}
            <input
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({
                  ...passwordForm,
                  newPassword: e.target.value,
                })
              }
              className="input-field"
            />{" "}
          </div>{" "}
          <div>
            {" "}
            <label className="label-field">Confirm New Password</label>{" "}
            <input
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({
                  ...passwordForm,
                  confirmPassword: e.target.value,
                })
              }
              className="input-field"
            />{" "}
          </div>{" "}
          <button onClick={handleChangePassword} className="btn-primary">
            Change Password
          </button>{" "}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            {" "}
            <h3 className="text-sm font-semibold mb-2">
              Two-Factor Authentication
            </h3>{" "}
            <p className="text-sm text-gray-500 mb-3">
              Add an extra layer of security to your account.
            </p>{" "}
            <button className="btn-secondary">
              <Shield className="w-4 h-4" />{" "}
              {user?.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
            </button>{" "}
          </div>{" "}
        </div>
      )}{" "}
      {activeTab === "ssh" && (
        <div className="space-y-4">
          {" "}
          <div className="flex justify-end">
            {" "}
            <button onClick={() => setShowAddSSH(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Add SSH Key
            </button>{" "}
          </div>{" "}
          {sshKeys.length > 0 ? (
            <div className="space-y-3">
              {" "}
              {sshKeys.map((key) => (
                <div
                  key={key.id}
                  className="glass-card p-4 flex items-center justify-between"
                >
                  {" "}
                  <div>
                    {" "}
                    <p className="text-sm font-medium">{key.name}</p>{" "}
                    <p className="text-xs text-gray-500 font-mono">
                      {key.fingerprint}
                    </p>{" "}
                  </div>{" "}
                  <button
                    onClick={() => handleDeleteSSH(key.id)}
                    className="btn-ghost p-1.5 text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>{" "}
                </div>
              ))}{" "}
            </div>
          ) : (
            <div className="glass-card p-8 text-center text-gray-400">
              No SSH keys added yet.
            </div>
          )}{" "}
          <Modal
            isOpen={showAddSSH}
            onClose={() => setShowAddSSH(false)}
            title="Add SSH Key"
            size="lg"
          >
            {" "}
            <div className="space-y-4">
              {" "}
              <div>
                <label className="label-field">Key Name</label>
                <input
                  type="text"
                  value={sshForm.name}
                  onChange={(e) =>
                    setSshForm({ ...sshForm, name: e.target.value })
                  }
                  className="input-field"
                  placeholder="e.g., My Laptop"
                />
              </div>{" "}
              <div>
                <label className="label-field">Public Key</label>
                <textarea
                  value={sshForm.publicKey}
                  onChange={(e) =>
                    setSshForm({ ...sshForm, publicKey: e.target.value })
                  }
                  className="input-field font-mono text-xs"
                  rows={6}
                  placeholder="ssh-rsa AAA..."
                />
              </div>{" "}
            </div>{" "}
            <div className="flex justify-end gap-3 mt-4">
              {" "}
              <button
                onClick={() => setShowAddSSH(false)}
                className="btn-secondary"
              >
                Cancel
              </button>{" "}
              <button onClick={handleAddSSH} className="btn-primary">
                Add Key
              </button>{" "}
            </div>{" "}
          </Modal>{" "}
        </div>
      )}{" "}
      {activeTab === "api" && (
        <div className="space-y-4">
          {" "}
          <div className="flex justify-end">
            {" "}
            <button onClick={() => setShowAddApi(true)} className="btn-primary">
              <Plus className="w-4 h-4" /> Generate API Key
            </button>{" "}
          </div>{" "}
          {showNewKey && (
            <div className="glass-card p-4 border-2 border-yellow-400">
              {" "}
              <p className="text-sm font-semibold text-yellow-600 mb-2">
                Save this key - it won't be shown again!
              </p>{" "}
              <div className="flex items-center gap-2">
                {" "}
                <code className="flex-1 p-2 bg-gray-900 text-green-400 rounded text-xs break-all">
                  {showNewKey}
                </code>{" "}
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(showNewKey);
                    toast.success("Copied!");
                  }}
                  className="btn-ghost p-1.5"
                >
                  <Copy className="w-4 h-4" />
                </button>{" "}
              </div>{" "}
            </div>
          )}{" "}
          {apiKeys.length > 0 ? (
            <div className="space-y-3">
              {" "}
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="glass-card p-4 flex items-center justify-between"
                >
                  {" "}
                  <div>
                    {" "}
                    <p className="text-sm font-medium">{key.name}</p>{" "}
                    <p className="text-xs text-gray-500 font-mono">
                      {key.prefix}... · Last used:{" "}
                      {key.lastUsed ? formatDate(key.lastUsed) : "Never"}
                    </p>{" "}
                  </div>{" "}
                  <button
                    onClick={() => handleRevokeApi(key.id)}
                    className="btn-ghost p-1.5 text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>{" "}
                </div>
              ))}{" "}
            </div>
          ) : (
            <div className="glass-card p-8 text-center text-gray-400">
              No API keys generated.
            </div>
          )}{" "}
          <Modal
            isOpen={showAddApi}
            onClose={() => setShowAddApi(false)}
            title="Generate API Key"
          >
            {" "}
            <div>
              <label className="label-field">Key Name</label>
              <input
                type="text"
                value={apiForm.name}
                onChange={(e) =>
                  setApiForm({ ...apiForm, name: e.target.value })
                }
                className="input-field"
                placeholder="e.g., CI/CD"
              />
            </div>{" "}
            <div className="flex justify-end gap-3 mt-4">
              {" "}
              <button
                onClick={() => setShowAddApi(false)}
                className="btn-secondary"
              >
                Cancel
              </button>{" "}
              <button onClick={handleCreateApi} className="btn-primary">
                Generate
              </button>{" "}
            </div>{" "}
          </Modal>{" "}
        </div>
      )}{" "}
      {activeTab === "notifications" && (
        <div className="glass-card p-6 space-y-4 max-w-xl">
          {" "}
          <h3 className="text-sm font-semibold">Email Notifications</h3>{" "}
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            {" "}
            <span className="text-sm">VM status changes</span>{" "}
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-gray-300 text-primary-600"
            />{" "}
          </label>{" "}
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            {" "}
            <span className="text-sm">Backup completion</span>{" "}
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-gray-300 text-primary-600"
            />{" "}
          </label>{" "}
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            {" "}
            <span className="text-sm">Resource usage alerts</span>{" "}
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-gray-300 text-primary-600"
            />{" "}
          </label>{" "}
          <label className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
            {" "}
            <span className="text-sm">Billing and invoices</span>{" "}
            <input
              type="checkbox"
              defaultChecked
              className="rounded border-gray-300 text-primary-600"
            />{" "}
          </label>{" "}
          <button className="btn-primary">Save Preferences</button>{" "}
        </div>
      )}{" "}
      {activeTab === "appearance" && (
        <div className="space-y-6 max-w-xl">
          {" "}
          <div className="glass-card p-6 space-y-4">
            {" "}
            <h3 className="text-sm font-semibold">Theme</h3>{" "}
            <div className="flex items-center gap-4">
              {" "}
              <button
                onClick={toggleDark}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all flex-1 ${!dark ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10" : "border-gray-200 dark:border-gray-700"}`}
              >
                {" "}
                <Sun className="w-5 h-5 text-orange-500" />{" "}
                <div className="text-left">
                  <p className="text-sm font-medium">Light</p>
                  <p className="text-xs text-gray-500">Light mode</p>
                </div>{" "}
              </button>{" "}
              <button
                onClick={toggleDark}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all flex-1 ${dark ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10" : "border-gray-200 dark:border-gray-700"}`}
              >
                {" "}
                <Moon className="w-5 h-5 text-blue-500" />{" "}
                <div className="text-left">
                  <p className="text-sm font-medium">Dark</p>
                  <p className="text-xs text-gray-500">Dark mode</p>
                </div>{" "}
              </button>{" "}
            </div>{" "}
          </div>{" "}
          <div className="glass-card p-6 space-y-4">
            {" "}
            <h3 className="text-sm font-semibold">Primary Color</h3>{" "}
            <p className="text-xs text-gray-500">
              Choose a brand color for the panel sidebar and accents.
            </p>{" "}
            <div className="flex flex-wrap gap-3">
              {" "}
              {COLOR_PRESETS.map((c) => {
                const isActiveColor = primaryColor === c.value;
                return (
                <button
                  key={c.value}
                  onClick={() => handleApplyColor(c.value)}
                  className={`w-10 h-10 rounded-full border-2 transition-all ${isActiveColor ? "border-gray-900 dark:border-white scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
                );
              })}{" "}
            </div>{" "}
            <div className="flex items-center gap-3 pt-2">
              {" "}
              <input
                type="text"
                value={customColorInput}
                onChange={(e) => setCustomColorInput(e.target.value)}
                className="input-field flex-1 font-mono text-sm"
                placeholder="#4f46e5"
              />{" "}
              <button onClick={handleCustomColorApply} className="btn-primary">
                Apply
              </button>{" "}
            </div>{" "}
            <div
              className="mt-2 h-10 rounded-lg flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: primaryColor }}
            >
              Preview: {appName}
            </div>{" "}
          </div>{" "}
          <div className="glass-card p-6 space-y-4">
            {" "}
            <h3 className="text-sm font-semibold">Background Image</h3>{" "}
            <p className="text-xs text-gray-500">
              Paste a URL of a live image to show it as the panel background.
            </p>{" "}
            <div className="flex items-center gap-3">
              {" "}
              <input
                type="text"
                value={bgImageInput}
                onChange={(e) => setBgImageInput(e.target.value)}
                className="input-field flex-1 font-mono text-sm"
                placeholder="https://example.com/background.jpg"
              />{" "}
              <button
                onClick={() => {
                  setBackgroundImageUrl(bgImageInput.trim());
                  toast.success(bgImageInput.trim() ? "Background image set" : "Background image removed");
                }}
                className="btn-primary whitespace-nowrap"
              >
                {bgImageInput.trim() ? "Apply" : "Clear"}
              </button>{" "}
            </div>{" "}
            {backgroundImageUrl && (
              <div
                className="mt-2 h-24 rounded-lg bg-cover bg-center border border-gray-200 dark:border-gray-700"
                style={{ backgroundImage: `url(${backgroundImageUrl})` }}
              />
            )}{" "}
            <button
              onClick={() => {
                setBgImageInput("");
                setBackgroundImageUrl("");
                toast.success("Background image removed");
              }}
              className="text-xs text-red-500 hover:text-red-600"
            >
              Remove background
            </button>{" "}
          </div>{" "}
        </div>
      )}{" "}
    </div>
  );
};
export default SettingsPage;
