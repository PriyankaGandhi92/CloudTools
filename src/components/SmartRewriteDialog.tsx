import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { Sparkles, Loader2, ArrowRight, CheckCircle, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { executeCloudCommand } from '../utils/stirlingApi';

interface SmartRewriteProps {
  originalText: string;
  onClose: () => void;
}

export default function SmartRewriteDialog({ originalText, onClose }: SmartRewriteProps) {
  const { pdfData, setPdfData } = useStore();
  const [targetText, setTargetText] = useState(originalText);
  const [prompt, setPrompt] = useState('Rewrite this paragraph to sound more professional and concise.');
  const [status, setStatus] = useState<'idle' | 'ai' | 'to-word' | 'modifying' | 'to-pdf' | 'success'>('idle');
  const [error, setError] = useState('');

  // Python Cloud Run microservice URL (canonical URL from Cloud Run)
  const PYTHON_SERVICE_URL = 'https://docx-service-lwizeqrhpq-uc.a.run.app/replace-text';

  const executeRoundTrip = async () => {
    if (!pdfData) return setError("No PDF loaded in the workspace.");
    setError('');

    try {
      // ==========================================
      // 1. CALL AI FOR REWRITE (via Firebase proxy to avoid CORS)
      // ==========================================
      setStatus('ai');
      
      const rewriteCall = await httpsCallable(functions, 'anthropicRewrite')({
        prompt,
        text: targetText
      });
      
      const { rewrittenText } = rewriteCall.data as { rewrittenText: string };

      if (!rewrittenText) throw new Error("AI failed to generate replacement text.");

      // ==========================================
      // 2. CONVERT PDF TO WORD (Stirling PDF)
      // ==========================================
      setStatus('to-word');
      
      const wordResult = await executeCloudCommand('TO-WORD', pdfData, {});
      
      if (!wordResult.success || !wordResult.data) {
        throw new Error(wordResult.error || "Failed to convert PDF to Word via Stirling.");
      }
      
      const wordBlob = resultDataToBlob(wordResult.data);

      // ==========================================
      // 3. SAFE TEXT REPLACEMENT (Python Microservice)
      // ==========================================
      setStatus('modifying');
      
      const formData = new FormData();
      formData.append('file', wordBlob, 'document.docx');
      formData.append('old_text', targetText.trim());
      formData.append('new_text', rewrittenText.trim());

      const pythonResponse = await fetch(PYTHON_SERVICE_URL, {
        method: 'POST',
        body: formData,
      });

      if (!pythonResponse.ok) {
        throw new Error("Python microservice failed to replace text.");
      }
      const modifiedWordArrayBuffer = await pythonResponse.arrayBuffer();

      // ==========================================
      // 4. CONVERT WORD BACK TO PDF (Stirling PDF)
      // ==========================================
      setStatus('to-pdf');
      const pdfResult = await executeCloudCommand('FILE-TO-PDF', modifiedWordArrayBuffer, {});
      
      if (!pdfResult.success || !pdfResult.data) {
        throw new Error(pdfResult.error || "Failed to compile final PDF.");
      }
      const finalPdfArrayBuffer = await resultDataToArrayBuffer(pdfResult.data);

      // ==========================================
      // 5. UPDATE WORKSPACE
      // ==========================================
      setStatus('success');
      setPdfData(finalPdfArrayBuffer);
      
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during the round-trip process.");
      setStatus('idle');
    }
  };

  // Helper to convert result data to Blob
  const resultDataToBlob = (data: ArrayBuffer | Blob): Blob => {
    if (data instanceof Blob) return data;
    return new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  };

  // Helper to convert result data to ArrayBuffer
  const resultDataToArrayBuffer = async (data: ArrayBuffer | Blob): Promise<ArrayBuffer> => {
    if (data instanceof ArrayBuffer) return data;
    return await data.arrayBuffer();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-bb-sidebar border border-bb-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-bb-border bg-bb-dark">
          <h2 className="text-white font-bold flex items-center gap-2 text-sm">
            <Sparkles size={16} className="text-purple-400" />
            AI Document Reflow
          </h2>
          <button onClick={onClose} className="text-bb-muted hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] text-bb-muted uppercase tracking-wider font-bold mb-1 block">Target Text</label>
            <textarea
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              className="w-full bg-black/30 border border-bb-border p-3 rounded text-xs text-white outline-none focus:border-purple-500 h-20 resize-none"
              placeholder="Enter the text you want to rewrite..."
            />
          </div>

          <div>
            <label className="text-[10px] text-bb-muted uppercase tracking-wider font-bold mb-1 block">AI Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-bb-panel border border-bb-border rounded p-3 text-xs text-white outline-none focus:border-purple-500 h-20 resize-none"
              placeholder="e.g., Translate to Spanish, make it sound more urgent, etc."
            />
          </div>

          {/* Progress Indicators */}
          {status !== 'idle' && (
            <div className="bg-bb-dark border border-bb-border rounded p-3 space-y-2">
              <div className={`flex items-center gap-2 text-xs ${status === 'ai' ? 'text-purple-400 font-bold' : 'text-bb-muted'}`}>
                {status === 'ai' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                1. Generating AI Rewrite
              </div>
              <div className={`flex items-center gap-2 text-xs ${status === 'to-word' ? 'text-blue-400 font-bold' : status === 'ai' ? 'text-bb-muted/50' : 'text-bb-muted'}`}>
                {status === 'to-word' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                2. Decompiling PDF to DOCX
              </div>
              <div className={`flex items-center gap-2 text-xs ${status === 'modifying' ? 'text-yellow-400 font-bold' : ['ai', 'to-word'].includes(status) ? 'text-bb-muted/50' : 'text-bb-muted'}`}>
                {status === 'modifying' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                3. Python DOM parsing & text injection
              </div>
              <div className={`flex items-center gap-2 text-xs ${status === 'to-pdf' ? 'text-green-400 font-bold' : ['ai', 'to-word', 'modifying'].includes(status) ? 'text-bb-muted/50' : 'text-bb-muted'}`}>
                {status === 'to-pdf' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                4. Re-rendering final PDF
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-bb-border bg-bb-panel flex justify-end gap-3">
          <button 
            onClick={onClose}
            disabled={status !== 'idle' && status !== 'success'}
            className="px-4 py-2 text-xs font-medium text-bb-text hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={executeRoundTrip}
            disabled={status !== 'idle'}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {status === 'idle' ? (
              <>Start Smart Reflow <ArrowRight size={14} /></>
            ) : status === 'success' ? (
              <>Complete <CheckCircle size={14} /></>
            ) : (
              <>Processing...</>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
