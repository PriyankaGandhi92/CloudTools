import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Upload, Image as ImageIcon, Type, Save, Loader2, Sparkles, Plus, Trash2, User, AlertTriangle, MapPin } from 'lucide-react';
import type { PinContent, ChecklistItem } from '../types';
import { analyzeInspectionPhoto } from '../utils/inspectionPhotoAnalyze';

interface PinContentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: PinContent) => void;
  initialContent?: PinContent;
}

export default function PinContentDialog({ isOpen, onClose, onSave, initialContent }: PinContentDialogProps) {
  const [name, setName] = useState(initialContent?.name || '');
  const [text, setText] = useState(initialContent?.text || '');
  const [images, setImages] = useState<string[]>(initialContent?.images || []);
  const [status, setStatus] = useState<'Open' | 'In Progress' | 'Complete' | 'Verified'>(initialContent?.status || 'Open');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High'>(initialContent?.priority || 'Medium');
  const [assignee, setAssignee] = useState(initialContent?.assignee || '');
  const [category, setCategory] = useState(initialContent?.category || '');
  const [gps, setGps] = useState<{ lat: number; lng: number } | undefined>(initialContent?.gps);
  const [checklists, setChecklists] = useState<ChecklistItem[]>(initialContent?.checklists || []);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // Update state when initialContent changes (e.g., when opening dialog for different pin)
  useEffect(() => {
    setName(initialContent?.name || '');
    setText(initialContent?.text || '');
    setImages(initialContent?.images || []);
    setStatus(initialContent?.status || 'Open');
    setPriority(initialContent?.priority || 'Medium');
    setAssignee(initialContent?.assignee || '');
    setCategory(initialContent?.category || '');
    setGps(initialContent?.gps);
    setChecklists(initialContent?.checklists || []);
  }, [initialContent]);

  // Auto-capture GPS when the modal opens (if it doesn't already have coordinates)
  useEffect(() => {
    if (isOpen && !gps && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => setGps({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => console.warn('GPS capture failed or denied:', error.message),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [isOpen, gps]);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCameraCapture = () => {
    fileInputRef.current?.click();
  };

  const handleCameraAi = () => {
    aiInputRef.current?.click();
  };

  const handleAiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Reset the input so the same file can be re-selected later
    if (aiInputRef.current) aiInputRef.current.value = '';

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Full = reader.result as string;
        setImages((prev) => [...prev, base64Full]);

        if (aiAnalyzing) return;
        setAiAnalyzing(true);
        try {
          const justBase64 = base64Full.split(',')[1];
          const result = await analyzeInspectionPhoto(justBase64);
          if (result.locationName && !name) {
            setName(result.locationName);
          }
          if (result.notes) {
            setText((prev) => (prev ? `${prev}\n\n${result.notes}` : result.notes));
          }
          if (result.priority) {
            setPriority(result.priority);
          }
        } catch (err: any) {
          console.error('Pin AI analysis failed:', err);
          alert(`AI analysis failed: ${err?.message || 'Unknown error'}`);
        } finally {
          setAiAnalyzing(false);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({ name, text, images, status, priority, assignee, category, gps, checklists });
    onClose();
  };

  const handleAddChecklistItem = () => {
    if (!newChecklistItem.trim()) return;
    const newItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newChecklistItem.trim(),
      isChecked: false,
    };
    setChecklists([...checklists, newItem]);
    setNewChecklistItem('');
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklists(checklists.map(item =>
      item.id === id ? { ...item, isChecked: !item.isChecked } : item
    ));
  };

  const handleDeleteChecklistItem = (id: string) => {
    setChecklists(checklists.filter(item => item.id !== id));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-bb-border">
          <div>
            {name ? (
              <>
                <h2 className="text-lg font-semibold text-bb-text">{name}</h2>
                <p className="text-sm text-bb-muted mt-1">Inspection Location Content</p>
              </>
            ) : (
              <h2 className="text-lg font-semibold text-bb-text">Inspection Location Content</h2>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {/* Name Input */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              <Type size={16} />
              Location Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter location name..."
              className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
            />
            {gps && (
              <div className="flex items-center gap-1 text-[10px] text-bb-blue bg-blue-500/10 w-fit px-2 py-0.5 rounded-full mt-1">
                <MapPin size={10} />
                {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
              </div>
            )}
          </div>

          {/* Status & Priority Row */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text focus:outline-none focus:border-blue-500"
              >
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Complete">Complete</option>
                <option value="Verified">Verified</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                <AlertTriangle size={16} />
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text focus:outline-none focus:border-blue-500"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          {/* Assignee Input */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              <User size={16} />
              Assignee
            </label>
            <input
              type="text"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="Enter assignee name..."
              className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Category Dropdown */}
          <div className="mb-4">
            <label className="text-[10px] uppercase text-bb-muted font-semibold tracking-wider mb-2 block">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-bb-dark border border-bb-border rounded p-2 text-sm text-bb-text focus:border-bb-blue outline-none"
            >
              <option value="">Uncategorized</option>
              <option value="Electrical">Electrical</option>
              <option value="Plumbing">Plumbing</option>
              <option value="HVAC">HVAC</option>
              <option value="Safety">Safety</option>
              <option value="Structural">Structural</option>
              <option value="Fire Protection">Fire Protection</option>
              <option value="Finishes">Finishes</option>
            </select>
          </div>

          {/* Text Input */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              <Type size={16} />
              Notes
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add inspection notes..."
              className="w-full h-32 bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted resize-none focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Checklist Section */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              Checklist
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                placeholder="Add checklist item..."
                className="flex-1 bg-bb-dark border border-bb-border rounded p-2 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddChecklistItem}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            {checklists.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {checklists.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 bg-bb-dark rounded p-2 border border-bb-border"
                  >
                    <input
                      type="checkbox"
                      checked={item.isChecked}
                      onChange={() => handleToggleChecklistItem(item.id)}
                      className="w-4 h-4 rounded"
                    />
                    <span className={`flex-1 text-sm ${item.isChecked ? 'line-through text-bb-muted' : 'text-bb-text'}`}>
                      {item.text}
                    </span>
                    <button
                      onClick={() => handleDeleteChecklistItem(item.id)}
                      className="p-1 hover:bg-red-600/20 text-red-400 rounded transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Images Section */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              <ImageIcon size={16} />
              Photos
            </label>

            {/* Image Upload Buttons */}
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={handleCameraAi}
                disabled={aiAnalyzing}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Take or pick a photo and let AI auto-fill the location name and notes"
              >
                {aiAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Camera size={16} />
                    Camera+AI
                  </>
                )}
              </button>
              <button
                onClick={handleCameraCapture}
                disabled={aiAnalyzing}
                className="flex items-center gap-2 px-3 py-2 bg-bb-hover hover:bg-bb-border text-bb-text text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Camera size={16} />
                Camera
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={aiAnalyzing}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={16} />
                Upload
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                disabled={aiAnalyzing}
                className="hidden"
              />
              <input
                ref={aiInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleAiImageUpload}
                disabled={aiAnalyzing}
                className="hidden"
              />
            </div>

            {aiAnalyzing && (
              <div className="flex items-center gap-2 text-xs text-blue-300 mb-3">
                <Sparkles size={12} className="animate-pulse" />
                <span>Analyzing photo with AI to auto-fill location name and notes...</span>
              </div>
            )}

            {/* Image Preview Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-24 object-cover rounded border border-bb-border"
                    />
                    <button
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-600/80 hover:bg-red-600 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-bb-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bb-dark hover:bg-bb-hover text-bb-text text-sm rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
