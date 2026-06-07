import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import type { BIMType } from '../types';
import { DoorOpen, LayoutGrid, Building, Shield } from 'lucide-react';

interface BimTypeSelectorProps {
  onSelect: (type: BIMType) => void;
  onClose: () => void;
}

export default function BimTypeSelector({ onSelect, onClose }: BimTypeSelectorProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true);

  console.log('BimTypeSelector rendered, open:', open);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      console.log('BimTypeSelector element:', menuRef.current);
      console.log('BimTypeSelector dimensions:', {
        width: menuRef.current.offsetWidth,
        height: menuRef.current.offsetHeight,
        left: menuRef.current.style.left,
        top: menuRef.current.style.top,
        zIndex: menuRef.current.style.zIndex,
        display: window.getComputedStyle(menuRef.current).display,
        visibility: window.getComputedStyle(menuRef.current).visibility,
        opacity: window.getComputedStyle(menuRef.current).opacity,
      });
    }
  }, [open]);

  if (!open) return null;

  const bimTypes: { type: BIMType; label: string; icon: React.ReactNode; description: string }[] = [
    { type: 'door', label: 'Door', icon: <DoorOpen size={20} />, description: 'Door (plan view)' },
    { type: 'wall', label: 'Wall', icon: <LayoutGrid size={20} />, description: 'Wall with parametric data' },
    { type: 'supplier', label: 'Supplier', icon: <Building size={20} />, description: 'Supplier information' },
    { type: 'fire-rating', label: 'Fire Rating', icon: <Shield size={20} />, description: 'Fire rating (AI-enabled)' },
  ];

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="fixed bg-white border border-gray-300 rounded-lg shadow-2xl py-2 min-w-[200px]"
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999 }}
    >
      <div className="px-3 py-2 text-sm font-semibold text-gray-900 border-b border-gray-300 mb-2">
        Select BIM Type
      </div>
      {bimTypes.map((bim) => (
        <button
          key={bim.type}
          onClick={() => {
            onSelect(bim.type);
            setOpen(false);
            onClose();
          }}
          className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 text-left transition-colors"
        >
          <div className="text-blue-600">{bim.icon}</div>
          <div>
            <div className="text-sm font-medium text-gray-900">{bim.label}</div>
            <div className="text-xs text-gray-600">{bim.description}</div>
          </div>
        </button>
      ))}
    </div>,
    document.body
  );
}
