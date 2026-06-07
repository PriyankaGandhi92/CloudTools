import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Clock, Loader2, Download, FolderOpen, FileText } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface TimelineEntry {
  name: string;
  summary: string;
  date: string;
}

export default function AiTimelineDialog({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleSelectFolder = async () => {
    setError('');
    setEntries([]);
    setLoading(true);

    try {
      // Get API key from Firebase Functions
      const result = await httpsCallable(functions, 'getApiKey')();
      const apiKey = (result.data as { apiKey: string }).apiKey;

      if (!apiKey) {
        throw new Error('Failed to get API key from Firebase Functions');
      }

      // Use File System Access API to pick a folder
      const dirHandle = await (window as any).showDirectoryPicker();
      const entries: TimelineEntry[] = [];
      let processed = 0;
      const maxFiles = 20; // Limit to 20 files for demo

      setStatus('Reading files...');
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && processed < maxFiles) {
          const file = await entry.getFile();
          if (file.type === 'application/pdf') {
            setStatus(`Processing: ${file.name} (${processed + 1}/${maxFiles})`);
            setProgress({ current: processed + 1, total: maxFiles });
            
            try {
              // Extract text from PDF
              const text = await extractTextFromFile(file);
              
              // Analyze with AI
              const timelineEntry = await analyzeForTimeline(apiKey, file.name, text);
              entries.push(timelineEntry);
            } catch (err) {
              console.error(`Failed to process ${file.name}:`, err);
              entries.push({
                name: file.name,
                summary: 'Failed to analyze',
                date: 'Unknown',
              });
            }
            
            processed++;
          }
        }
      }

      // Sort by date
      entries.sort((a, b) => parseLooseDate(a.date) - parseLooseDate(b.date));

      setEntries(entries);
      setStatus('');
      setProgress({ current: 0, total: 0 });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Timeline error:', err);
        const errorMessage = err?.message || err?.toString() || 'Failed to process folder';
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    const rows = [['PDF Name', 'Summary', 'Date']];
    for (const e of entries) {
      rows.push([e.name, e.summary, e.date]);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pdf-timeline.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2 shrink-0">
          <Clock size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold">PDF Timeline Generator</h2>
          <span className="text-[10px] text-bb-muted ml-auto">Scan a folder → generate timeline CSV</span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 flex-1 overflow-auto min-h-0">
          {/* Description */}
          {!entries.length && !loading && (
            <div className="text-[11px] text-bb-muted leading-relaxed bg-bb-dark rounded-lg border border-bb-border p-3">
              <p className="mb-2 font-medium text-bb-text">How it works:</p>
              <p>1. Select a folder from your drive containing PDF files</p>
              <p>2. AI reads each PDF and extracts a 2-line summary + the key date</p>
              <p>3. Results are sorted chronologically and exported as a CSV</p>
              <p className="mt-2 text-amber-400/80">Works best with text-based PDFs (invoices, contracts, reports, letters)</p>
            </div>
          )}

          {/* Progress */}
          {loading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-blue-300">
                <Loader2 size={12} className="animate-spin" />
                {status}
              </div>
              {progress.total > 0 && (
                <div className="w-full bg-bb-dark rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full transition-all"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {/* Results table */}
          {entries.length > 0 && (
            <div className="border border-bb-border rounded-lg overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-bb-dark text-bb-muted text-left">
                    <th className="px-3 py-2 font-semibold w-[140px]">Date</th>
                    <th className="px-3 py-2 font-semibold w-[180px]">PDF Name</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="border-t border-bb-border hover:bg-bb-hover/50">
                      <td className="px-3 py-2 text-amber-400 font-mono whitespace-nowrap">{e.date}</td>
                      <td className="px-3 py-2 text-bb-text font-medium truncate max-w-[180px]" title={e.name}>{e.name}</td>
                      <td className="px-3 py-2 text-bb-muted leading-relaxed">{e.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-2 justify-between shrink-0">
          <span className="text-[10px] text-bb-muted">
            {entries.length > 0 ? `${entries.length} PDFs analyzed` : 'Select a folder to begin'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
            >
              Close
            </button>
            {entries.length > 0 && (
              <button
                onClick={handleExportCsv}
                className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors flex items-center gap-1.5"
              >
                <Download size={12} />
                Export CSV
              </button>
            )}
            {!loading && entries.length === 0 && (
              <button
                onClick={handleSelectFolder}
                className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded transition-colors flex items-center gap-1.5"
              >
                <FolderOpen size={12} />
                Select Folder
              </button>
            )}
            {entries.length > 0 && (
              <button
                onClick={() => { setEntries([]); setError(''); }}
                className="px-4 py-1.5 text-xs bg-bb-blue hover:bg-blue-600 text-white rounded transition-colors flex items-center gap-1.5"
              >
                <FolderOpen size={12} />
                Scan Another Folder
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function collectPdfs(
  dirHandle: any,
  results: { name: string; file: File }[],
  path: string,
) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
      const file = await entry.getFile();
      results.push({ name: path ? `${path}/${entry.name}` : entry.name, file });
    } else if (entry.kind === 'directory') {
      await collectPdfs(entry, results, path ? `${path}/${entry.name}` : entry.name);
    }
  }
}

async function extractTextFromFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdfjsLib = await import('pdfjs-dist');
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 10); // read first 10 pages for speed
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((it: any) => it.str).join(' ').trim();
    if (text) parts.push(text);
  }
  return parts.join('\n');
}

async function analyzeForTimeline(
  apiKey: string,
  fileName: string,
  text: string,
): Promise<TimelineEntry> {
  const truncated = text.slice(0, 15_000);

  const prompt = `Analyze this PDF document and provide EXACTLY this JSON (no markdown, no code fences):
{"summary":"<2 line summary of the document>","date":"<the most relevant date from this document in YYYY-MM-DD format, or 'Unknown' if no date found>"}

The document is named "${fileName}".
Document text:
${truncated}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 256 },
      }),
    },
  );

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  try {
    // Try to parse JSON from response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: fileName,
        summary: parsed.summary || 'No summary available',
        date: parsed.date || 'Unknown',
      };
    }
  } catch {}

  return { name: fileName, summary: raw.slice(0, 200), date: 'Unknown' };
}

function parseLooseDate(d: string): number {
  if (!d || d === 'Unknown') return Infinity;
  const t = Date.parse(d);
  return isNaN(t) ? Infinity : t;
}
