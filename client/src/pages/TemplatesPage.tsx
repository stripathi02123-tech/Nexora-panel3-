import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, Search, Zap, Globe, Database, Wrench, Gamepad2, Server, Loader2, CheckCircle, XCircle, Cpu, MemoryStick as Memory, Container, X, ExternalLink } from 'lucide-react';
import api from '@/utils/api';
import toast from 'react-hot-toast';

const categoryIcons: Record<string, React.ReactNode> = {
  games: <Gamepad2 className="w-5 h-5" />,
  web: <Globe className="w-5 h-5" />,
  databases: <Database className="w-5 h-5" />,
  tools: <Wrench className="w-5 h-5" />,
};

const categoryColors: Record<string, string> = {
  games: 'from-purple-500 to-pink-500',
  web: 'from-blue-500 to-cyan-500',
  databases: 'from-orange-500 to-red-500',
  tools: 'from-green-500 to-teal-500',
};

interface DeployState {
  templateId: string;
  templateName: string;
  status: 'deploying' | 'success' | 'error';
  containerId?: string;
  error?: string;
  accessUrls?: Array<{ url: string; proxyUrl: string; port: string; containerPort: string; protocol: string }>;
}

const TemplatesPage: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [deployState, setDeployState] = useState<DeployState | null>(null);

  const isCodespace = window.location.hostname.includes('github.dev') || window.location.hostname.includes('app.github.dev');
  const codespacePortUrl = (port: string) => {
    if (!isCodespace) return null;
    const host = window.location.hostname;
    const domainMatch = host.match(/\.(.+github\.dev)$/);
    if (!domainMatch) return null;
    const domain = domainMatch[1];
    const prefix = host.replace(`.${domain}`, '');
    const prefixParts = prefix.split('-');
    const codespaceName = prefixParts.slice(0, -1).join('-');
    return `https://${port}-${codespaceName}.${domain}`;
  };

  useEffect(() => {
    api.get('/templates').then((res) => setTemplates(res.data || [])).catch(() => {});
    api.get('/templates/categories').then((res) => setCategories(res.data || [])).catch(() => {});
  }, []);

  const filtered = templates.filter((t) => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDeploy = async (tmpl: any) => {
    setDeployState({ templateId: tmpl.id, templateName: tmpl.name, status: 'deploying' });
    try {
      const res = await api.post(`/templates/${tmpl.id}/deploy`, { name: `${tmpl.id}-${Date.now()}` });
      setDeployState({
        templateId: tmpl.id,
        templateName: tmpl.name,
        status: 'success',
        containerId: res.data.container.id,
        accessUrls: res.data.accessUrls || [],
      });
      toast.success(`${tmpl.name} deployed!`);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Deployment failed';
      setDeployState({ templateId: tmpl.id, templateName: tmpl.name, status: 'error', error: msg });
    }
  };

  const closeDeployDialog = () => setDeployState(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">One-click deploy popular applications</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="input-field pl-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeCategory === 'all' ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <Rocket className="w-4 h-4 inline mr-1.5" />All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
              activeCategory === cat ? 'text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            style={activeCategory === cat ? { background: `linear-gradient(135deg, var(--nexora-primary, #4f46e5), #9333ea)`, boxShadow: `0 0 12px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.4)` } : undefined}
          >
            {categoryIcons[cat]} {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((tmpl) => (
          <div key={tmpl.id} className="glass-card p-5 group relative overflow-hidden">
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: `linear-gradient(135deg, rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.03), transparent)` }}
            />
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-gradient-to-br ${categoryColors[tmpl.category] || 'from-primary-500 to-purple-500'}`}>
                  <span className="text-white">{tmpl.icon}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{tmpl.name}</h3>
                  <span className="text-xs text-gray-400 capitalize">{tmpl.category}</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 line-clamp-2">{tmpl.description}</p>
            <div className="flex items-center gap-3 mb-4 text-xs text-gray-400">
              {tmpl.ramMB && (
                <span className="flex items-center gap-1"><Memory className="w-3 h-3" />{tmpl.ramMB >= 1024 ? `${tmpl.ramMB / 1024}GB` : `${tmpl.ramMB}MB`}</span>
              )}
              {tmpl.cpuCores && (
                <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{tmpl.cpuCores} CPU</span>
              )}
              {(tmpl.ports || []).length > 0 && (
                <span className="flex items-center gap-1"><Container className="w-3 h-3" />{tmpl.ports.length} port{tmpl.ports.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <button
              onClick={() => handleDeploy(tmpl)}
              disabled={deployState?.templateId === tmpl.id && deployState?.status === 'deploying'}
              className="w-full btn-primary text-xs py-2"
            >
              {deployState?.templateId === tmpl.id && deployState?.status === 'deploying' ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Deploying...</>
              ) : (
                <><Zap className="w-3 h-3" /> Deploy</>
              )}
            </button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Server className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No templates found</p>
        </div>
      )}

      {deployState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeDeployDialog}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Deploying {deployState.templateName}</h3>
              <button onClick={closeDeployDialog} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>

            {deployState.status === 'deploying' && (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 animate-spin text-primary-500 mx-auto mb-4" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Creating container from template...</p>
                <p className="text-xs text-gray-400 mt-2">Pulling image and configuring resources</p>
              </div>
            )}

            {deployState.status === 'success' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-7 h-7 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Deployment Successful!</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Container is running</p>
                {deployState.accessUrls && deployState.accessUrls.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 mb-4 text-left">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Access your service:</p>
                    {deployState.accessUrls.map((u, i) => {
                      const csUrl = codespacePortUrl(u.port);
                      const finalUrl = csUrl || u.url;
                      return (
                        <div key={i}>
                          <a href={finalUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm font-mono text-primary-600 dark:text-primary-400 hover:underline mb-1">
                            <ExternalLink className="w-3.5 h-3.5" /> {finalUrl}
                          </a>
                          <a href={u.proxyUrl} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs font-mono text-green-600 dark:text-green-400 hover:underline mb-1 pl-5">
                            <ExternalLink className="w-3 h-3" /> Proxy: {window.location.origin}{u.proxyUrl}
                          </a>
                        </div>
                      );
                    })}
                    <p className="text-xs text-gray-400 mt-1">Port{deployState.accessUrls.length > 1 ? 's' : ''}: {deployState.accessUrls.map(u => u.port).join(', ')}</p>
                  </div>
                )}
                <div className="flex gap-3 justify-center">
                  <button onClick={() => { navigate(`/docker/containers/${deployState.containerId}`); closeDeployDialog(); }} className="btn-primary text-sm">
                    <ExternalLink className="w-4 h-4" /> View Container
                  </button>
                  <button onClick={closeDeployDialog} className="btn-secondary text-sm">Done</button>
                </div>
              </div>
            )}

            {deployState.status === 'error' && (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Deployment Failed</p>
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 mt-2 font-mono">{deployState.error}</p>
                <div className="flex gap-3 justify-center mt-6">
                  <button onClick={() => { const tmpl = templates.find(t => t.id === deployState.templateId); if (tmpl) handleDeploy(tmpl); }} className="btn-primary text-sm">
                    <Zap className="w-4 h-4" /> Retry
                  </button>
                  <button onClick={closeDeployDialog} className="btn-secondary text-sm">Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplatesPage;
