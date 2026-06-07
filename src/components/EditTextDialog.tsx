import { useState, useEffect, useRef } from 'react';

interface EditTextDialogProps {
  initialValue: string;
  isOpen: boolean;
  onClose: (value: string | null) => void;
}

export default function EditTextDialog({ initialValue, isOpen, onClose }: EditTextDialogProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onClose(value);
    } else if (e.key === 'Escape') {
      onClose(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-bb-panel border border-bb-border rounded-lg shadow-xl p-6 w-96">
        <h3 className="text-lg font-semibold mb-4 text-bb-text">Edit Text</h3>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 bg-bb-input border border-bb-border rounded text-bb-text focus:outline-none focus:ring-2 focus:ring-bb-accent"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => onClose(null)}
            className="px-4 py-2 bg-bb-button hover:bg-bb-button-hover text-bb-text rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onClose(value)}
            className="px-4 py-2 bg-bb-accent hover:bg-bb-accent-hover text-white rounded transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
