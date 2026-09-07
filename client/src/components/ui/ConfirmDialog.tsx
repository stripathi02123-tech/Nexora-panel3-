import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}) => {
  const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-orange-600 hover:bg-orange-700',
    info: 'bg-primary-600 hover:bg-primary-700',
  };

  const variantIcons = {
    danger: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
    warning: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
    info: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20',
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Action" size="sm">
      <div className="flex flex-col items-center text-center gap-4 py-4">
        <div className={`p-3 rounded-full ${variantIcons[variant]}`}>
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-4">
        <button onClick={onClose} disabled={loading} className="btn-secondary">
          {cancelText}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant]}`}
        >
          {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
};

export default ConfirmDialog;
