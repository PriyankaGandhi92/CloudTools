import React, { useState, useEffect, useRef } from 'react';

interface TextAnnotationEditorProps {
  isOpen: boolean;
  onClose: (data: { text: string; fontSize: number; fontFamily: string; color: string; align: 'left' | 'center' | 'right'; lineHeight: number } | null) => void;
  initialData: {
    text: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    align: 'left' | 'center' | 'right';
    lineHeight: number;
  };
}

const FONT_FAMILIES = [
  { value: 'Arial', label: 'Arial' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Verdana', label: 'Verdana' },
  { value: 'Tahoma', label: 'Tahoma' },
  { value: 'Impact', label: 'Impact' },
];

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export default function TextAnnotationEditor({ isOpen, onClose, initialData }: TextAnnotationEditorProps) {
  const [text, setText] = useState(initialData.text);
  const [fontSize, setFontSize] = useState(initialData.fontSize);
  const [fontFamily, setFontFamily] = useState(initialData.fontFamily);
  const [color, setColor] = useState(initialData.color);
  const [align, setAlign] = useState(initialData.align);
  const [lineHeight, setLineHeight] = useState(initialData.lineHeight);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpen = useRef(isOpen);

  useEffect(() => {
    // Only reset state when dialog opens (false -> true transition)
    // Not when initialData changes while dialog is already open
    if (isOpen && !prevIsOpen.current) {
      setText(initialData.text);
      setFontSize(initialData.fontSize);
      setFontFamily(initialData.fontFamily);
      setColor(initialData.color);
      setAlign(initialData.align);
      setLineHeight(initialData.lineHeight);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, initialData]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose(null);
    }
  };

  const handleSave = () => {
    onClose({ text, fontSize, fontFamily, color, align, lineHeight });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e1e1e] border border-bb-border rounded-lg shadow-xl p-6 w-[500px] text-bb-text">
        <h3 className="text-lg font-bold mb-4">Edit Text Annotation</h3>
        
        <div className="space-y-4">
          {/* Text Content */}
          <div>
            <label className="block text-sm font-medium mb-2 text-bb-muted">Text Content</label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={4}
              className="w-full px-3 py-2 bg-[#252526] border border-bb-border rounded text-bb-text focus:outline-none focus:border-bb-blue resize-none"
              placeholder="Enter your text here..."
            />
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-sm font-medium mb-2 text-bb-muted">Font Family</label>
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              className="w-full px-3 py-2 bg-[#252526] border border-bb-border rounded text-bb-text focus:outline-none focus:border-bb-blue"
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size and Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-bb-muted">Font Size (px)</label>
              <input
                type="number"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                min={8}
                max={200}
                className="w-full px-3 py-2 bg-[#252526] border border-bb-border rounded text-bb-text focus:outline-none focus:border-bb-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-bb-muted">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#252526] border border-bb-border rounded text-bb-text focus:outline-none focus:border-bb-blue"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          {/* Alignment and Line Height */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-bb-muted">Alignment</label>
              <select
                value={align}
                onChange={(e) => setAlign(e.target.value as 'left' | 'center' | 'right')}
                className="w-full px-3 py-2 bg-[#252526] border border-bb-border rounded text-bb-text focus:outline-none focus:border-bb-blue"
              >
                {ALIGN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2 text-bb-muted">Line Height</label>
              <input
                type="number"
                value={lineHeight}
                onChange={(e) => setLineHeight(Number(e.target.value))}
                min={1}
                max={3}
                step={0.1}
                className="w-full px-3 py-2 bg-[#252526] border border-bb-border rounded text-bb-text focus:outline-none focus:border-bb-blue"
              />
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-sm font-medium mb-2 text-bb-muted">Preview</label>
            <div className="bg-white p-4 rounded min-h-[80px]">
              <div
                style={{
                  fontFamily,
                  fontSize: `${fontSize}px`,
                  color,
                  textAlign: align as any,
                  lineHeight,
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word',
                }}
              >
                {text || 'Preview text...'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => onClose(null)}
            className="px-4 py-2 rounded text-sm hover:bg-bb-hover text-bb-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 rounded text-sm font-bold hover:bg-blue-500"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
