import React, { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Clock, FileText, Trash2, X, FolderOpen } from 'lucide-react';
import { loadPdf } from '../utils/pdfRenderer';

// Helper for "2 hours ago" formatting
const getRelativeTime = (timestamp: number) => {
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const daysDifference = Math.round((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
  const hoursDifference = Math.round((timestamp - Date.now()) / (1000 * 60 * 60));

  if (Math.abs(hoursDifference) < 24) return rtf.format(hoursDifference, 'hour');
  return rtf.format(daysDifference, 'day');
};

export default function RecentFilesTab() {
  const {
    recentFiles,
    loadRecentFiles,
    removeRecentFile,
    clearRecentFiles,
    openPdfInNewTab,
  } = useStore();

  useEffect(() => {
    loadRecentFiles();
  }, [loadRecentFiles]);

  const handleOpenRecentFile = async (item: any) => {
    try {
      if (item.handle && 'showOpenFilePicker' in window) {
        // File System Access API supported
        const options = { mode: 'read' as const };
        if ((await item.handle.queryPermission(options)) !== 'granted') {
          if ((await item.handle.requestPermission(options)) !== 'granted') {
            alert('Permission denied to read local file.');
            return;
          }
        }
        const file = await item.handle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const doc = await loadPdf(arrayBuffer);
        openPdfInNewTab(file.name, arrayBuffer, doc.numPages);
      } else {
        // Fallback: prompt user to re-select file
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pdf';
        input.onchange = async (e) => {
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          if (file && file.name === item.name) {
            const arrayBuffer = await file.arrayBuffer();
            const doc = await loadPdf(arrayBuffer);
            openPdfInNewTab(file.name, arrayBuffer, doc.numPages);
          } else {
            alert('Please select the file: ' + item.name);
          }
        };
        input.click();
      }
    } catch (error) {
      alert('Could not open file. It may have been deleted or moved.');
      removeRecentFile(item.id);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-8 bg-bb-dark">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock size={28} className="text-bb-blue" />
            <h1 className="text-3xl font-bold text-bb-text">Recent PDFs</h1>
          </div>
          <p className="text-bb-muted text-lg">Quickly access your recently opened documents</p>
        </div>

        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-bb-muted flex items-center gap-2">
            <FolderOpen size={14} />
            Recent Files
          </h2>
          {recentFiles.length > 0 && (
            <button
              onClick={clearRecentFiles}
              className="text-xs text-bb-muted hover:text-red-400 flex items-center gap-1 transition-colors"
              title="Clear All"
            >
              <Trash2 size={12} />
              Clear All
            </button>
          )}
        </div>

        {recentFiles.length === 0 ? (
          <div className="bg-bb-panel border border-bb-border rounded-lg p-12 text-center">
            <FileText size={48} className="text-bb-muted mx-auto mb-4" />
            <p className="text-bb-muted text-lg mb-2">No recent files</p>
            <p className="text-bb-muted text-sm">Open a PDF to see it here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentFiles.map((item: any) => (
              <div
                key={item.id}
                className="group flex items-center justify-between p-4 bg-bb-panel border border-bb-border rounded-lg hover:border-bb-blue transition-all cursor-pointer"
                onClick={() => handleOpenRecentFile(item)}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2 bg-bb-blue/10 rounded-lg shrink-0">
                    <FileText size={20} className="text-bb-blue" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-bb-text truncate">{item.name}</div>
                    <div className="text-xs text-bb-muted flex items-center gap-2 mt-1">
                      <Clock size={10} />
                      {getRelativeTime(item.lastOpened)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentFile(item.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:text-red-400 text-bb-muted transition-all"
                  title="Remove from recent"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <p className="text-bb-muted text-sm">
            Recent files are stored locally in your browser
          </p>
        </div>
      </div>
    </div>
  );
}
