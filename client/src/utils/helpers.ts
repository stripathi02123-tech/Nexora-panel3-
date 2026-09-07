import { formatDistanceToNow, format, differenceInSeconds } from 'date-fns';

export const formatBytes = (bytes: number, decimals = 2): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatDate = (date: any, fmt = 'MMM d, yyyy HH:mm'): string => {
  if (!date) return '-';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (!(d instanceof Date) || isNaN(d.getTime())) return '-';
  return format(d, fmt);
};

export const formatRelativeTime = (date: string | Date): string => {
  if (!date) return '-';
  return formatDistanceToNow(new Date(date), { addSuffix: true });
};

export const formatDuration = (seconds: number): string => {
  if (!seconds || seconds < 0) return '0s';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
};

export const statusColor = (status: string): string => {
  const map: Record<string, string> = {
    running: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    stopped: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    exited: 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800',
    error: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    paused: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    active: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    inactive: 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800',
    creating: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    deleting: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    pending: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    completed: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    failed: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    online: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    offline: 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800',
    restarted: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    paid: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    unpaid: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    overdue: 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    cancelled: 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800',
    expired: 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800',
    refunded: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
    success: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    waiting: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    created: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    restarting: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    partial: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
  };
  return map[status?.toLowerCase()] || 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800';
};

export const statusDotColor = (status: string): string => {
  const map: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-red-500',
    exited: 'bg-gray-500',
    error: 'bg-orange-500',
    paused: 'bg-yellow-500',
    active: 'bg-green-500',
    inactive: 'bg-gray-500',
    creating: 'bg-blue-500',
    deleting: 'bg-red-500',
    pending: 'bg-yellow-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    online: 'bg-green-500',
    offline: 'bg-gray-500',
    success: 'bg-green-500',
    waiting: 'bg-yellow-500',
    created: 'bg-blue-500',
    restarting: 'bg-blue-500',
    partial: 'bg-orange-500',
    paid: 'bg-green-500',
    unpaid: 'bg-yellow-500',
    overdue: 'bg-red-500',
    cancelled: 'bg-gray-500',
    expired: 'bg-gray-500',
    refunded: 'bg-purple-500',
  };
  return map[status?.toLowerCase()] || 'bg-gray-500';
};

export const getInitials = (name: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const generateColor = (name: string): string => {
  if (!name) return '#6366f1';
  const colors = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#ef4444', '#f97316', '#eab308', '#84cc16',
    '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const getStatusCount = <T extends Record<string, any>>(
  items: T[],
  statusKey: keyof T,
  status: string
): number => {
  return items.filter((item) => item[statusKey] === status).length;
};
