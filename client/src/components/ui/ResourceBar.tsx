import React from 'react';
import { formatBytes } from '@/utils/helpers';

interface ResourceBarProps {
  label: string;
  used: number;
  total: number;
  unit?: 'bytes' | 'percent' | 'number';
  showIcon?: boolean;
}

const ResourceBar: React.FC<ResourceBarProps> = ({ label, used, total, unit = 'bytes', showIcon = true }) => {
  const percent = total > 0 ? Math.min(Math.round((used / total) * 100), 100) : 0;

  const formatValue = (val: number) => {
    if (unit === 'bytes') return formatBytes(val);
    if (unit === 'percent') return `${val}%`;
    return val.toString();
  };

  const getColor = () => {
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 70) return 'bg-orange-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-primary-500';
  };

  const iconColor = () => {
    if (percent >= 90) return 'text-red-500';
    if (percent >= 70) return 'text-orange-500';
    if (percent >= 50) return 'text-yellow-500';
    return 'text-primary-500';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showIcon && (
            <div className={`w-2 h-2 rounded-full ${getColor()}`} />
          )}
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-xs font-semibold text-gray-900 dark:text-white">
          {formatValue(used)} / {formatValue(total)}
        </span>
      </div>
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-end">
        <span className={`text-xs font-medium ${iconColor()}`}>{percent}%</span>
      </div>
    </div>
  );
};

export default ResourceBar;
