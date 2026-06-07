import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import {
  detectFormFields,
  aiFillMapping,
  applyFill,
  loadProfile,
  saveProfile,
  PROFILE_FIELDS,
  EMPTY_PROFILE,
  type FormField,
  type UserProfile,
} from '../utils/formFill';
import {
  Wand2,
  Loader2,
  User,
  FileInput,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Save,
  Trash2,
  Edit3,
  Upload,
  X,
  FileText,
} from 'lucide-react';

type Tab = 'fill' | 'profile';

interface UploadedInfoFile {
  name: string;
  content: string; // extracted text
}

async function extractFileText(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    // Use pdf.js to extract text from uploaded PDFs
    const pdfjsLib = await import('pdfjs-dist');
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      pages.push(tc.items.map((it: any) => it.str).join(' '));
    }
    return pages.join('\n\n');
  }
  // Plain text / CSV / etc.
  return await file.text();
}

export default function AiFillDialog({ onClose }: { onClose: () => void }) {
  const { pdfData, setPdfData } = useStore();

  const [tab, setTab] = useState<Tab>('fill');
  const [profile, setProfile] = useState<UserProfile>(loadProfile);
  const [fields, setFields] = useState<FormField[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [filling, setFilling] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [editingMapping, setEditingMapping] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [infoFiles, setInfoFiles] = useState<UploadedInfoFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedInfoFile, setSelectedInfoFile] = useState<string>('');
  const infoFileRef = React.useRef<HTMLInputElement>(null);

  const handleInfoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoadingFiles(true);
    try {
      const newFiles: UploadedInfoFile[] = [];
      for (const file of Array.from(files)) {
        const content = await extractFileText(file);
        newFiles.push({ name: file.name, content });
      }
      setInfoFiles((prev) => [...prev, ...newFiles]);
      if (newFiles.length > 0 && !selectedInfoFile) setSelectedInfoFile(newFiles[0].name);
    } catch (err: any) {
      setError(`Failed to read file: ${err.message}`);
    } finally {
      setLoadingFiles(false);
      if (infoFileRef.current) infoFileRef.current.value = '';
    }
  };

  const removeInfoFile = (name: string) => {
    setInfoFiles((prev) => prev.filter((f) => f.name !== name));
    if (selectedInfoFile === name) setSelectedInfoFile(infoFiles.find((f) => f.name !== name)?.name || '');
  };

  // Detect form fields on mount
  useEffect(() => {
    if (!pdfData) return;
    setDetecting(true);
    detectFormFields(pdfData)
      .then(setFields)
      .catch((err) => setError(`Failed to detect form fields: ${err.message}`))
      .finally(() => setDetecting(false));
  }, [pdfData]);

  const handleSaveProfile = () => {
    saveProfile(profile);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const handleClearProfile = () => {
    setProfile({ ...EMPTY_PROFILE });
    saveProfile(EMPTY_PROFILE);
  };

  const handleAiFill = async () => {
    setError('');
    setFilling(true);
    setApplied(false);

    try {
      // Combine uploaded file contents with additional context
      const fileContext = infoFiles.map((f) => `--- Content from "${f.name}" ---\n${f.content}`).join('\n\n');
      const fullContext = [additionalContext, fileContext].filter(Boolean).join('\n\n');
      // AI fill feature requires Firebase Functions - temporarily disabled
      setError('AI Fill requires Firebase Functions setup. Please deploy Firebase Functions first.');
    } catch (err: any) {
      setError(err.message || 'AI fill failed');
    } finally {
      setFilling(false);
    }
  };

  const handleApply = async () => {
    if (!pdfData) return;
    setError('');
    try {
      const filledPdf = await applyFill(pdfData, mapping);
      setPdfData(filledPdf);
      setApplied(true);
    } catch (err: any) {
      setError(`Failed to apply: ${err.message}`);
    }
  };

  const updateMapping = (fieldName: string, value: string) => {
    setMapping((prev) => ({ ...prev, [fieldName]: value }));
  };

  const filledCount = Object.values(mapping).filter((v) => v.trim()).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl flex flex-col w-full max-w-3xl max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2 shrink-0">
          <Wand2 size={16} className="text-purple-400" />
          <h2 className="text-sm font-bold">AI Form Fill</h2>
          <span className="text-[10px] text-bb-muted ml-1">
            {fields.length} field{fields.length !== 1 ? 's' : ''} detected
          </span>
          <span className="flex-1" />
          <div className="flex bg-bb-dark rounded p-0.5">
            <button
              onClick={() => setTab('fill')}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                tab === 'fill' ? 'bg-purple-600/30 text-purple-300' : 'text-bb-muted hover:text-bb-text'
              }`}
            >
              <FileInput size={10} className="inline mr-1" />Fill
            </button>
            <button
              onClick={() => setTab('profile')}
              className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${
                tab === 'profile' ? 'bg-purple-600/30 text-purple-300' : 'text-bb-muted hover:text-bb-text'
              }`}
            >
              <User size={10} className="inline mr-1" />My Profile
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {tab === 'profile' && (
            <>
              <p className="text-[11px] text-bb-muted">
                Store your personal information here. AI Fill will use this data to automatically fill PDF form fields.
                Data is stored locally in your browser only.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {PROFILE_FIELDS.map((pf) => (
                  <div key={pf.key}>
                    <label className="text-[10px] text-bb-muted block mb-0.5">{pf.label}</label>
                    <input
                      type={pf.key === 'email' ? 'email' : pf.key === 'phone' ? 'tel' : 'text'}
                      value={profile[pf.key] || ''}
                      onChange={(e) => setProfile((p) => ({ ...p, [pf.key]: e.target.value }))}
                      placeholder={pf.placeholder}
                      className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-purple-500"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveProfile}
                  className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center gap-1.5"
                >
                  {profileSaved ? <Check size={12} /> : <Save size={12} />}
                  {profileSaved ? 'Saved!' : 'Save Profile'}
                </button>
                <button
                  onClick={handleClearProfile}
                  className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-red-500/20 text-bb-muted hover:text-red-400 rounded transition-colors flex items-center gap-1.5"
                >
                  <Trash2 size={12} />
                  Clear All
                </button>
              </div>
            </>
          )}

          {tab === 'fill' && (
            <>
              {/* Personal info files upload */}
              <div>
                <label className="text-[10px] text-bb-muted font-semibold block mb-1">
                  Personal Info Documents <span className="font-normal">(optional — upload PDFs or text files with your info)</span>
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => infoFileRef.current?.click()}
                    disabled={loadingFiles}
                    className="px-2.5 py-1.5 text-xs bg-bb-dark border border-bb-border hover:border-purple-500 rounded flex items-center gap-1.5 transition-colors"
                  >
                    {loadingFiles ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    Upload Files
                  </button>
                  <input
                    ref={infoFileRef}
                    type="file"
                    accept=".pdf,.txt,.csv,.json,.doc,.docx"
                    multiple
                    onChange={handleInfoFileUpload}
                    className="hidden"
                  />
                  <span className="text-[10px] text-bb-muted">PDF, TXT, CSV supported</span>
                </div>
                {infoFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {infoFiles.map((f) => (
                      <span
                        key={f.name}
                        onClick={() => setSelectedInfoFile(f.name)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] cursor-pointer border transition-colors ${
                          selectedInfoFile === f.name
                            ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                            : 'bg-bb-panel border-bb-border text-bb-text hover:border-purple-500/30'
                        }`}
                      >
                        <FileText size={10} />
                        {f.name}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeInfoFile(f.name); }}
                          className="hover:text-red-400 ml-0.5"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {selectedInfoFile && infoFiles.find((f) => f.name === selectedInfoFile) && (
                  <div className="bg-bb-dark border border-bb-border rounded p-2 max-h-24 overflow-y-auto">
                    <pre className="text-[10px] text-bb-muted whitespace-pre-wrap">
                      {infoFiles.find((f) => f.name === selectedInfoFile)!.content.slice(0, 500)}
                      {(infoFiles.find((f) => f.name === selectedInfoFile)!.content.length > 500) && '...'}
                    </pre>
                  </div>
                )}
              </div>

              {/* Additional context */}
              <div>
                <label className="text-[10px] text-bb-muted font-semibold block mb-1">
                  Additional Context <span className="font-normal">(optional — any extra info for filling this specific form)</span>
                </label>
                <textarea
                  value={additionalContext}
                  onChange={(e) => setAdditionalContext(e.target.value)}
                  placeholder="e.g. This is a permit application for project #12345 at 456 Oak Ave..."
                  rows={2}
                  className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-purple-500 resize-none"
                />
              </div>

              {/* Detecting status */}
              {detecting && (
                <div className="flex items-center gap-2 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded px-3 py-2">
                  <Loader2 size={13} className="animate-spin" />
                  Scanning PDF for form fields...
                </div>
              )}

              {/* No fields */}
              {!detecting && fields.length === 0 && (
                <div className="text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={13} />
                  No fillable form fields detected in this PDF. This feature works with interactive PDF forms (AcroForms).
                </div>
              )}

              {/* Detected fields summary */}
              {!detecting && fields.length > 0 && Object.keys(mapping).length === 0 && (
                <div className="bg-bb-dark rounded-lg border border-bb-border p-3">
                  <div className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider mb-2">
                    Detected Form Fields ({fields.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {fields.map((f) => (
                      <span
                        key={f.name}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-bb-panel border border-bb-border text-bb-text"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          f.type === 'text' ? 'bg-blue-400' :
                          f.type === 'checkbox' ? 'bg-green-400' :
                          f.type === 'dropdown' ? 'bg-orange-400' : 'bg-gray-400'
                        }`} />
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Fill results — editable mapping */}
              {Object.keys(mapping).length > 0 && (
                <div className="bg-bb-dark rounded-lg border border-bb-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider">
                      Fill Preview — {filledCount} of {fields.length} fields
                    </div>
                    <button
                      onClick={() => setEditingMapping(!editingMapping)}
                      className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1"
                    >
                      <Edit3 size={10} />
                      {editingMapping ? 'Done Editing' : 'Edit Values'}
                    </button>
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {fields.map((f) => {
                      const val = mapping[f.name] || '';
                      return (
                        <div key={f.name} className="flex items-center gap-2 text-xs">
                          <span className="text-bb-muted w-1/3 truncate shrink-0" title={f.name}>{f.name}</span>
                          {editingMapping ? (
                            <input
                              value={val}
                              onChange={(e) => updateMapping(f.name, e.target.value)}
                              className="flex-1 bg-bb-panel border border-bb-border rounded px-1.5 py-0.5 text-xs text-bb-text outline-none focus:border-purple-500"
                            />
                          ) : (
                            <span className={`flex-1 truncate ${val ? 'text-bb-text' : 'text-bb-muted italic'}`}>
                              {val || '(empty)'}
                            </span>
                          )}
                          {val && <Check size={11} className="text-green-400 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors">
            Close
          </button>
          <span className="flex-1" />

          {tab === 'fill' && Object.keys(mapping).length === 0 && (
            <button
              onClick={handleAiFill}
              disabled={filling || detecting || fields.length === 0}
              className="px-4 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {filling ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
              {filling ? 'AI Analyzing...' : 'AI Fill Form'}
            </button>
          )}

          {tab === 'fill' && Object.keys(mapping).length > 0 && (
            <>
              <button
                onClick={() => { setMapping({}); setApplied(false); }}
                className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleApply}
                disabled={applied || filledCount === 0}
                className="px-4 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {applied ? <Check size={12} /> : <FileInput size={12} />}
                {applied ? 'Applied!' : `Apply ${filledCount} Fields to PDF`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
