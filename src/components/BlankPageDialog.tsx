import React, { useState } from 'react';
import { X } from 'lucide-react';

type PageSize = 'letter' | '11x17' | 'a4' | 'legal';

interface BlankPageDialogProps {
  onClose: () => void;
  onInsert: (pageSize: PageSize) => void;
}

export default function BlankPageDialog({ onClose, onInsert }: BlankPageDialogProps) {
  const [selectedSize, setSelectedSize] = useState<PageSize>('letter');

  const pageSizes = [
    { value: 'letter' as PageSize, label: 'Letter', dimensions: '8.5" x 11"' },
    { value: '11x17' as PageSize, label: '11 x 17', dimensions: '11" x 17"' },
    { value: 'a4' as PageSize, label: 'A4', dimensions: '210mm x 297mm' },
    { value: 'legal' as PageSize, label: 'Legal', dimensions: '8.5" x 14"' },
  ];

  const handleInsert = () => {
    onInsert(selectedSize);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-bb-panel border border-bb-border rounded-lg shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bb-border">
          <h2 className="text-lg font-semibold text-bb-text">Insert Blank Page</h2>
          <button
            onClick={onClose}
            className="text-bb-muted hover:text-bb-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-bb-muted mb-4">Select page size:</p>
          <div className="space-y-2">
            {pageSizes.map((size) => (
              <button
                key={size.value}
                onClick={() => setSelectedSize(size.value)}
                className={`w-full flex items-center justify-between p-3 rounded border transition-colors ${
                  selectedSize === size.value
                    ? 'border-bb-accent bg-bb-accent/10'
                    : 'border-bb-border hover:border-bb-accent/50 bg-bb-dark'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded border ${
                      selectedSize === size.value
                        ? 'border-bb-accent bg-bb-accent'
                        : 'border-bb-border'
                    }`}
                  >
                    {selectedSize === size.value && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-sm" />
                      </div>
                    )}
                  </div>
                  <span className="text-bb-text font-medium">{size.label}</span>
                </div>
                <span className="text-xs text-bb-muted">{size.dimensions}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-bb-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-bb-text hover:bg-bb-hover rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            className="px-4 py-2 bg-bb-accent hover:bg-bb-accent/90 text-white rounded transition-colors"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
