import React, { useState } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { useToastStore, type ToastType } from '../stores/toastStore';

const iconMap: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-green-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
};

const bgMap: Record<ToastType, string> = {
  success: 'bg-[#161616] border-green-800/50',
  error: 'bg-[#161616] border-red-800/50',
  info: 'bg-[#161616] border-blue-800/50',
  warning: 'bg-[#161616] border-yellow-800/50',
};

const accentMap: Record<ToastType, string> = {
  success: 'bg-green-400',
  error: 'bg-red-400',
  info: 'bg-blue-400',
  warning: 'bg-yellow-400',
};

interface ToastItemProps {
  id: string;
  type: ToastType;
  message: string;
  onClose: () => void;
}

function ToastItem({ id, type, message, onClose }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 250);
  };

  return (
    <div
      key={id}
      className={`
        relative flex items-center gap-3 px-4 py-3 rounded-xl border shadow-overlay backdrop-blur-sm overflow-hidden
        ${bgMap[type]}
        ${isExiting ? 'animate-slide-out' : 'animate-slide-in'}
      `}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-full ${accentMap[type]}`} />
      {iconMap[type]}
      <span className="flex-1 text-sm text-[#F0EBE3]">{message}</span>
      <button
        onClick={handleClose}
        className="p-1 hover:bg-white/10 rounded-lg transition-colors duration-150"
      >
        <X className="w-4 h-4 text-white/70" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast, index) => (
        <div key={toast.id} style={{ animationDelay: `${index * 50}ms` }}>
          <ToastItem
            id={toast.id}
            type={toast.type}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
          />
        </div>
      ))}
    </div>
  );
}
