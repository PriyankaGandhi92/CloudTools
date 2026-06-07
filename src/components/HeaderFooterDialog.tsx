import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { Watermark } from '../store/useStore';

interface HeaderFooterDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HeaderFooterDialog({ isOpen, onClose }: HeaderFooterDialogProps) {
  const { watermarks, setWatermarks } = useStore();
  
  // State for the 6 standard positions
  const [inputs, setInputs] = useState({
    'top-left': '', 'top-center': '', 'top-right': '',
    'bottom-left': '', 'bottom-center': '', 'bottom-right': ''
  });

  // Load existing headers/footers when dialog opens
  useEffect(() => {
    if (isOpen) {
      const currentInputs = { ...inputs };
      watermarks.forEach(w => {
        if ((w.type === 'header' || w.type === 'footer') && w.position in currentInputs) {
          currentInputs[w.position as keyof typeof inputs] = w.text;
        }
      });
      setInputs(currentInputs);
    }
  }, [isOpen, watermarks]);

  const handleSave = () => {
    // 1. Filter out old headers and footers, keeping standard watermarks
    const newWatermarks = watermarks.filter(w => w.type === 'watermark');

    // 2. Add new headers and footers
    Object.entries(inputs).forEach(([position, text]) => {
      if (text.trim()) {
        newWatermarks.push({
          id: crypto.randomUUID(),
          type: position.startsWith('top') ? 'header' : 'footer',
          text: text.trim(),
          pages: 'all', // Or add a UI toggle for this later
          position: position as Watermark['position'],
          opacity: 1,
          fontSize: 12,
          fontFamily: 'Arial',
          color: '#666666'
        });
      }
    });

    setWatermarks(newWatermarks);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] border border-bb-border rounded-lg p-6 w-[600px] text-bb-text">
        <h2 className="text-lg font-bold mb-4">Headers & Footers</h2>
        
        <div className="space-y-6">
          {/* Headers */}
          <div>
            <h3 className="text-sm text-bb-muted mb-2 border-b border-bb-border pb-1">Header</h3>
            <div className="grid grid-cols-3 gap-2">
              <input value={inputs['top-left']} onChange={e => setInputs({...inputs, 'top-left': e.target.value})} placeholder="Left" className="bg-[#252526] p-2 text-xs rounded border border-bb-border outline-none" />
              <input value={inputs['top-center']} onChange={e => setInputs({...inputs, 'top-center': e.target.value})} placeholder="Center" className="bg-[#252526] p-2 text-xs rounded border border-bb-border outline-none text-center" />
              <input value={inputs['top-right']} onChange={e => setInputs({...inputs, 'top-right': e.target.value})} placeholder="Right" className="bg-[#252526] p-2 text-xs rounded border border-bb-border outline-none text-right" />
            </div>
          </div>

          {/* Footers */}
          <div>
            <h3 className="text-sm text-bb-muted mb-2 border-b border-bb-border pb-1">Footer</h3>
            <div className="grid grid-cols-3 gap-2">
              <input value={inputs['bottom-left']} onChange={e => setInputs({...inputs, 'bottom-left': e.target.value})} placeholder="Left" className="bg-[#252526] p-2 text-xs rounded border border-bb-border outline-none" />
              <input value={inputs['bottom-center']} onChange={e => setInputs({...inputs, 'bottom-center': e.target.value})} placeholder="Center" className="bg-[#252526] p-2 text-xs rounded border border-bb-border outline-none text-center" />
              <input value={inputs['bottom-right']} onChange={e => setInputs({...inputs, 'bottom-right': e.target.value})} placeholder="Right" className="bg-[#252526] p-2 text-xs rounded border border-bb-border outline-none text-right" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm hover:bg-bb-hover">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 bg-blue-600 rounded text-sm font-bold hover:bg-blue-500">Apply</button>
        </div>
      </div>
    </div>
  );
}
