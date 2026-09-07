import React from 'react';
import { statusColor, statusDotColor } from '@/utils/helpers';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm', showDot = true }) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium capitalize ${sizeClasses[size]} ${statusColor(status)}`}
    >
      {showDot && (
        <span
          className={`w-2 h-2 rounded-full ${statusDotColor(status)} ${
            ['running', 'online', 'active'].includes(status) ? 'animate-neon-pulse-fast' : ''
          }`}
          style={
            ['running', 'online', 'active'].includes(status)
              ? { '--nexora-primary-rgb': '34, 197, 94' } as React.CSSProperties
              : undefined
          }
        />
      )}
      {status}
    </span>
  );
};

export default StatusBadge;
