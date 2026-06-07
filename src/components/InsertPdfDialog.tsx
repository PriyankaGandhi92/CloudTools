import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, ArrowUp, ArrowDown, Trash2, FileText, AlertCircle, GripVertical } from 'lucide-react';
import { useStore } from '../store/useStore';
import { insertPdfAt, getPageCount, loadPdf, getSegments } from '../utils/pdfRenderer';
import { PDFDocument } from 'pdf-lib';

interface InsertPdfDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PdfFileEntry {
  id: string;
  file: File;
  name: string;
  pageCount: number;
  buffer: ArrayBuffer;
}

export default function InsertPdfDialog({ isOpen, onClose }: InsertPdfDialogProps) {
  const { pageCount: totalPages, setPageCount, currentPage, annotations, updateAnnotation, setViewKey } = useStore();
  const [selectedFiles, setSelectedFiles] = useState<PdfFileEntry[]>([]);
  const [insertPosition, setInsertPosition] = useState<number>(currentPage);
  const [insertMode, setInsertMode] = useState<'after' | 'before'>('after');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    const newEntries: PdfFileEntry[] = [];

    for (const file of files) {
      if (file.type !== 'application/pdf') {
        setError(`Skipping non-PDF file: ${file.name}`);
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();
        const tempDoc = await PDFDocument.load(buffer.slice(0));
        const pageCount = tempDoc.getPageCount();
        
        newEntries.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          pageCount,
          buffer: buffer.slice(0), // Clone the buffer
        });
      } catch (err) {
        setError(`Failed to read ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (newEntries.length > 0) {
      setSelectedFiles(prev => [...prev, ...newEntries]);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const moveFile = useCallback((index: number, direction: 'up' | 'down') => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      if (direction === 'up' && index > 0) {
        [newFiles[index], newFiles[index - 1]] = [newFiles[index - 1], newFiles[index]];
      } else if (direction === 'down' && index < newFiles.length - 1) {
        [newFiles[index], newFiles[index + 1]] = [newFiles[index + 1], newFiles[index]];
      }
      return newFiles;
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleInsert = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one PDF file');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Calculate the actual insertion point (0-indexed)
      // User sees 1-indexed pages, so "after page 3" means insert at index 3 (between page 3 and 4)
      // "before page 3" means insert at index 2 (between page 2 and 3)
      const zeroIndexedInsertPoint = insertMode === 'after' ? insertPosition + 1 : insertPosition;
      
      const oldTotal = getPageCount();
      let totalInsertedPages = 0;
      // Insert PDFs in sequence at the specified position
      for (const entry of selectedFiles) {
        const total = await insertPdfAt(entry.buffer, zeroIndexedInsertPoint + totalInsertedPages);
        totalInsertedPages += entry.pageCount;
      }
      
      const newPageCount = getPageCount();
      const pagesAdded = newPageCount - oldTotal;
      
      // Shift all subsequent annotations down so they stay on their original visual pages
      const annotationsToShift = annotations.filter(a => a.pageIndex >= zeroIndexedInsertPoint);
      annotationsToShift.forEach(ann => {
        updateAnnotation(ann.id, { pageIndex: ann.pageIndex + pagesAdded });
      });
      
      setPageCount(newPageCount);

      alert(`Successfully inserted ${selectedFiles.length} PDF(s) with ${totalInsertedPages} pages ${insertMode} page ${insertPosition + 1}.`);
      
      // Reset and close
      setSelectedFiles([]);
      setInsertPosition(currentPage);
      onClose();
    } catch (err) {
      console.error('Insert failed:', err);
      setError('Failed to insert PDFs: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bb-panel border border-bb-border rounded-lg shadow-xl w-[600px] max-w-[90vw] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border shrink-0">
          <h2 className="text-lg font-semibold text-bb-text flex items-center gap-2">
            <Upload size={20} className="text-bb-blue" />
            Insert PDF Pages
          </h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Position Selection */}
          <div className="bg-bb-dark rounded-lg p-3 border border-bb-border">
            <label className="block text-sm font-medium text-bb-text mb-2">
              Insert Position
            </label>
            <div className="flex items-center gap-3">
              <select
                value={insertMode}
                onChange={(e) => setInsertMode(e.target.value as 'after' | 'before')}
                className="px-3 py-2 bg-bb-panel border border-bb-border rounded text-bb-text text-sm focus:outline-none focus:border-bb-blue"
              >
                <option value="after">After page</option>
                <option value="before">Before page</option>
              </select>
              <select
                value={insertPosition}
                onChange={(e) => setInsertPosition(Number(e.target.value))}
                className="px-3 py-2 bg-bb-panel border border-bb-border rounded text-bb-text text-sm focus:outline-none focus:border-bb-blue flex-1"
              >
                {Array.from({ length: totalPages }, (_, i) => (
                  <option key={i} value={i}>
                    {i + 1} {i === currentPage && '(current)'}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-bb-muted mt-2">
              PDFs will be inserted {insertMode} page {insertPosition + 1} of {totalPages}
            </p>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-bb-text mb-2">
              Select PDF Files
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-3 px-4 border-2 border-dashed border-bb-border rounded-lg text-bb-muted hover:border-bb-blue hover:text-bb-text transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={18} />
                <span>Click to select PDF files (multiple allowed)</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-bb-text mb-2">
                PDFs to Insert ({selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}, 
                {selectedFiles.reduce((sum, f) => sum + f.pageCount, 0)} pages)
              </label>
              <p className="text-xs text-bb-muted mb-2">
                Use arrows to reorder. Top file will be inserted first.
              </p>
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {selectedFiles.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 p-2 bg-bb-dark rounded border border-bb-border"
                  >
                    <GripVertical size={16} className="text-bb-muted" />
                    <span className="text-sm text-bb-muted w-6">{index + 1}.</span>
                    <FileText size={16} className="text-bb-blue shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-bb-text truncate">{entry.name}</p>
                      <p className="text-xs text-bb-muted">{entry.pageCount} pages</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveFile(index, 'up')}
                        disabled={index === 0}
                        className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => moveFile(index, 'down')}
                        disabled={index === selectedFiles.length - 1}
                        className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        onClick={() => removeFile(entry.id)}
                        className="p-1 hover:bg-red-500/20 rounded text-bb-muted hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bb-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-bb-muted hover:text-bb-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={isProcessing || selectedFiles.length === 0}
            className="px-4 py-2 bg-bb-blue text-white text-sm font-medium rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing 
              ? 'Inserting...' 
              : `Insert ${selectedFiles.length > 0 ? selectedFiles.length + ' PDF' + (selectedFiles.length !== 1 ? 's' : '') : 'PDFs'}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
