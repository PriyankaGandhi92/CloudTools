import React from 'react';
import { useStore } from '../store/useStore';
import { CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';

export default function CloudStatusToast() {
  const cloudStatus = useStore((state) => state.cloudStatus);
  const setCloudStatus = useStore((state) => state.setCloudStatus);

  if (!cloudStatus) return null;

  // Determine status type based on message content
  const isExecuting = cloudStatus.startsWith('Executing') || cloudStatus.startsWith('Validating');
  const isError = cloudStatus.startsWith('Failed') || cloudStatus.startsWith('Error');
  const isSuccess = cloudStatus.includes('successfully') || cloudStatus.includes('downloaded');
  const isCancelled = cloudStatus.includes('cancelled');

  const getStatusColor = () => {
    if (isError) return 'bg-red-500';
    if (isSuccess) return 'bg-green-500';
    if (isCancelled) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  const getStatusIcon = () => {
    if (isExecuting) return <Loader2 className="w-5 h-5 animate-spin" />;
    if (isError) return <AlertCircle className="w-5 h-5" />;
    if (isSuccess) return <CheckCircle className="w-5 h-5" />;
    if (isCancelled) return <AlertCircle className="w-5 h-5" />;
    return <Loader2 className="w-5 h-5 animate-spin" />;
  };

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right fade-in duration-300">
      <div className={`${getStatusColor()} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-md`}>
        {getStatusIcon()}
        <span className="flex-1 text-sm font-medium">{cloudStatus}</span>
        <button
          onClick={() => setCloudStatus(null)}
          className="hover:bg-white/20 rounded p-1 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
