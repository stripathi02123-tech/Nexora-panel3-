import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Monitor,
  Layers,
  Activity,
  Network,
  CreditCard,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
  Box,
  Image,
  FileCode,
  Terminal,
  Globe,
  AlertTriangle,
  Users,
  Server,
  FileText,
  Webhook,
  HardDrive,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
  adminOnly?: boolean;
  children?: { label: string; path: string; icon?: LucideIcon }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  {
    label: 'VPS',
    icon: Monitor,
    path: '/docker/containers',
    children: [
      { label: 'My VPS', path: '/docker/containers' },
      { label: 'Create VPS', path: '/docker/containers/new' },
    ],
  },
  {
    label: 'VDS',
    icon: Server,
    path: '/docker/containers?type=vds',
    children: [
      { label: 'My VDS', path: '/docker/containers?type=vds' },
      { label: 'Create VDS', path: '/docker/containers/new' },
    ],
  },
  {
    label: 'Docker',
    icon: Layers,
    path: '/docker',
    children: [
      { label: 'Overview', path: '/docker' },
      { label: 'Containers', path: '/docker/containers' },
      { label: 'Images', path: '/docker/images' },
      { label: 'Compose', path: '/docker/compose' },
      { label: 'Templates', path: '/templates' },
    ],
  },
  {
    label: 'Monitoring',
    icon: Activity,
    path: '/monitoring',
    children: [
      { label: 'Dashboard', path: '/monitoring' },
      { label: 'Alerts', path: '/alerts' },
    ],
  },
  {
    label: 'Network',
    icon: Network,
    path: '/network',
    children: [
      { label: 'Networks', path: '/network' },
      { label: 'Firewall', path: '/firewall' },
    ],
  },
  { label: 'Billing', icon: CreditCard, path: '/billing' },
  { label: 'Settings', icon: Settings, path: '/settings' },
  {
    label: 'Admin',
    icon: Shield,
    path: '/admin',
    adminOnly: true,
    children: [
      { label: 'Users', path: '/admin?tab=users' },
      { label: 'Nodes', path: '/admin?tab=nodes' },
      { label: 'Plans', path: '/admin?tab=plans' },
      { label: 'Audit Logs', path: '/admin?tab=audit' },
      { label: 'Webhooks', path: '/admin?tab=webhooks' },
      { label: 'Node Agents', path: '/admin/node-agents' },
    ],
  },
];

const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const { appName, primaryColor } = useTheme();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => {
    const saved: Record<string, boolean> = {};
    navItems.forEach((item) => {
      if (item.children) {
        saved[item.label] = item.children.some((child) => location.pathname.startsWith(child.path.split('?')[0]));
      }
    });
    return saved;
  });

  const isActive = (path: string) => {
    const basePath = path.split('?')[0];
    if (basePath === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(basePath);
  };

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const filteredItems = navItems.filter((item) => {
    if (item.adminOnly) {
      return user?.role?.toUpperCase() === 'ADMIN';
    }
    return true;
  });

  return (
    <aside
      className={`fixed left-0 top-0 h-full bg-white dark:bg-gray-800 z-30 transition-all duration-300 hidden lg:flex flex-col ${
        collapsed ? 'w-20' : 'w-64'
      }`}
      style={{
        borderRight: `1px solid rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.15)`,
        boxShadow: `4px 0 12px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.08)`,
      }}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-200 dark:border-gray-700">
        <div
          className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center animate-neon-pulse"
          style={{ backgroundColor: primaryColor } as React.CSSProperties}
        >
          <HardDrive className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <span
            className="font-bold text-lg text-gray-900 dark:text-white"
            style={{ textShadow: `0 0 7px rgba(var(--nexora-primary-rgb, 99, 102, 241), 0.3)` }}
          >
            {appName}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredItems.map((item) => {
          const active = isActive(item.path);
          const hasChildren = !!item.children?.length;
          const expanded = expandedMenus[item.label];

          return (
            <div key={item.label}>
              {hasChildren ? (
                <button
                  onClick={() => toggleMenu(item.label)}
                  className={`w-full sidebar-link ${active ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </>
                  )}
                </button>
              ) : (
                <NavLink
                  to={item.path}
                  className={`sidebar-link ${active ? 'sidebar-link-active' : 'sidebar-link-inactive'}`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              )}
              {hasChildren && expanded && !collapsed && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children!.map((child) => {
                    const childActive = isActive(child.path);
                    return (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={`sidebar-link text-sm ${
                          childActive ? 'sidebar-link-active' : 'sidebar-link-inactive'
                        }`}
                      >
                        {child.icon ? (
                          <child.icon className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                        )}
                        <span>{child.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full sidebar-link sidebar-link-inactive justify-center"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
