import React from 'react';
import { TrendingUp, TrendingDown, LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: { value: number; positive: boolean };
  subtitle?: string;
  color?: string;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, trend, subtitle, color, onClick }) => {
  return (
    <div
      className={`glass-card p-5 ${onClick ? 'cursor-pointer card-hover' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center gap-1 mt-1">
              {trend.positive ? (
                <TrendingUp className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={`text-xs font-medium ${trend.positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {trend.value}%
              </span>
            </div>
          )}
        </div>
        <div
          className={`p-3 rounded-lg transition-all duration-300 ${color || 'bg-primary-50 dark:bg-primary-900/20'}`}
          style={color ? { boxShadow: `0 0 12px ${color}40` } : undefined}
        >
          <Icon className={`w-5 h-5 ${color ? 'text-white' : 'text-primary-600 dark:text-primary-400'}`} />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
