import React, { useState } from 'react';
import { X, FileText, Plus } from 'lucide-react';
import { PAGE_SIZES, PageSize, createBlankPdfWithInfo } from '../utils/createBlankPdf';

interface NewPdfDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, buffer: ArrayBuffer, pageCount: number) => void;
}

export default function NewPdfDialog({ isOpen, onClose, onCreate }: NewPdfDialogProps) {
  const [selectedSize, setSelectedSize] = useState<PageSize>(PAGE_SIZES[0]);
  const [pageCount, setPageCount] = useState(1);
  const [fileName, setFileName] = useState('Untitled');

  if (!isOpen) return null;

  const handleCreate = async () => {
    try {
      const { buffer, numPages } = await createBlankPdfWithInfo(selectedSize, pageCount);
      const name = fileName.trim() || `Untitled (${selectedSize.name})`;
      onCreate(name, buffer, numPages);
      onClose();
      // Reset form
      setPageCount(1);
      setFileName('Untitled');
      setSelectedSize(PAGE_SIZES[0]);
    } catch (error) {
      console.error('Failed to create blank PDF:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-bb-panel border border-bb-border rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bb-border">
          <h2 className="text-lg font-semibold text-bb-text flex items-center gap-2">
            <FileText size={20} className="text-bb-blue" />
            New Blank PDF
          </h2>
          <button
            onClick={onClose}
            className="text-bb-muted hover:text-bb-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* File name */}
          <div>
            <label className="block text-sm font-medium text-bb-text mb-2">
              File Name
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-full px-3 py-2 bg-bb-dark border border-bb-border rounded-md text-bb-text text-sm focus:outline-none focus:ring-2 focus:ring-bb-blue focus:border-transparent"
              placeholder="Untitled"
            />
          </div>

          {/* Page size selection */}
          <div>
            <label className="block text-sm font-medium text-bb-text mb-2">
              Page Size
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PAGE_SIZES.map((size) => (
                <button
                  key={size.name}
                  onClick={() => setSelectedSize(size)}
                  className={`p-3 border rounded-md text-sm transition-all ${
                    selectedSize.name === size.name
                      ? 'border-bb-blue bg-bb-blue/10 text-bb-text'
                      : 'border-bb-border bg-bb-dark text-bb-muted hover:border-bb-border/50 hover:text-bb-text'
                  }`}
                >
                  <div className="font-medium">{size.name}</div>
                  <div className="text-xs text-bb-muted mt-1">
                    {size.width} × {size.height} {size.unit}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Page count */}
          <div>
            <label className="block text-sm font-medium text-bb-text mb-2">
              Number of Pages
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPageCount(Math.max(1, pageCount - 1))}
                className="w-8 h-8 flex items-center justify-center bg-bb-dark border border-bb-border rounded-md text-bb-text hover:bg-bb-hover transition-colors"
              >
                <Plus size={16} className="rotate-45" />
              </button>
              <input
                type="number"
                min="1"
                max="100"
                value={pageCount}
                onChange={(e) => setPageCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                className="flex-1 px-3 py-2 bg-bb-dark border border-bb-border rounded-md text-bb-text text-sm text-center focus:outline-none focus:ring-2 focus:ring-bb-blue focus:border-transparent"
              />
              <button
                onClick={() => setPageCount(Math.min(100, pageCount + 1))}
                className="w-8 h-8 flex items-center justify-center bg-bb-dark border border-bb-border rounded-md text-bb-text hover:bg-bb-hover transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-bb-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-bb-muted hover:text-bb-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-bb-blue hover:bg-bb-blue/90 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
          >
            <Plus size={16} />
            Create PDF
          </button>
        </div>
      </div>
    </div>
  );
}
