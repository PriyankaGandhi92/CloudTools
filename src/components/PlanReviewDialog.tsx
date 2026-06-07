import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { getPageCount } from '../utils/pdfRenderer';
import {
  runPlanReview,
  loadProjectMemory,
  reviewAnnotationsToAppAnnotations,
  SEVERITY_COLORS,
  type ReviewTier,
  type ReviewKeys,
  type ReviewAnnotation,
  type PlanReviewResult,
  type ReviewMode,
  type ReviewModeOptions,
  type Discipline,
} from '../utils/planReview';
import { getProject, addPdfVersion, saveReviewResults, updateAnnotationStatus, getProjects, type Project } from '../utils/projectManager';
import {
  Shield,
  Loader2,
  Key,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Stamp,
  FileDown,
  Upload,
  FileText,
  X,
  MessageSquareText,
  ShieldCheck,
  ClipboardList,
  Mic,
  MicOff,
} from 'lucide-react';

const TIER_INFO = {
  advanced: {
    label: 'Advanced',
    desc: 'GPT-4o + Claude Sonnet + Gemini 2.5 Pro + Kimi K2P6 (Fireworks) + Qwen Plus + DeepSeek R1 + Deterministic Rules',
    keys: ['openai', 'anthropic', 'gemini', 'kimi', 'qwen', 'deepseek'] as const,
  },
  budget: {
    label: 'Budget',
    desc: 'Gemini 2.5 Pro + Kimi K2P6 (Fireworks) + Qwen Plus + DeepSeek',
    keys: ['gemini', 'kimi', 'qwen', 'deepseek'] as const,
  },
};

const KEY_LABELS: Record<string, string> = {
  openai: 'OpenAI (GPT) API Key',
  anthropic: 'Anthropic (Claude) API Key',
  gemini: 'Google (Gemini) API Key',
  kimi: 'Fireworks AI (Kimi K2P6) API Key',
  qwen: 'Alibaba (Qwen Plus) API Key',
  deepseek: 'DeepSeek API Key',
};

const KEY_PLACEHOLDERS: Record<string, string> = {
  openai: 'sk-...',
  anthropic: 'sk-ant-...',
  gemini: 'AIza...',
  kimi: 'sk-...',
  qwen: 'sk-...',
  deepseek: 'sk-...',
};

async function loadKeys(): Promise<ReviewKeys> {
  try {
    const keys: ReviewKeys = {
      openai: '',
      anthropic: '',
      gemini: '',
      deepseek: '',
      kimi: '',
      qwen: '',
    };

    // Fetch keys from Firebase Functions
    const [openaiResult, anthropicResult, geminiResult, deepseekResult, kimiResult, qwenResult] = await Promise.allSettled([
      httpsCallable(functions, 'getOpenAiKey')(),
      httpsCallable(functions, 'getAnthropicKey')(),
      httpsCallable(functions, 'getApiKey')(),
      httpsCallable(functions, 'getDeepSeekKey')(),
      httpsCallable(functions, 'getKimiKey')(),
      httpsCallable(functions, 'getQwenKey')(),
    ]);

    const summarize = (
      label: string,
      r: PromiseSettledResult<{ data: unknown }>,
    ): string => {
      if (r.status === 'rejected') {
        const reason: any = r.reason;
        const msg = reason?.message || String(reason);
        const code = reason?.code ? ` (${reason.code})` : '';
        console.warn(`[loadKeys] ${label} failed${code}:`, msg, reason);
        return '';
      }
      const apiKey = (r.value.data as { apiKey?: string })?.apiKey || '';
      if (!apiKey) console.warn(`[loadKeys] ${label} returned an empty key. Check Firebase secret.`);
      return apiKey;
    };

    keys.openai = summarize('getOpenAiKey', openaiResult);
    keys.anthropic = summarize('getAnthropicKey', anthropicResult);
    keys.gemini = summarize('getApiKey (Gemini)', geminiResult);
    keys.deepseek = summarize('getDeepSeekKey', deepseekResult);
    keys.kimi = summarize('getKimiKey', kimiResult);
    keys.qwen = summarize('getQwenKey', qwenResult);

    return keys;
  } catch (err) {
    console.error('Failed to load API keys:', err);
    return {
      openai: '',
      anthropic: '',
      gemini: '',
      deepseek: '',
      kimi: '',
      qwen: '',
    };
  }
}

export default function PlanReviewDialog({ onClose }: { onClose: () => void }) {
  const { pageCount, setAnnotations, pushUndo, annotations } = useStore();

  const [tier, setTier] = useState<ReviewTier>('advanced');
  const [keys, setKeys] = useState<ReviewKeys>({ openai: '', anthropic: '', gemini: '', deepseek: '', kimi: '', qwen: '' });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [currentModel, setCurrentModel] = useState('');
  const [completedModels, setCompletedModels] = useState<string[]>([]);
  const [result, setResult] = useState<PlanReviewResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedAnns, setExpandedAnns] = useState<Set<string>>(new Set());
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [applied, setApplied] = useState(false);
  const [seniorEngineerMode, setSeniorEngineerMode] = useState(true);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [codeFiles, setCodeFiles] = useState<{ name: string; content: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<Project[]>([]);
  const [selectedAnnotationIds, setSelectedAnnotationIds] = useState<Set<string>>(new Set());
  const [useCadDirectives, setUseCadDirectives] = useState(false);
  const [userFeedback, setUserFeedback] = useState('');
  const [loadCurrentSession, setLoadCurrentSession] = useState(false);

  // Load projects on mount and load previous review results when project is selected
  useEffect(() => {
    loadKeys().then(setKeys).catch(console.error);
    getProjects().then(setAvailableProjects).catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedProject && selectedProject.currentPdfId) {
      // Load previous review results from the current PDF version
      const currentPdfVersion = selectedProject.pdfVersions.find(v => v.id === selectedProject.currentPdfId);
      if (currentPdfVersion?.reviewResults) {
        setResult({
          summary: currentPdfVersion.reviewResults.summary || '',
          scratchpad: currentPdfVersion.reviewResults.scratchpad || '',
          annotations: currentPdfVersion.reviewResults.annotations || [],
          modelResults: currentPdfVersion.reviewResults.modelResults || [],
        });
        setSelectedAnnotationIds(new Set());
        setUseCadDirectives(false);
        setApplied(false);
      }
      
      // Load all project annotations and display them
      if (selectedProject.annotations && selectedProject.annotations.length > 0) {
        // Convert project annotations to ReviewAnnotation format for display
        const projectAnnotationsAsReview: ReviewAnnotation[] = selectedProject.annotations
          .filter(a => a.status === 'open' || a.status === 'still_not_fixed')
          .map(pa => ({
            annotation_id: pa.annotation.annotation_id,
            page_number: pa.annotation.page_number || 1,
            sheet_number: pa.annotation.sheet_number || '',
            sheet_title: pa.annotation.sheet_title || '',
            location_description: pa.annotation.location_description || '',
            coordinates_normalized: pa.annotation.coordinates_normalized || { x1: null, y1: null, x2: null, y2: null },
            markup_type: pa.annotation.markup_type || 'pin_comment',
            severity: pa.annotation.severity || 'Moderate',
            category: pa.annotation.category || 'Drawing Completeness',
            comment_title: pa.annotation.comment_title || '',
            engineering_justification: pa.annotation.engineering_justification || '',
            cad_directive: pa.annotation.cad_directive || '',
            cross_references: pa.annotation.cross_references || [],
            confidence: pa.annotation.confidence || 'Medium',
            needs_human_engineer_review: pa.annotation.needs_human_engineer_review || false,
            source_model: pa.annotation.source_model || 'user',
          }));
        
        // If there are existing review results, merge them with project annotations
        // Otherwise, just show project annotations
        if (currentPdfVersion?.reviewResults) {
          setResult(prev => prev ? ({
            ...prev,
            annotations: [...prev.annotations, ...projectAnnotationsAsReview],
          }) : null);
        } else {
          setResult({
            summary: 'Existing project annotations',
            scratchpad: 'These are existing annotations from the project',
            annotations: projectAnnotationsAsReview,
            modelResults: [],
          });
        }
      }
    } else if (!selectedProject && loadCurrentSession) {
      // If no project selected but user wants to load current session comments,
      // load from localStorage
      const savedSession = localStorage.getItem('planReviewSession');
      if (savedSession) {
        try {
          const sessionData = JSON.parse(savedSession);
          if (sessionData.annotations && sessionData.annotations.length > 0) {
            setResult({
              summary: sessionData.summary || 'Current session comments',
              scratchpad: sessionData.scratchpad || 'Comments from current session',
              annotations: sessionData.annotations,
              modelResults: sessionData.modelResults || [],
            });
            setSelectedAnnotationIds(new Set());
            setUseCadDirectives(false);
            setApplied(false);
          }
        } catch (e) {
          console.warn('Failed to load session comments', e);
        }
      }
    }
  }, [selectedProject, loadCurrentSession]);

  // Discipline / jurisdiction context
  const [discipline, setDiscipline] = useState<Discipline>('building_engineer');
  const [projectState, setProjectState] = useState<string>('Florida');
  const [codeYear, setCodeYear] = useState<string>('2023');

  // Review mode state — default to general (AI handles code compliance internally)
  const [reviewMode, setReviewMode] = useState<ReviewMode>('general');
  const [complianceFiles, setComplianceFiles] = useState<{ name: string; content: string }[]>([]);
  const [loadingCompFiles, setLoadingCompFiles] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [askRefFiles, setAskRefFiles] = useState<{ name: string; content: string }[]>([]);
  const [loadingRefFiles, setLoadingRefFiles] = useState(false);
  const compFileRef = React.useRef<HTMLInputElement>(null);
  const refFileRef = React.useRef<HTMLInputElement>(null);

  // Voice input state for Ask Me
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = React.useRef<any>(null);

  const toggleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setAskQuestion((prev) => {
        const base = prev.replace(/\[listening\.\.\.\].*$/s, '').trimEnd();
        const spoken = (finalTranscript + interim).trim();
        return base ? base + ' ' + spoken : spoken;
      });
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const extractText = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf') {
      const pdfjsLib = await import('pdfjs-dist');
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(doc.numPages, 30); i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        pages.push(tc.items.map((it: any) => it.str).join(' '));
      }
      return pages.join('\n');
    }
    return file.text();
  };

  const handleCompFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setLoadingCompFiles(true);
    const newFiles: { name: string; content: string }[] = [];
    for (const f of Array.from(files)) {
      newFiles.push({ name: f.name, content: await extractText(f) });
    }
    setComplianceFiles((p) => [...p, ...newFiles]);
    setLoadingCompFiles(false);
    if (compFileRef.current) compFileRef.current.value = '';
  };

  const handleRefFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setLoadingRefFiles(true);
    const newFiles: { name: string; content: string }[] = [];
    for (const f of Array.from(files)) {
      newFiles.push({ name: f.name, content: await extractText(f) });
    }
    setAskRefFiles((p) => [...p, ...newFiles]);
    setLoadingRefFiles(false);
    if (refFileRef.current) refFileRef.current.value = '';
  };

  const tierInfo = TIER_INFO[tier];
  const requiredKeys = tierInfo.keys;

  const hasRequiredKeys = requiredKeys.every((k) => keys[k].trim().length > 0);

  const handleStart = async (withFeedback: boolean = false) => {
    setError('');
    setResult(null);
    setRunning(true);
    setApplied(false);
    setProgress('');
    setCurrentModel('');
    setCompletedModels([]);

    try {
      // Load project memory if a project is selected
      let projectMemory = null;
      if (selectedProject) {
        projectMemory = await loadProjectMemory(selectedProject.id);
      }

      const modeOpts: ReviewModeOptions = {
        mode: reviewMode,
        context: {
          discipline,
          projectState,
          codeYear,
          seniorEngineerMode,
          selectedCodes,
          codeFiles,
          projectMemory: projectMemory || undefined,
          projectId: selectedProject?.id,
        },
        userFeedback: withFeedback ? userFeedback : undefined,
      };
      if (reviewMode === 'compliance') {
        modeOpts.complianceDocs = complianceFiles.map((f) => `--- ${f.name} ---\n${f.content}`).join('\n\n');
      } else if (reviewMode === 'askme') {
        modeOpts.question = askQuestion;
        modeOpts.referenceText = askRefFiles.map((f) => `--- ${f.name} ---\n${f.content}`).join('\n\n');
      }

      const { pdfData } = useStore.getState();

      const reviewResult = await runPlanReview(
        tier,
        keys,
        pdfData ? await getPageCount() : 0,
        (msg, model) => {
          setProgress(msg);
          if (model) setCurrentModel(model);
        },
        undefined,
        modeOpts
      );

      setResult(reviewResult);

      // Save to localStorage for current session retrieval
      localStorage.setItem('planReviewSession', JSON.stringify({
        summary: reviewResult.summary,
        scratchpad: reviewResult.scratchpad,
        annotations: reviewResult.annotations,
        modelResults: reviewResult.modelResults,
        savedAt: Date.now(),
      }));

      // Save to project if one is selected
      if (selectedProject) {
        const pageCount = pdfData ? await getPageCount() : 0;
        
        // Add new PDF version to project
        const pdfVersion = await addPdfVersion(
          selectedProject.id,
          `plan-review-${Date.now()}.pdf`,
          pageCount,
          pdfData ? pdfData.byteLength : 0
        );

        // Save review results to the PDF version
        const reviewRun = {
          id: `review-${Date.now()}`,
          pdfVersionId: pdfVersion.id,
          runAt: Date.now(),
          summary: reviewResult.summary,
          scratchpad: reviewResult.scratchpad,
          annotations: reviewResult.annotations,
          modelResults: reviewResult.modelResults,
        };

        await saveReviewResults(selectedProject.id, pdfVersion.id, reviewRun);

        // Compare with previous annotations and update status
        const previousAnnotations = selectedProject.annotations
          .filter(a => a.status === 'open' || a.status === 'still_not_fixed')
          .map(a => a.annotation);
        
        if (previousAnnotations.length > 0) {
          await updateAnnotationStatus(selectedProject.id, reviewResult.annotations, previousAnnotations);
        }
      }
      setProgress('');
      setCurrentModel('');
    } catch (err: any) {
      setError(err.message || 'Review failed');
      setProgress('');
      setCurrentModel('');
    } finally {
      setRunning(false);
    }
  };

  const handleApplyAnnotations = async () => {
    if (!result || applied) return;
    
    // Get actual page dimensions from the PDF
    const { pdfData } = useStore.getState();
    let pageWidth = 612;
    let pageHeight = 792;
    
    // Try to get actual page dimensions from the PDF
    if (pdfData) {
      try {
        const { renderPage } = await import('../utils/pdfRenderer');
        const canvas = document.createElement('canvas');
        const dims = await renderPage(0, canvas, 1);
        pageWidth = dims.width;
        pageHeight = dims.height;
      } catch (e) {
        console.warn('Could not get page dimensions, using defaults', e);
      }
    }
    
    // Debug: log annotation page numbers and page dimensions
    console.log('Page dimensions:', { pageWidth, pageHeight });
    console.log('Applying annotations with page numbers:', result.annotations.map(a => ({ id: a.annotation_id, page: a.page_number, coords: a.coordinates_normalized })));
    
    // Filter to only selected annotations, or all if none selected
    const annotationsToApply = selectedAnnotationIds.size > 0 
      ? result.annotations.filter(a => selectedAnnotationIds.has(a.annotation_id))
      : result.annotations;
    
    // Modify annotations to use CAD directive if toggle is on
    const modifiedAnnotations = annotationsToApply.map(ann => ({
      ...ann,
      comment_title: useCadDirectives ? ann.cad_directive || ann.comment_title : ann.comment_title
    }));
    
    const appAnns = reviewAnnotationsToAppAnnotations(modifiedAnnotations, pageWidth, pageHeight);
    
    // Debug: log mapped annotations
    console.log('Mapped annotations:', appAnns.map(a => ({ id: a.id, pageIndex: a.pageIndex, points: a.points })));
    
    // Apply layerOrder sequentially after current top of stack so the AI
    // annotations sit on top of user-drawn ones in a stable order.
    const startLayer = annotations.length;
    const newAnnotations = appAnns.map((ann, i) => ({ ...ann, layerOrder: startLayer + i }));

    // Batch into a single setAnnotations call. Calling addAnnotation 40
    // times in a row causes 40 re-renders and visual "vibration" as the
    // canvas re-layers between each insert.
    setAnnotations([...annotations, ...newAnnotations]);

    // Push individual undo entries so the user can undo a single AI
    // annotation at a time if desired.
    for (const ann of newAnnotations) {
      pushUndo({ type: 'add', annotation: ann });
    }

    setApplied(true);
    // Auto-close after a short delay so the user can see the success state.
    setTimeout(() => onClose(), 1200);
  };

  const handleCopySummary = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportReport = () => {
    if (!result) return;
    const lines = [
      '# Structural Plan Review Report',
      `Date: ${new Date().toLocaleDateString()}`,
      `Tier: ${tierInfo.label}`,
      `Pages reviewed: ${Math.min(pageCount, 30)}`,
      '',
      '---',
      '',
      result.summary,
      '',
      '---',
      '',
      '# Annotations',
      '',
      ...result.annotations.map(
        (a) =>
          `## ${a.annotation_id} — ${a.comment_title} [${a.severity}]\n**Page:** ${a.page_number} | **Category:** ${a.category} | **Source:** ${a.source_model}\n${a.engineering_justification || a.comment_body}\n**CAD Directive:** ${a.cad_directive || a.recommended_action}\n`,
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plan-review-report.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleAnn = (id: string) =>
    setExpandedAnns((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAnnotationSelection = (id: string) =>
    setSelectedAnnotationIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (result) {
      if (selectedAnnotationIds.size === result.annotations.length) {
        setSelectedAnnotationIds(new Set());
      } else {
        setSelectedAnnotationIds(new Set(result.annotations.map(a => a.annotation_id)));
      }
    }
  };

  const filteredAnnotations = result
    ? filterSeverity === 'all'
      ? result.annotations
      : result.annotations.filter((a) => a.severity === filterSeverity)
    : [];

  const severityCounts = result
    ? {
        Critical: result.annotations.filter((a) => a.severity === 'Critical').length,
        Major: result.annotations.filter((a) => a.severity === 'Major').length,
        Moderate: result.annotations.filter((a) => a.severity === 'Moderate').length,
        Minor: result.annotations.filter((a) => a.severity === 'Minor').length,
      }
    : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl flex flex-col w-full max-w-5xl max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-bb-border flex items-center gap-3 shrink-0">
          <Shield size={20} className="text-orange-400" />
          <div>
            <h2 className="text-sm font-bold">AI Structural Plan Review</h2>
            <p className="text-[10px] text-bb-muted">Senior-level QA/QC powered by multiple AI models</p>
          </div>
          <span className="ml-auto text-[10px] text-bb-muted">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 min-h-0">
          {/* Mode + Tier selection */}
          {!result && (
            <>
              {/* Tier Selection */}
              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Review Tier</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTier('advanced')}
                    className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                      tier === 'advanced' ? 'bg-orange-500 text-white' : 'bg-bb-panel text-bb-text hover:bg-bb-hover'
                    }`}
                  >
                    Advanced (Multi-Model)
                  </button>
                  <button
                    onClick={() => setTier('budget')}
                    className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                      tier === 'budget' ? 'bg-orange-500 text-white' : 'bg-bb-panel text-bb-text hover:bg-bb-hover'
                    }`}
                  >
                    Budget (Single Model)
                  </button>
                </div>
              </div>

              {/* Project Selection */}
              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Project (Optional)</label>
                <select
                  value={selectedProject?.id || ''}
                  onChange={(e) => {
                    const project = availableProjects.find(p => p.id === e.target.value);
                    setSelectedProject(project || null);
                  }}
                  className="w-full bg-bb-panel border border-bb-border focus:border-orange-500 rounded px-3 py-2 text-xs text-bb-text outline-none"
                >
                  <option value="">No project (one-time review)</option>
                  {availableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {selectedProject && (
                  <p className="text-[9px] text-green-400 mt-1">
                    Review results will be saved to project for continuous tracking
                  </p>
                )}
              </div>

              {/* Review Mode */}
              <div>
                <label className="text-xs text-bb-muted block mb-2 font-semibold uppercase tracking-wider">Review Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setReviewMode('general')}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      reviewMode === 'general' ? 'border-orange-500 bg-orange-500/10' : 'border-bb-border hover:border-bb-hover bg-bb-dark'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold"><ClipboardList size={13} /> Full Plan Review</div>
                    <div className="text-[10px] text-bb-muted mt-1">Complete QA/QC with cross-sheet coordination, code compliance, constructability, and engineering review</div>
                  </button>
                  <button
                    onClick={() => setReviewMode('askme')}
                    className={`text-left p-3 rounded-lg border-2 transition-all ${
                      reviewMode === 'askme' ? 'border-orange-500 bg-orange-500/10' : 'border-bb-border hover:border-bb-hover bg-bb-dark'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold"><MessageSquareText size={13} /> Ask Me</div>
                    <div className="text-[10px] text-bb-muted mt-1">Ask a custom question about the plans</div>
                  </button>
                </div>
              </div>

              {/* Discipline + Jurisdiction Context */}
              <div>
                <label className="text-xs text-bb-muted block mb-2 font-semibold uppercase tracking-wider">Reviewer Discipline</label>
                <div className="grid grid-cols-5 gap-2">
                  {([
                    { key: 'architect', label: 'Architect', desc: 'Egress, fire, ADA, envelope' },
                    { key: 'building_engineer', label: 'Building SE', desc: 'Load path, lateral, connections' },
                    { key: 'bridge_engineer', label: 'Bridge SE', desc: 'AASHTO, MOT, bearings, scour' },
                    { key: 'contractor', label: 'Contractor', desc: 'Constructability, trade clashes, sequencing' },
                    { key: 'general_structural', label: 'General Structural', desc: 'Mixed / unknown project' },
                  ] as { key: Discipline; label: string; desc: string }[]).map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setDiscipline(d.key)}
                      className={`text-left p-2 rounded-lg border-2 transition-all ${
                        discipline === d.key ? 'border-orange-500 bg-orange-500/10' : 'border-bb-border hover:border-bb-hover bg-bb-dark'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{d.label}</div>
                      <div className="text-[9px] text-bb-muted mt-0.5 leading-tight">{d.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[10px] text-bb-muted block mb-1">Project State / Jurisdiction</label>
                    <input
                      type="text"
                      value={projectState}
                      onChange={(e) => setProjectState(e.target.value)}
                      placeholder="e.g. Florida, California, Texas"
                      className="w-full bg-bb-panel border border-bb-border focus:border-orange-500 rounded px-2 py-1.5 text-xs text-bb-text outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-bb-muted block mb-1">Code Edition / Year</label>
                    <input
                      type="text"
                      value={codeYear}
                      onChange={(e) => setCodeYear(e.target.value)}
                      placeholder={discipline === 'bridge_engineer' ? 'e.g. 9th (2020)' : 'e.g. 2023, 2021, 2018'}
                      className="w-full bg-bb-panel border border-bb-border focus:border-orange-500 rounded px-2 py-1.5 text-xs text-bb-text outline-none"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-bb-muted mt-1.5">
                  The AI will adopt this discipline's analytical lens and audit against the corresponding governing codes
                  (IBC, ASCE 7, ACI 318, AISC 360, AASHTO LRFD, state DOT standards, NFPA, ADA, etc.).
                </p>
              </div>

              {/* Ask Me mode: question + reference files */}
              {reviewMode === 'askme' && (
                <div className="bg-bb-dark border border-bb-border rounded-lg p-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider">Your Question</label>
                      <button
                        onClick={toggleVoiceInput}
                        className={`p-1 rounded transition-colors ${
                          isListening
                            ? 'bg-red-500/20 text-red-400 animate-pulse'
                            : 'bg-bb-panel text-bb-muted hover:text-orange-400 hover:bg-bb-hover'
                        }`}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                      >
                        {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                      </button>
                    </div>
                    <textarea
                      value={askQuestion}
                      onChange={(e) => setAskQuestion(e.target.value)}
                      placeholder="e.g. If the geotech report is not available, where should we go to get one based on the project location?"
                      rows={3}
                      className={`w-full bg-bb-panel border rounded px-2 py-1.5 text-xs text-bb-text outline-none resize-none ${
                        isListening ? 'border-red-500/50' : 'border-bb-border focus:border-orange-500'
                      }`}
                    />
                    {isListening && (
                      <p className="text-[9px] text-red-400 mt-1 animate-pulse">Listening... speak your question</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider block mb-1">Reference Documents (optional)</label>
                    <p className="text-[10px] text-bb-muted mb-2">Upload text files the AI can reference when answering your question.</p>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => refFileRef.current?.click()}
                        disabled={loadingRefFiles}
                        className="px-2.5 py-1.5 text-xs bg-bb-panel border border-bb-border hover:border-orange-500 rounded flex items-center gap-1.5 transition-colors"
                      >
                        {loadingRefFiles ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                        Upload Files
                      </button>
                      <input ref={refFileRef} type="file" accept=".pdf,.txt,.csv,.doc,.docx" multiple onChange={handleRefFileUpload} className="hidden" />
                    </div>
                    {askRefFiles.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {askRefFiles.map((f, i) => (
                          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-bb-panel border border-bb-border text-bb-text">
                            <FileText size={10} /> {f.name}
                            <button onClick={() => setAskRefFiles((p) => p.filter((_, j) => j !== i))} className="hover:text-red-400 ml-0.5"><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tier selection */}
              <div>
                <label className="text-xs text-bb-muted block mb-2 font-semibold uppercase tracking-wider">Review Tier</label>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(TIER_INFO) as ReviewTier[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTier(t)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        tier === t
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-bb-border hover:border-bb-hover bg-bb-dark'
                      }`}
                    >
                      <div className="text-xs font-bold">{TIER_INFO[t].label}</div>
                      <div className="text-[10px] text-bb-muted mt-1">{TIER_INFO[t].desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Senior Engineer Mode */}
              <div className="bg-bb-dark border border-bb-border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-400"></div>
                  <div className="text-xs font-bold text-green-400">SENIOR ENGINEER MODE — ACTIVE</div>
                </div>
                <div className="text-[10px] text-bb-muted mb-2">
                  AI performs mandatory math verification, cross-sheet coordination traces, prescriptive CAD directives, and full code compliance checks automatically.
                </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] text-bb-muted block mb-1">Project Jurisdiction</label>
                      <select
                        value={projectState}
                        onChange={(e) => setProjectState(e.target.value)}
                        className="w-full bg-bb-panel border border-bb-border focus:border-orange-500 rounded px-3 py-2 text-xs text-bb-text outline-none"
                      >
                        <option value="Florida">Florida</option>
                        <option value="California">California</option>
                        <option value="Texas">Texas</option>
                        <option value="New York">New York</option>
                        <option value="National">National / Federal</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-bb-muted block mb-1">Applicable Codes (Multi-select)</label>
                      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                        {[
                          'Florida Building Code (FBC)',
                          'Florida Building Code - Accessibility',
                          'Florida Building Code - Existing Building',
                          'Florida Building Code - Fuel Gas',
                          'Florida Building Code - Mechanical',
                          'Florida Building Code - Plumbing',
                          'Florida Building Code - Residential',
                          'Florida Building Code - Energy Conservation',
                          'FDOT Structures Design Guidelines',
                          'FDOT Roadway Design Manual',
                          'FDOT Drainage Manual',
                          'FDOT Maintenance of Traffic (MOT)',
                          'ACI 318 (Building Code Requirements for Structural Concrete)',
                          'ACI 530 (Building Code Requirements for Masonry)',
                          'AISC 360 (Specification for Structural Steel Buildings)',
                          'AISC 341 (Seismic Provisions for Structural Steel Buildings)',
                          'AASHTO LRFD Bridge Design Specifications',
                          'ASCE 7 (Minimum Design Loads and Associated Criteria)',
                          'NDS (National Design Specification for Wood Construction)',
                          'IBC (International Building Code)',
                          'IEBC (International Existing Building Code)',
                          'IMC (International Mechanical Code)',
                          'IPC (International Plumbing Code)',
                          'IFC (International Fire Code)',
                          'NFPA 101 (Life Safety Code)',
                        ].map((code) => (
                          <label key={code} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedCodes.includes(code)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCodes([...selectedCodes, code]);
                                } else {
                                  setSelectedCodes(selectedCodes.filter((c) => c !== code));
                                }
                              }}
                              className="w-3 h-3 rounded border-bb-border bg-bb-panel text-orange-500 focus:ring-orange-500"
                            />
                            <span className="text-[10px] text-bb-text">{code}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-[9px] text-bb-muted mt-1">
                        Select all applicable codes. If a code is not available online, upload the code document below.
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] text-bb-muted block mb-1">Upload Code Documents (Optional)</label>
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.txt,.doc,.docx"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          const processedFiles: { name: string; content: string }[] = [];
                          for (const file of files) {
                            const text = await file.text();
                            processedFiles.push({ name: file.name, content: text });
                          }
                          setCodeFiles(processedFiles);
                        }}
                        className="w-full bg-bb-panel border border-bb-border focus:border-orange-500 rounded px-3 py-2 text-xs text-bb-text outline-none"
                      />
                      {codeFiles.length > 0 && (
                        <div className="mt-2 text-[10px] text-green-400">
                          {codeFiles.length} code document(s) loaded
                        </div>
                      )}
                      <p className="text-[9px] text-bb-muted mt-1">
                        Upload code documents that are not available online or to override default code references.
                      </p>
                    </div>
                  </div>
              </div>

              {/* API Keys Status */}
              <div>
                <label className="text-xs text-bb-muted block mb-2 font-semibold uppercase tracking-wider">
                  <Key size={11} className="inline mr-1" />
                  API Keys
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {requiredKeys.map((k) => (
                    <div key={k}>
                      <label className="text-[10px] text-bb-muted block mb-1">{KEY_LABELS[k]}</label>
                      <div className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-muted font-mono">
                        {keys[k] ? '••••••••••••' : 'Not configured'}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-bb-muted mt-2">
                  API keys are securely stored in Firebase Secrets. Contact admin to configure missing keys.
                </p>
              </div>

              {pageCount > 30 && (
                <div className="text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-3 py-2 flex items-center gap-2">
                  <AlertTriangle size={13} />
                  This PDF has {pageCount} pages. Only the first 30 will be reviewed per model call.
                </div>
              )}
            </>
          )}

          {/* Progress */}
          {running && (
            <div className="flex flex-col gap-2 text-xs text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <Loader2 size={16} className="animate-spin shrink-0" />
                <span>{progress || 'Starting review...'}</span>
              </div>
              {currentModel && (
                <div className="flex items-center gap-2 ml-7">
                  <div className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-orange-400">Running: {currentModel}</span>
                </div>
              )}
              {completedModels.length > 0 && (
                <div className="flex flex-wrap gap-2 ml-7">
                  {completedModels.map((model) => (
                    <span key={model} className="flex items-center gap-1 text-green-400">
                      <CheckCircle2 size={10} />
                      {model}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Model status badges */}
              <div className="flex flex-wrap gap-2">
                {result.modelResults.map((m) => (
                  <span
                    key={m.model}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium ${
                      m.status === 'success'
                        ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                        : 'bg-red-500/15 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {m.status === 'success' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                    {m.model}: {m.status === 'success' ? `${m.count} findings` : 'failed'}
                  </span>
                ))}
              </div>

              {/* Severity summary bar */}
              {severityCounts && (
                <div className="flex gap-2">
                  {(['Critical', 'Major', 'Moderate', 'Minor'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterSeverity(filterSeverity === s ? 'all' : s)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-all border ${
                        filterSeverity === s ? 'ring-1 ring-white/30' : ''
                      }`}
                      style={{
                        backgroundColor: `${SEVERITY_COLORS[s]}20`,
                        borderColor: `${SEVERITY_COLORS[s]}40`,
                        color: SEVERITY_COLORS[s],
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: SEVERITY_COLORS[s] }}
                      />
                      {s}: {severityCounts[s]}
                    </button>
                  ))}
                </div>
              )}

              {/* Selection controls */}
              <div className="flex items-center gap-4 text-[10px]">
                <label className="flex items-center gap-2 text-bb-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedAnnotationIds.size === result.annotations.length && result.annotations.length > 0}
                    onChange={toggleSelectAll}
                    className="shrink-0"
                  />
                  Select All
                </label>
                <label className="flex items-center gap-2 text-bb-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCadDirectives}
                    onChange={(e) => setUseCadDirectives(e.target.checked)}
                    className="shrink-0"
                  />
                  Apply CAD Directives as comments
                </label>
                {!selectedProject && (
                  <label className="flex items-center gap-2 text-bb-muted cursor-pointer">
                    <input
                      type="checkbox"
                      checked={loadCurrentSession}
                      onChange={(e) => setLoadCurrentSession(e.target.checked)}
                      className="shrink-0"
                    />
                    Load Current Session Comments
                  </label>
                )}
              </div>

              {/* Summary */}
              <div className="bg-bb-dark border border-bb-border rounded-lg p-4 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider">Review Summary</span>
                  <button onClick={handleCopySummary} className="text-[10px] text-bb-muted hover:text-bb-text flex items-center gap-1">
                    {copied ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <SummaryRenderer text={result.summary} />
                
                {/* User Feedback Input */}
                <div className="mt-4 pt-4 border-t border-bb-border">
                  <label className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider mb-2 block">
                    Provide Feedback or Corrections
                  </label>
                  <textarea
                    value={userFeedback}
                    onChange={(e) => setUserFeedback(e.target.value)}
                    placeholder="If the AI made incorrect assumptions or missed something, provide corrections or additional context here..."
                    className="w-full bg-bb-panel border border-bb-border rounded px-3 py-2 text-xs text-bb-text resize-y min-h-[60px] focus:outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={() => handleStart(true)}
                    disabled={running || !userFeedback.trim() || !hasRequiredKeys}
                    className="mt-2 px-3 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {running ? <Loader2 size={10} className="animate-spin" /> : <MessageSquareText size={10} />}
                    {running ? 'Updating...' : 'Update with Feedback'}
                  </button>
                </div>
              </div>

              {/* AI Thought Process (Scratchpad) */}
              <div className="mt-4">
                <button
                  onClick={() => setShowScratchpad(!showScratchpad)}
                  className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider mb-2 flex items-center gap-1 hover:text-bb-text transition-colors"
                >
                  {showScratchpad ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  AI Thought Process
                </button>
                {showScratchpad && (
                  <div className="bg-bb-panel border border-bb-border rounded-lg p-3 max-h-60 overflow-y-auto">
                    {result.scratchpad ? (
                      <SummaryRenderer text={result.scratchpad} />
                    ) : (
                      <div className="text-xs text-bb-muted">No thought process data available from AI models.</div>
                    )}
                  </div>
                )}
              </div>

              {/* Annotations list — grouped by page */}
              <div>
                <div className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider mb-2">
                  Findings ({filteredAnnotations.length}) — Grouped by Page
                </div>
                <div className="space-y-3 max-h-[420px] overflow-y-auto">
                  {filteredAnnotations.length === 0 && (
                    <div className="text-xs text-bb-muted text-center py-4">No findings for this filter.</div>
                  )}
                  {(() => {
                    // Group by page number
                    const byPage = new Map<number, typeof filteredAnnotations>();
                    for (const a of filteredAnnotations) {
                      const pg = a.page_number || 1;
                      if (!byPage.has(pg)) byPage.set(pg, []);
                      byPage.get(pg)!.push(a);
                    }
                    const sortedPages = [...byPage.keys()].sort((a, b) => a - b);
                    return sortedPages.map((pg) => {
                      const pageAnns = byPage.get(pg)!;
                      const crits = pageAnns.filter(a => a.severity === 'Critical').length;
                      const majors = pageAnns.filter(a => a.severity === 'Major').length;
                      return (
                        <div key={pg}>
                          <div className="sticky top-0 z-10 bg-bb-sidebar flex items-center gap-2 py-1.5 px-2 rounded border border-bb-border/50 mb-1.5">
                            <span className="text-xs font-bold text-orange-300">Page {pg}</span>
                            <span className="text-[10px] text-bb-muted">— {pageAnns.length} finding{pageAnns.length !== 1 ? 's' : ''}</span>
                            {crits > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#ef444425', color: '#ef4444' }}>{crits} Critical</span>}
                            {majors > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f9731625', color: '#f97316' }}>{majors} Major</span>}
                          </div>
                          <div className="space-y-1.5 ml-2">
                            {pageAnns.map((a) => (
                              <AnnotationCard
                                key={a.annotation_id + (a.source_model || '')}
                                ann={a}
                                expanded={expandedAnns.has(a.annotation_id)}
                                onToggle={() => toggleAnn(a.annotation_id)}
                                selected={selectedAnnotationIds.has(a.annotation_id)}
                                onSelect={() => toggleAnnotationSelection(a.annotation_id)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-bb-border flex items-center gap-2 shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors">
            Close
          </button>
          <span className="flex-1" />
          {result && (
            <>
              <button
                onClick={handleExportReport}
                className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors flex items-center gap-1.5"
              >
                <FileDown size={12} />
                Export Report
              </button>
              <button
                onClick={handleApplyAnnotations}
                disabled={applied || result.annotations.length === 0}
                className="px-4 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Stamp size={12} />
                {applied ? `Applied ${result.annotations.length} markups` : `Apply ${result.annotations.length} markups to PDF`}
              </button>
            </>
          )}
          {!result && (
            <button
              onClick={() => handleStart(false)}
              disabled={running || !hasRequiredKeys}
              className="px-4 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {running ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
              {running ? 'Reviewing...' : 'Start Plan Review'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function AnnotationCard({
  ann,
  expanded,
  onToggle,
  selected,
  onSelect,
}: {
  ann: ReviewAnnotation;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const color = SEVERITY_COLORS[ann.severity] || '#3b82f6';
  return (
    <div
      className="bg-bb-dark border rounded-lg overflow-hidden transition-all"
      style={{ borderColor: `${color}30` }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-bb-hover/50 transition-colors"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="shrink-0"
        />
        {expanded ? <ChevronDown size={11} className="text-bb-muted shrink-0" /> : <ChevronRight size={11} className="text-bb-muted shrink-0" />}
        <span
          className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
          style={{ backgroundColor: `${color}25`, color }}
        >
          {ann.severity}
        </span>
        <span className="text-[10px] text-bb-muted shrink-0">p.{ann.page_number}</span>
        <span className="text-xs text-bb-text truncate flex-1">{ann.comment_title}</span>
        <span className="text-[9px] text-bb-muted shrink-0 bg-bb-panel px-1.5 py-0.5 rounded">{ann.source_model}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-bb-border/50 space-y-1.5">
          <div className="text-[10px] text-bb-muted">
            <strong>Category:</strong> {ann.category} &nbsp;|&nbsp; <strong>Location:</strong> {ann.location_description}
            {ann.sheet_number && <> &nbsp;|&nbsp; <strong>Sheet:</strong> {ann.sheet_number}</>}
          </div>
          {ann.engineering_justification ? (
            <div className="text-xs text-bb-text leading-relaxed">
              <strong className="text-orange-300">Engineering Justification:</strong> {ann.engineering_justification}
            </div>
          ) : (
            <div className="text-xs text-bb-text leading-relaxed">{ann.comment_body}</div>
          )}
          {ann.cad_directive ? (
            <div className="text-[11px] text-orange-300 bg-orange-500/10 rounded px-2 py-1">
              <strong>CAD Directive:</strong> {ann.cad_directive}
            </div>
          ) : (
            <div className="text-[11px] text-orange-300 bg-orange-500/10 rounded px-2 py-1">
              <strong>Action:</strong> {ann.recommended_action}
            </div>
          )}
          {ann.cross_references && ann.cross_references.length > 0 && (
            <div className="text-[10px] text-bb-muted">
              <strong>Cross-ref:</strong> {ann.cross_references.join(', ')}
            </div>
          )}
          <div className="flex items-center gap-3 text-[10px] text-bb-muted">
            <span>Confidence: {ann.confidence}</span>
            {ann.needs_human_engineer_review && (
              <span className="text-yellow-400 flex items-center gap-1">
                <AlertTriangle size={9} />
                Needs human engineer review
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryRenderer({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="text-xs text-bb-text leading-relaxed space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-xs text-orange-300 mt-2 mb-0.5">{boldify(line.slice(4))}</h4>;
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-sm text-orange-300 mt-3 mb-1">{boldify(line.slice(3))}</h3>;
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-sm text-orange-200 mt-2 mb-1">{boldify(line.slice(2))}</h2>;
        if (line.startsWith('---')) return <hr key={i} className="border-bb-border my-2" />;
        if (line.match(/^\s*[-*]\s/)) {
          const content = line.replace(/^\s*[-*]\s/, '');
          return <div key={i} className="flex gap-1.5 ml-2 my-0.5"><span className="text-orange-400 shrink-0">•</span><span>{boldify(content)}</span></div>;
        }
        if (line.match(/^\s*\d+\.\s/)) {
          return <div key={i} className="ml-2 my-0.5">{boldify(line)}</div>;
        }
        if (line.trim() === '') return <div key={i} className="h-1.5" />;
        return <p key={i} className="my-0.5">{boldify(line)}</p>;
      })}
    </div>
  );
}

function boldify(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-bb-text font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
