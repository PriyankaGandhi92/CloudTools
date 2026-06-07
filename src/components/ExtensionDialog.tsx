import React, { useState, useEffect, useCallback } from 'react';
import { Download, Check, ToggleLeft, ToggleRight, Puzzle, RefreshCw, Chrome, X } from 'lucide-react';

// Re-use the zip builder and extension file contents from OpenUrlDialog
import { downloadExtensionZip } from './openUrlHelpers';

export default function ExtensionDialog({ onClose }: { onClose: () => void }) {
  const [downloaded, setDownloaded] = useState(false);
  const [extInstalled, setExtInstalled] = useState(false);
  const [extEnabled, setExtEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [checking, setChecking] = useState(true);

  // Detect extension on mount by listening for the content script message
  const checkExtension = useCallback(() => {
    setChecking(true);
    // Send a probe — if extension is installed, content script will relay and respond
    window.postMessage({ type: 'BLUEPRINT_TO_EXT', payload: { action: 'GET_ENABLED' } }, '*');
    // Give it 1.5s to respond
    setTimeout(() => setChecking(false), 1500);
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'BLUEPRINT_EXT_INSTALLED') {
        setExtInstalled(true);
        setChecking(false);
        // Ask for current state
        window.postMessage({ type: 'BLUEPRINT_TO_EXT', payload: { action: 'GET_ENABLED' } }, '*');
      }
      if (e.data?.type === 'BLUEPRINT_FROM_EXT' && e.data?.payload?.enabled !== undefined) {
        setExtInstalled(true);
        setExtEnabled(e.data.payload.enabled);
        setToggling(false);
        setChecking(false);
      }
    };
    window.addEventListener('message', handleMessage);
    checkExtension();
    return () => window.removeEventListener('message', handleMessage);
  }, [checkExtension]);

  const handleToggle = () => {
    setToggling(true);
    const newVal = !extEnabled;
    window.postMessage({
      type: 'BLUEPRINT_TO_EXT',
      payload: { action: 'SET_ENABLED', enabled: newVal },
    }, '*');
    setExtEnabled(newVal);
    setTimeout(() => setToggling(false), 1200);
  };

  const handleDownload = () => {
    downloadExtensionZip();
    setDownloaded(true);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2">
          <Puzzle size={16} className="text-purple-400" />
          <h2 className="text-sm font-bold">Chrome Extension — Default PDF Viewer</h2>
          <button onClick={onClose} className="ml-auto p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* What it does */}
          <div className="text-[11px] text-bb-muted leading-relaxed bg-bb-dark rounded-lg border border-bb-border p-3">
            <p className="font-medium text-bb-text mb-1.5 flex items-center gap-1.5">
              <Chrome size={12} /> Make BluePrint your default PDF viewer
            </p>
            <p>
              Once installed and enabled, <strong className="text-bb-text">every PDF you open in Chrome</strong> will 
              automatically load in BluePrint — no need to copy-paste URLs. Just click any 
              PDF link or open a PDF file and it opens here with all your tools.
            </p>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between bg-bb-panel rounded-lg px-4 py-3 border border-bb-border">
            <div>
              <p className="text-xs font-medium text-bb-text">Extension Status</p>
              <p className="text-[10px] text-bb-muted mt-0.5">
                {checking
                  ? 'Detecting...'
                  : extInstalled
                  ? 'Installed and connected'
                  : 'Not detected — install below'}
              </p>
            </div>
            {checking ? (
              <RefreshCw size={16} className="text-bb-muted animate-spin" />
            ) : extInstalled ? (
              <span className="text-[10px] text-green-400 font-semibold flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded-full">
                <Check size={10} /> Connected
              </span>
            ) : (
              <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded-full">
                Not found
              </span>
            )}
          </div>

          {/* Toggle — always shown when installed */}
          {extInstalled && (
            <div className="flex items-center justify-between bg-bb-dark rounded-lg px-4 py-3 border border-bb-border">
              <div>
                <p className="text-xs font-medium text-bb-text">PDF Interception</p>
                <p className="text-[10px] text-bb-muted mt-0.5">
                  {extEnabled
                    ? 'Enabled — all PDFs open in BluePrint automatically'
                    : 'Disabled — PDFs open normally in Chrome'}
                </p>
              </div>
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={`transition-all ${toggling ? 'opacity-50 scale-95' : 'hover:scale-105'}`}
                title={extEnabled ? 'Click to disable' : 'Click to enable'}
              >
                {extEnabled ? (
                  <ToggleRight size={36} className="text-green-400" />
                ) : (
                  <ToggleLeft size={36} className="text-bb-muted" />
                )}
              </button>
            </div>
          )}

          {/* Install section */}
          {!extInstalled && !checking && (
            <div className="space-y-3">
              <button
                onClick={handleDownload}
                className={`w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                  downloaded
                    ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {downloaded ? <Check size={14} /> : <Download size={14} />}
                {downloaded ? 'Downloaded! Follow steps below ↓' : 'Download Chrome Extension (.zip)'}
              </button>

              {downloaded && (
                <div className="text-[11px] text-bb-text bg-bb-dark rounded-lg border border-bb-border px-4 py-3 space-y-2">
                  <p className="font-medium text-amber-400">Installation Steps:</p>
                  <p><strong>1.</strong> Unzip the downloaded <code className="bg-bb-panel px-1 rounded text-[10px]">BluePrint-PDF-Extension.zip</code></p>
                  <p><strong>2.</strong> Open <code className="bg-bb-panel px-1 rounded text-[10px]">chrome://extensions</code> in Chrome</p>
                  <p><strong>3.</strong> Enable <strong>Developer mode</strong> (toggle, top-right)</p>
                  <p><strong>4.</strong> Click <strong>Load unpacked</strong> → select the unzipped folder</p>
                  <p><strong>5.</strong> Done! Refresh this page and the toggle will appear above.</p>
                </div>
              )}

              {!downloaded && (
                <p className="text-[10px] text-bb-muted text-center">One-time setup — takes under 1 minute</p>
              )}
            </div>
          )}

          {/* Re-check / re-download for installed users */}
          {extInstalled && (
            <div className="flex gap-2">
              <button
                onClick={checkExtension}
                className="flex-1 py-1.5 rounded text-[10px] text-bb-muted hover:text-bb-text bg-bb-hover hover:bg-bb-border flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw size={10} /> Re-check status
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 py-1.5 rounded text-[10px] text-bb-muted hover:text-bb-text bg-bb-hover hover:bg-bb-border flex items-center justify-center gap-1.5 transition-colors"
              >
                <Download size={10} /> Re-download extension
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
