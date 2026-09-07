import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal as TerminalIcon, FileText, BarChart3, Play, Square, RotateCcw, Trash2, Globe, Activity, Send, Folder, File, Upload, ChevronRight, Home, Download, Edit3, Save, X, Eye, Code, ExternalLink, Plus, Cpu, HardDrive, Network, Trash, Eraser, Server, Monitor } from 'lucide-react';
import api from '@/utils/api';
import StatusBadge from '@/components/ui/StatusBadge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';
import { formatBytes } from '@/utils/helpers';

const DockerContainerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [container, setContainer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('logs');
  const [logs, setLogs] = useState<string[]>([]);
  const [stats, setStats] = useState<any[]>([]);

  const [cmd, setCmd] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const processOutput = (text: string) => {
    const lines: string[] = [''];
    let cur = 0;
    for (const ch of text) {
      if (ch === '\r') {
        cur = 0;
      } else if (ch === '\n') {
        lines.push('');
        cur = 0;
      } else {
        const line = lines[lines.length - 1];
        if (cur < line.length) {
          lines[lines.length - 1] = line.slice(0, cur) + ch + line.slice(cur + 1);
        } else {
          lines[lines.length - 1] = line + ch;
        }
        cur++;
      }
    }
    return lines.join('\n');
  };

  const [cmdOutput, setCmdOutput] = useState<string>('');
  const [executing, setExecuting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [cwd, setCwd] = useState('~');
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [fsPath, setFsPath] = useState('/');
  const [fsEntries, setFsEntries] = useState<any[]>([]);
  const [fsLoading, setFsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileContentLoading, setFileContentLoading] = useState(false);
  const [editingFile, setEditingFile] = useState(false);
  const [editContent, setEditContent] = useState('');

  const detectWebRoot = (image: string): string | null => {
    const img = (image || '').toLowerCase();
    if (img.includes('nginx')) return '/usr/share/nginx/html';
    if (img.includes('httpd') || img.includes('apache')) return '/usr/local/apache2/htdocs';
    if (img.includes('wordpress')) return '/var/www/html';
    if (img.includes('php')) return '/var/www/html';
    if (img.includes('caddy')) return '/usr/share/caddy';
    if (img.includes('node')) return '/app';
    if (img.includes('python') || img.includes('flask') || img.includes('django')) return '/app';
    return null;
  };

  const webRoot = container ? detectWebRoot(container.image) : null;

  const starterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Website</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>Welcome to My Website!</h1>
  <p>Edit this file to get started.</p>
  <script src="script.js"></script>
</body>
</html>`;

  const starterCss = `body {
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 800px;
  margin: 40px auto;
  padding: 0 20px;
  line-height: 1.6;
  color: #333;
  background: #f5f5f5;
}
h1 { color: #4f46e5; }`;

  const starterJs = `console.log('Website loaded!');`;

  const pterodactylScript = `#!/bin/bash
set -e

# Pterodactyl Panel Auto-Installer for Ubuntu 22.04 / Debian 12
echo "=== Pterodactyl Panel Installer ==="

if ! command -v apt-get &>/dev/null; then
  echo "This script requires apt (Debian/Ubuntu)."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq software-properties-common curl wget gnupg ca-certificates

add-apt-repository ppa:ondrej/php -y
apt-get update -qq

apt-get install -y -qq nginx php8.3 php8.3-{cli,common,gd,mysql,mbstring,bcmath,xml,fpm,curl,zip,intl,redis,bz2} mariadb-server redis-server

service mariadb start
service redis-server start
service nginx start

mysql -e "CREATE DATABASE IF NOT EXISTS panel;"
mysql -e "CREATE USER IF NOT EXISTS 'pterodactyl'@'127.0.0.1' IDENTIFIED BY 'pterodactyl';"
mysql -e "GRANT ALL PRIVILEGES ON panel.* TO 'pterodactyl'@'127.0.0.1';"
mysql -e "FLUSH PRIVILEGES;"

curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

cd /var/www
rm -rf pterodactyl
curl -Lo panel.tar.gz https://github.com/pterodactyl/panel/releases/latest/download/panel.tar.gz
tar -xzf panel.tar.gz
rm -f panel.tar.gz
cd /var/www/pterodactyl || exit 1
chmod -R 755 storage/* bootstrap/cache

cp .env.example .env
sed -i "s|APP_URL=.*|APP_URL=http://localhost|" .env
sed -i "s|DB_HOST=.*|DB_HOST=127.0.0.1|" .env
sed -i "s|DB_DATABASE=.*|DB_DATABASE=panel|" .env
sed -i "s|DB_USERNAME=.*|DB_USERNAME=pterodactyl|" .env
sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=pterodactyl|" .env
sed -i "s|REDIS_HOST=.*|REDIS_HOST=127.0.0.1|" .env
sed -i "s|QUEUE_CONNECTION=.*|QUEUE_CONNECTION=redis|" .env
sed -i "s|SESSION_DRIVER=.*|SESSION_DRIVER=redis|" .env
sed -i "s|CACHE_DRIVER=.*|CACHE_DRIVER=redis|" .env

composer install --no-dev --optimize-autoloader --no-interaction --quiet

php artisan key:generate --force
php artisan migrate --force --seed --no-interaction

echo "Now create your admin user:"
php artisan p:user:make

chown -R www-data:www-data /var/www/pterodactyl

cat > /etc/nginx/sites-available/pterodactyl << 'NGINX'
server {
    listen 80;
    server_name _;
    root /var/www/pterodactyl/public;
    index index.php;
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    location ~ \\.php$ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
    location ~ /\\. {
        deny all;
    }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/pterodactyl /etc/nginx/sites-enabled/
nginx -t && service nginx reload

echo ""
echo "=== Install Complete ==="
echo "Open your browser to view the Pterodactyl panel."`;

  useEffect(() => {
    api.get(`/docker/containers/${id}`)
      .then((res) => setContainer(res.data))
      .catch(() => navigate('/docker/containers'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!container) return;
    if (activeTab === 'logs') {
      api.get(`/docker/containers/${id}/logs?tail=100`).then((res) => {
        const logText = res.data?.logs ?? '';
        setLogs(typeof logText === 'string' && logText ? logText.split('\n') : []);
      }).catch(() => {});
    }
    if (activeTab === 'stats') {
      api.get(`/docker/containers/${id}/stats?limit=30`).then((res) => setStats(res.data || [])).catch(() => {});
    }
  }, [id, activeTab, container]);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [cmdOutput]);

  useEffect(() => {
    if (activeTab === 'files' && container?.status === 'running') {
      loadFsDirectory(fsPath);
    }
  }, [activeTab, container?.status]);

  const handleAction = async (action: string) => {
    try {
      await api.post(`/docker/containers/${id}/${action}`);
      toast.success(`Container ${action}ed`);
      const res = await api.get(`/docker/containers/${id}`);
      setContainer(res.data);
    } catch {}
  };

  const stripAnsi = (text: string) => text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][0-9;]*\x07/g, '');

  const detectCwdChange = (cmdStr: string, output: string) => {
    const trimmed = cmdStr.trim();
    if (trimmed.startsWith('cd ')) {
      const target = trimmed.slice(3).trim();
      if (!target || target === '~') {
        setCwd('~');
      } else if (target.startsWith('/')) {
        setCwd(target);
      } else if (target === '..') {
        setCwd((prev) => {
          if (prev === '~' || prev === '/') return '/';
          const parts = prev.replace(/\/$/, '').split('/');
          parts.pop();
          return parts.join('/') || '/';
        });
      } else if (target === '-' ) {
        setCwd((prev) => prev);
      } else {
        setCwd((prev) => {
          const base = prev === '~' ? '/root' : prev;
          return `${base.replace(/\/$/, '')}/${target}`;
        });
      }
    }
    if (!output.includes('not found') && !output.includes('No such file')) {
      if (trimmed === 'pwd') {
        const pwdLine = output.trim().split('\n').pop()?.trim();
        if (pwdLine && pwdLine.startsWith('/')) setCwd(pwdLine);
      }
    }
  };

  const handleExec = async () => {
    if (!cmd.trim()) return;
    setExecuting(true);
    setStreaming(true);
    const displayCmd = `$ ${cwd === '~' ? '~' : cwd} ${cmd}`;
    setCmdOutput((prev) => prev + displayCmd + '\n');
    const currentCmd = cmd;
    setCmd('');
    setCmdHistory((prev) => [...prev, currentCmd]);
    setHistoryIdx(-1);

    abortRef.current = new AbortController();
    try {
      const token = localStorage.getItem('nexora_token');
      const res = await fetch(`/api/docker/containers/${id}/exec/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ cmd: currentCmd.split(/\s+/), workdir: cwd === '~' ? undefined : cwd }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let outputBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.done) break;
            if (payload.error) {
              setCmdOutput((prev) => prev + `\nError: ${payload.error}\n`);
              break;
            }
            if (payload.text) {
              const cleaned = stripAnsi(payload.text);
              if (cleaned) {
                outputBuffer += cleaned;
                setCmdOutput((prev) => prev + cleaned);
              }
            }
          } catch {}
        }
      }

      detectCwdChange(currentCmd, outputBuffer);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        if (err.message?.includes('409')) {
          setCmdOutput((prev) => prev + '\nError: Container is not running. Refreshing status...\n');
          api.get(`/docker/containers/${id}`).then((r) => setContainer(r.data)).catch(() => {});
        } else {
          setCmdOutput((prev) => prev + `\nError: ${err.message}\n`);
        }
      }
    }
    setExecuting(false);
    setStreaming(false);
    abortRef.current = null;
  };

  const handleCmdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleExec();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length === 0) return;
      const newIdx = historyIdx === -1 ? cmdHistory.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(newIdx);
      setCmd(cmdHistory[newIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      const newIdx = historyIdx + 1;
      if (newIdx >= cmdHistory.length) {
        setHistoryIdx(-1);
        setCmd('');
      } else {
        setHistoryIdx(newIdx);
        setCmd(cmdHistory[newIdx]);
      }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setCmdOutput('');
    }
  };

  const loadFsDirectory = async (path: string) => {
    setFsLoading(true);
    try {
      const res = await api.post(`/docker/containers/${id}/fs/ls`, { path });
      setFsEntries(res.data || []);
      setFsPath(path);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to list directory');
      setFsEntries([]);
    }
    setFsLoading(false);
  };

  const navigateFs = (path: string) => {
    loadFsDirectory(path);
    setSelectedFile(null);
    setEditingFile(false);
  };

  const openFile = async (path: string) => {
    setSelectedFile(path);
    setFileContentLoading(true);
    setEditingFile(false);
    try {
      const res = await api.post(`/docker/containers/${id}/fs/read`, { path });
      setFileContent(res.data.content || '');
      setEditContent(res.data.content || '');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to read file');
      setSelectedFile(null);
    }
    setFileContentLoading(false);
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    try {
      await api.post(`/docker/containers/${id}/fs/write`, { path: selectedFile, content: editContent });
      setFileContent(editContent);
      setEditingFile(false);
      toast.success('File saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save file');
    }
  };

  const createWebFile = async (name: string, content: string) => {
    if (!webRoot) return;
    const path = `${webRoot}/${name}`;
    try {
      await api.post(`/docker/containers/${id}/fs/write`, { path, content });
      toast.success(`Created ${name}`);
      loadFsDirectory(fsPath);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create file');
    }
  };

  const proxyUrl = container ? `/api/docker/containers/${id}/proxy/` : '';

  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === 'web' && prevTabRef.current !== 'web' && webRoot) {
      navigateFs(webRoot);
    }
    prevTabRef.current = activeTab;
  }, [activeTab]);

  const fsBreadcrumbs = fsPath.split('/').filter(Boolean);

  if (loading) return <LoadingSpinner size="lg" className="h-64" />;
  if (!container) return null;

  const tabs = [
    { key: 'logs', label: 'Logs', icon: <FileText className="w-4 h-4" /> },
    { key: 'stats', label: 'Stats', icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'terminal', label: 'Terminal', icon: <TerminalIcon className="w-4 h-4" /> },
    { key: 'files', label: 'Files', icon: <Folder className="w-4 h-4" /> },
    ...(webRoot ? [{ key: 'web', label: 'Web', icon: <Code className="w-4 h-4" /> }] : []),
    { key: 'inspect', label: 'Inspect', icon: <Activity className="w-4 h-4" /> },
    { key: 'ports', label: 'Ports', icon: <Globe className="w-4 h-4" /> },
  ];

  const fileIcon = (entry: any) => {
    if (entry.isDirectory) return <Folder className="w-4 h-4 text-yellow-500 flex-shrink-0" />;
    const ext = entry.name?.split('.').pop()?.toLowerCase();
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp', 'rb', 'php', 'swift', 'kt'].includes(ext)) return <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    if (['json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf'].includes(ext)) return <FileText className="w-4 h-4 text-green-400 flex-shrink-0" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return <FileText className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    if (['zip', 'tar', 'gz', 'bz2', 'xz', 'rar', '7z'].includes(ext)) return <FileText className="w-4 h-4 text-orange-400 flex-shrink-0" />;
    if (['sh', 'bash', 'zsh', 'fish'].includes(ext)) return <TerminalIcon className="w-4 h-4 text-green-500 flex-shrink-0" />;
    return <File className="w-4 h-4 text-gray-400 flex-shrink-0" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/20">
            <TerminalIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {container.name || container.containerId?.slice(0, 12) || 'Container'}
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <StatusBadge status={container.status} />
              <span className="text-sm text-gray-500 font-mono">{container.image}</span>
              {container.containerId && (
                <span className="text-xs text-gray-400 font-mono">ID: {container.containerId.slice(0, 12)}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {container.status === 'running' ? (
            <>
              <button onClick={() => handleAction('stop')} className="btn-danger"><Square className="w-4 h-4" /> Stop</button>
              <button onClick={() => handleAction('restart')} className="btn-secondary"><RotateCcw className="w-4 h-4" /> Restart</button>
            </>
          ) : (
            <button onClick={() => handleAction('start')} className="btn-primary"><Play className="w-4 h-4" /> Start</button>
          )}
          <button onClick={() => handleAction('remove')} className="btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Cpu className="w-3.5 h-3.5" /> CPU
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">{container.allocatedCpuCores || '-'}</span>
          <span className="text-xs text-gray-500 ml-1">cores</span>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <HardDrive className="w-3.5 h-3.5" /> RAM
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">{container.allocatedRamMB || '-'}</span>
          <span className="text-xs text-gray-500 ml-1">MB</span>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <HardDrive className="w-3.5 h-3.5" /> Disk
          </div>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">{container.allocatedDiskGB || '-'}</span>
          <span className="text-xs text-gray-500 ml-1">GB</span>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Globe className="w-3.5 h-3.5" /> Type
          </div>
          <span className={`text-lg font-semibold capitalize ${container.type === 'vds' ? 'text-purple-600' : 'text-primary-600'}`}>
            {container.type || 'VPS'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 ${
              activeTab === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            style={activeTab === tab.key ? { textShadow: '0 0 8px rgba(99,102,241,0.3)' } : undefined}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      <div className="glass-card">
        {activeTab === 'logs' && (
          <div className="p-4">
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-blue-400 font-semibold">Container Logs</span>
                </div>
                <button onClick={() => api.get(`/docker/containers/${id}/logs?tail=100`).then((res) => { const t = res.data?.logs ?? ''; setLogs(typeof t === 'string' && t ? t.split('\n') : []); }).catch(() => {})}
                  className="btn-ghost text-xs text-gray-400 hover:text-blue-400 p-1" title="Refresh">
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
              <div className="bg-gray-950 text-green-400 font-mono text-xs p-4 h-96 overflow-y-auto whitespace-pre-wrap" style={{ boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.6)' }}>
                {logs.length > 0 ? logs.filter(l => l.trim()).map((line, i) => (
                  <div key={i} className="leading-relaxed hover:bg-white/5">{line}</div>
                )) : <span className="text-gray-600 italic">No logs. Start the container to generate logs.</span>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="p-5">
            {stats.length > 0 ? (
              <div className="space-y-3">
                {stats.slice(0, 30).reverse().map((s, i) => (
                  <div key={i} className="flex items-center gap-4 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-sm font-mono">
                    <span className="text-xs text-gray-400 w-20 flex-shrink-0">{s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '-'}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <Cpu className="w-3.5 h-3.5 text-blue-500" />
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${Math.min((s.cpuPercent || s.cpu || 0), 100)}%` }} />
                      </div>
                      <span className="text-xs w-12 text-right">{(s.cpuPercent || s.cpu || 0).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <HardDrive className="w-3.5 h-3.5 text-purple-500" />
                      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                        <div className="bg-purple-500 h-full rounded-full transition-all" style={{ width: `${Math.min(((s.memoryUsage || s.memory || 0) / (s.memoryLimit || 1024 * 1024 * 1024)) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs w-24 text-right">{formatBytes(s.memoryUsage || s.memory || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={BarChart3} title="No stats available" description="Stats will appear once the container starts running." />}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="p-4">
            {container.status === 'running' ? (
              <>
                <div className="rounded-lg overflow-hidden border border-gray-700 shadow-lg" style={{ boxShadow: '0 0 20px rgba(0, 255, 136, 0.1)' }}>
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                      <TerminalIcon className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-green-400 font-semibold">{container.name}</span>
                      <span className="text-gray-600">|</span>
                      <span className="text-primary-400">cwd:</span>
                      <span className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">{cwd}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCmdOutput('')} className="btn-ghost text-gray-400 hover:text-red-400 p-1" title="Clear output (Ctrl+L)">
                        <Eraser className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div ref={outputRef} className="bg-gray-950 text-green-400 font-mono text-xs p-4 h-80 overflow-y-auto whitespace-pre-wrap" style={{ boxShadow: 'inset 0 0 30px rgba(0, 0, 0, 0.8)' }}>
                    {!cmdOutput ? (
                      <span className="text-gray-600 italic">Type a command and press Enter</span>
                    ) : (
                      <pre className="m-0 p-0 bg-transparent text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{processOutput(cmdOutput)}</pre>
                    )}
                    {streaming && (
                      <span className="inline-block w-2 h-4 bg-green-400 ml-0.5 animate-pulse" />
                    )}
                  </div>
                  <div className="flex gap-2 p-3 bg-gray-900 border-t border-gray-700">
                    <div className="flex items-center gap-1 text-xs text-green-400 font-mono flex-shrink-0">
                      <span className="text-gray-500">$</span>
                      <span className="text-primary-400">{cwd === '~' ? '~' : cwd}</span>
                    </div>
                    <input ref={cmdInputRef}
                      value={cmd}
                      onChange={(e) => setCmd(e.target.value)}
                      onKeyDown={handleCmdKeyDown}
                      placeholder="type a command..."
                      className="flex-1 px-3 py-1.5 text-sm font-mono bg-gray-800 text-green-400 border border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder-gray-600"
                      disabled={streaming}
                      autoFocus
                    />
                    {streaming ? (
                      <button onClick={() => { abortRef.current?.abort(); setStreaming(false); setExecuting(false); }}
                        className="btn-danger px-3 py-1.5 text-xs">
                        <Square className="w-3.5 h-3.5" /> Stop
                      </button>
                    ) : (
                      <button onClick={handleExec} disabled={executing || !cmd.trim()}
                        className="btn-primary px-3 py-1.5 text-xs">
                        <Send className="w-3.5 h-3.5" /> Run
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState icon={TerminalIcon} title="Container not running"
                description="Start the container to access the terminal." />
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="p-4">
            {container.status === 'running' ? (
              <div className="flex gap-4 h-[32rem]">
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center gap-1 mb-3 text-sm flex-wrap">
                    <button onClick={() => navigateFs('/')} className="hover:text-primary-500 transition-colors">
                      <Home className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    {fsBreadcrumbs.map((part, i) => {
                      const path = '/' + fsBreadcrumbs.slice(0, i + 1).join('/');
                      return (
                        <React.Fragment key={path}>
                          <button onClick={() => navigateFs(path)} className="hover:text-primary-500 transition-colors font-mono text-xs">
                            {part}
                          </button>
                          {i < fsBreadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    {fsLoading ? (
                      <div className="flex items-center justify-center h-32"><LoadingSpinner /></div>
                    ) : fsEntries.length === 0 ? (
                      <EmptyState icon={Folder} title="Empty directory" />
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                            <th className="text-left p-2 text-xs font-semibold text-gray-500 w-8"></th>
                            <th className="text-left p-2 text-xs font-semibold text-gray-500">Name</th>
                            <th className="text-right p-2 text-xs font-semibold text-gray-500 w-24">Size</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                          {fsPath !== '/' && (
                            <tr className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => {
                              const parent = fsPath.split('/').slice(0, -1).join('/') || '/';
                              navigateFs(parent);
                            }}>
                              <td className="p-2"><Folder className="w-4 h-4 text-gray-400" /></td>
                              <td className="p-2 font-mono text-xs text-gray-500">..</td>
                              <td className="p-2 text-right text-xs text-gray-400"></td>
                            </tr>
                          )}
                          {fsEntries.map((entry: any) => (
                            <tr key={entry.name}
                              className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${entry.name === selectedFile ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}
                              onClick={() => entry.isDirectory ? navigateFs(`${fsPath.replace(/\/$/, '')}/${entry.name}`) : openFile(`${fsPath.replace(/\/$/, '')}/${entry.name}`)}>
                              <td className="p-2">{fileIcon(entry)}</td>
                              <td className="p-2 font-mono text-xs">{entry.name}</td>
                              <td className="p-2 text-right text-xs text-gray-400">{entry.isDirectory ? '-' : formatBytes(entry.size)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
                {selectedFile && (
                  <div className="w-96 flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                      <span className="text-xs font-mono truncate flex-1 px-1">{selectedFile.split('/').pop()}</span>
                      <div className="flex items-center gap-1">
                        {editingFile ? (
                          <>
                            <button onClick={saveFile} className="btn-ghost p-1"><Save className="w-4 h-4 text-green-500" /></button>
                            <button onClick={() => { setEditingFile(false); setEditContent(fileContent); }} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
                          </>
                        ) : (
                          <button onClick={() => setEditingFile(true)} className="btn-ghost p-1"><Edit3 className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                      {fileContentLoading ? (
                        <div className="flex items-center justify-center h-32"><LoadingSpinner /></div>
                      ) : editingFile ? (
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full h-full p-3 text-xs font-mono bg-gray-50 dark:bg-gray-900 border-none resize-none focus:outline-none"
                          spellCheck={false}
                        />
                      ) : (
                        <pre className="p-3 text-xs font-mono overflow-auto whitespace-pre-wrap max-h-[28rem]">{fileContent}</pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState icon={Folder} title="Container not running"
                description="Start the container to browse files." />
            )}
          </div>
        )}

        {activeTab === 'web' && webRoot && (
          <div className="p-4">
            {container.status === 'running' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Code className="w-4 h-4 text-primary-500" />
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{webRoot}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => createWebFile('index.html', starterHtml)} className="btn-ghost text-xs px-2 py-1"><Plus className="w-3 h-3" /> index.html</button>
                      <button onClick={() => createWebFile('style.css', starterCss)} className="btn-ghost text-xs px-2 py-1"><Plus className="w-3 h-3" /> style.css</button>
                      <button onClick={() => createWebFile('script.js', starterJs)} className="btn-ghost text-xs px-2 py-1"><Plus className="w-3 h-3" /> script.js</button>
                      <button onClick={() => createWebFile('install-pterodactyl.sh', pterodactylScript)} className="btn-ghost text-xs px-2 py-1"><Plus className="w-3 h-3" /> Pterodactyl</button>
                    </div>
                    <a href={proxyUrl} target="_blank" rel="noopener noreferrer"
                      className="btn-primary text-xs px-3 py-1.5">
                      <ExternalLink className="w-3 h-3" /> Preview
                    </a>
                  </div>
                </div>
                <div className="flex gap-4 h-[32rem]">
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center gap-1 mb-3 text-sm flex-wrap">
                      <button onClick={() => navigateFs(webRoot)} className="hover:text-primary-500 transition-colors">
                        <Home className="w-4 h-4" />
                      </button>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      {fsBreadcrumbs.map((part, i) => {
                        const path = '/' + fsBreadcrumbs.slice(0, i + 1).join('/');
                        return (
                          <React.Fragment key={path}>
                            <button onClick={() => navigateFs(path)} className="hover:text-primary-500 transition-colors font-mono text-xs">
                              {part}
                            </button>
                            {i < fsBreadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 text-gray-400" />}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <div className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                      {fsLoading ? (
                        <div className="flex items-center justify-center h-32"><LoadingSpinner /></div>
                      ) : fsEntries.length === 0 ? (
                        <EmptyState icon={Folder} title="Empty directory" />
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                              <th className="text-left p-2 text-xs font-semibold text-gray-500 w-8"></th>
                              <th className="text-left p-2 text-xs font-semibold text-gray-500">Name</th>
                              <th className="text-right p-2 text-xs font-semibold text-gray-500 w-24">Size</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                            {fsPath !== '/' && (
                              <tr className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50" onClick={() => {
                                const parent = fsPath.split('/').slice(0, -1).join('/') || '/';
                                navigateFs(parent);
                              }}>
                                <td className="p-2"><Folder className="w-4 h-4 text-gray-400" /></td>
                                <td className="p-2 font-mono text-xs text-gray-500">..</td>
                                <td className="p-2 text-right text-xs text-gray-400"></td>
                              </tr>
                            )}
                            {fsEntries.map((entry: any) => (
                              <tr key={entry.name}
                                className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${entry.name === selectedFile ? 'bg-primary-50 dark:bg-primary-900/10' : ''}`}
                                onClick={() => entry.isDirectory ? navigateFs(`${fsPath.replace(/\/$/, '')}/${entry.name}`) : openFile(`${fsPath.replace(/\/$/, '')}/${entry.name}`)}>
                                <td className="p-2">{fileIcon(entry)}</td>
                                <td className="p-2 font-mono text-xs">{entry.name}</td>
                                <td className="p-2 text-right text-xs text-gray-400">{entry.isDirectory ? '-' : formatBytes(entry.size)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                  {selectedFile && (
                    <div className="w-96 flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <span className="text-xs font-mono truncate flex-1 px-1">{selectedFile.split('/').pop()}</span>
                        <div className="flex items-center gap-1">
                          {editingFile ? (
                            <>
                              <button onClick={saveFile} className="btn-ghost p-1"><Save className="w-4 h-4 text-green-500" /></button>
                              <button onClick={() => { setEditingFile(false); setEditContent(fileContent); }} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
                            </>
                          ) : (
                            <button onClick={() => setEditingFile(true)} className="btn-ghost p-1"><Edit3 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto">
                        {fileContentLoading ? (
                          <div className="flex items-center justify-center h-32"><LoadingSpinner /></div>
                        ) : editingFile ? (
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full h-full p-3 text-xs font-mono bg-gray-50 dark:bg-gray-900 border-none resize-none focus:outline-none"
                            spellCheck={false}
                          />
                        ) : (
                          <pre className="p-3 text-xs font-mono overflow-auto whitespace-pre-wrap max-h-[28rem]">{fileContent}</pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState icon={Code} title="Container not running"
                description="Start the container to edit website files." />
            )}
          </div>
        )}

        {activeTab === 'inspect' && (
          <div className="p-5">
            <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono max-h-96 overflow-auto">
              {JSON.stringify(container, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'ports' && (
          <div className="p-5 space-y-4">
            {container.type === 'vds' && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-medium mb-2">
                  <Server className="w-4 h-4" /> RDP Desktop Access
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-gray-600 dark:text-gray-400">Web Desktop:</span>
                    <a href={`/api/docker/containers/${id}/proxy/`} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline font-mono text-xs">/api/docker/containers/{id?.slice(0, 8)}/proxy/</a>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-gray-600 dark:text-gray-400">RDP:</span>
                    <span className="font-mono text-xs">host-port:3389</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TerminalIcon className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-gray-600 dark:text-gray-400">Login:</span>
                    <span className="font-mono text-xs bg-purple-100 dark:bg-purple-800 px-1.5 py-0.5 rounded">abcuser</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-mono text-xs bg-purple-100 dark:bg-purple-800 px-1.5 py-0.5 rounded">abcabc</span>
                  </div>
                </div>
              </div>
            )}
            {Array.isArray(container.ports) && container.ports.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-2 text-xs font-semibold text-gray-500">Host Port</th>
                    <th className="text-left p-2 text-xs font-semibold text-gray-500">Container Port</th>
                    <th className="text-left p-2 text-xs font-semibold text-gray-500">Protocol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {container.ports.map((p: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 text-sm font-mono">{p.host || p.hostPort || p.PublicPort || '-'}</td>
                      <td className="p-2 text-sm font-mono">{p.container || p.containerPort || p.PrivatePort || '-'}</td>
                      <td className="p-2 text-sm uppercase">{p.type || p.protocol || p.Type || 'tcp'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyState icon={Globe} title="No port mappings" />}
          </div>
        )}
      </div>
    </div>
  );
};

export default DockerContainerDetailPage;
