import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { extractAllText } from '../utils/pdfSummarize';
import { callGeminiEngParams } from '../utils/firebaseAi';
import { Ruler, Loader2, Download, Copy, Check, X, FileText, FileSpreadsheet } from 'lucide-react';

interface EngParam {
  category: string;
  parameter: string;
  value: string;
  unit: string;
  page: string;
  notes: string;
}

export default function AiEngineeringDialog({ onClose }: { onClose: () => void }) {
  const { pageCount, currentDocument } = useStore();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [params, setParams] = useState<EngParam[]>([]);
  const [rawNotes, setRawNotes] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'notes'>('table');

  const handleAnalyze = async () => {
    setError('');
    setParams([]);
    setRawNotes('');
    setLoading(true);

    try {
      setStatus('Extracting text from PDF...');
      const text = await extractAllText(pageCount, (page, total) => {
        setStatus(`Extracting text — page ${page} of ${total}...`);
      });

      if (!text.trim()) {
        setError('No text could be extracted. Try running OCR first for scanned documents.');
        setLoading(false);
        return;
      }

      setStatus('Extracting engineering parameters...');
      const result = await callGeminiEngParams({
        text,
        documentName: currentDocument?.name || 'Document',
      });

      setParams(result.data.parameters || []);
      setRawNotes(result.data.notes || '');
      setStatus('');
    } catch (err: any) {
      setError(err.message || 'Failed to extract parameters');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [['Category', 'Parameter', 'Value', 'Unit', 'Page Reference', 'Notes']];
    for (const p of params) {
      rows.push([p.category, p.parameter, p.value, p.unit, p.page, p.notes]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(csv, 'text/csv', `${currentDocument?.name || 'document'}_engineering_params.csv`);
  };

  const handleExportNotes = () => {
    const content = `Engineering & Architectural Parameters\n${'='.repeat(45)}\nDocument: ${currentDocument?.name || 'Document'}\nDate: ${new Date().toLocaleString()}\n\n${rawNotes}`;
    downloadFile(content, 'text/plain', `${currentDocument?.name || 'document'}_engineering_params.txt`);
  };

  const handleCopy = () => {
    const text = viewMode === 'notes' ? rawNotes : params.map((p) =>
      `[${p.category}] ${p.parameter}: ${p.value} ${p.unit} (Page ${p.page})${p.notes ? ' — ' + p.notes : ''}`
    ).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasResults = params.length > 0 || rawNotes;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2 shrink-0">
          <Ruler size={16} className="text-cyan-400" />
          <h2 className="text-sm font-bold">Engineering Parameters Extractor</h2>
          <span className="text-[10px] text-bb-muted ml-auto">
            {currentDocument?.name || 'No document'} · {pageCount} page{pageCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 flex-1 overflow-auto min-h-0">
          {/* Description */}
          {!hasResults && !loading && (
            <div className="text-[11px] text-bb-muted leading-relaxed bg-bb-dark rounded-lg border border-bb-border p-3">
              <p className="mb-2 font-medium text-bb-text">What this extracts:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <p>- Structural loads & capacities</p>
                <p>- Material specifications</p>
                <p>- Dimensions & measurements</p>
                <p>- Reinforcement details</p>
                <p>- Pressure & temperature ratings</p>
                <p>- Design codes & standards</p>
                <p>- Seismic / wind parameters</p>
                <p>- Floor areas & setbacks</p>
                <p>- MEP specifications</p>
                <p>- Safety factors & tolerances</p>
              </div>
            </div>
          )}

          {/* Progress */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-blue-300">
              <Loader2 size={12} className="animate-spin" />
              {status}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <>
              {/* View toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 text-[11px] rounded font-medium transition-colors ${
                    viewMode === 'table' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30' : 'bg-bb-hover text-bb-muted'
                  }`}
                >
                  <FileSpreadsheet size={11} className="inline mr-1" />
                  Table ({params.length})
                </button>
                <button
                  onClick={() => setViewMode('notes')}
                  className={`px-3 py-1 text-[11px] rounded font-medium transition-colors ${
                    viewMode === 'notes' ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30' : 'bg-bb-hover text-bb-muted'
                  }`}
                >
                  <FileText size={11} className="inline mr-1" />
                  Notes
                </button>
                <div className="flex-1" />
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[10px] text-bb-muted hover:text-bb-text transition-colors"
                >
                  {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>

              {/* Table view */}
              {viewMode === 'table' && params.length > 0 && (
                <div className="border border-bb-border rounded-lg overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-bb-dark text-bb-muted text-left">
                        <th className="px-2 py-2 font-semibold w-[100px]">Category</th>
                        <th className="px-2 py-2 font-semibold w-[140px]">Parameter</th>
                        <th className="px-2 py-2 font-semibold w-[90px]">Value</th>
                        <th className="px-2 py-2 font-semibold w-[60px]">Unit</th>
                        <th className="px-2 py-2 font-semibold w-[50px]">Page</th>
                        <th className="px-2 py-2 font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {params.map((p, i) => (
                        <tr key={i} className="border-t border-bb-border hover:bg-bb-hover/50">
                          <td className="px-2 py-1.5 text-cyan-400 font-medium">{p.category}</td>
                          <td className="px-2 py-1.5 text-bb-text font-medium">{p.parameter}</td>
                          <td className="px-2 py-1.5 text-bb-text font-mono">{p.value}</td>
                          <td className="px-2 py-1.5 text-bb-muted">{p.unit}</td>
                          <td className="px-2 py-1.5 text-amber-400 font-mono">{p.page}</td>
                          <td className="px-2 py-1.5 text-bb-muted">{p.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Notes view */}
              {viewMode === 'notes' && rawNotes && (
                <div className="bg-bb-dark border border-bb-border rounded-lg p-4 text-[12px] text-bb-text leading-relaxed whitespace-pre-wrap font-mono max-h-[400px] overflow-auto">
                  {rawNotes}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-2 justify-between shrink-0">
          <span className="text-[10px] text-bb-muted">
            {params.length > 0 ? `${params.length} parameters found` : 'Analyze the current PDF'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors">
              Close
            </button>
            {hasResults && (
              <>
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors flex items-center gap-1.5"
                >
                  <FileSpreadsheet size={12} />
                  Export CSV
                </button>
                <button
                  onClick={handleExportNotes}
                  className="px-3 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors flex items-center gap-1.5"
                >
                  <FileText size={12} />
                  Export .txt
                </button>
              </>
            )}
            {!loading && !hasResults && (
              <button
                onClick={handleAnalyze}
                disabled={pageCount === 0}
                className="px-4 py-1.5 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Ruler size={12} />
                Extract Parameters
              </button>
            )}
            {hasResults && (
              <button
                onClick={() => { setParams([]); setRawNotes(''); setError(''); }}
                className="px-3 py-1.5 text-xs bg-bb-blue hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1.5"
              >
                Re-analyze
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function downloadFile(content: string, type: string, name: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
