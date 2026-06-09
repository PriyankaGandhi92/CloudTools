import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Terminal, ChevronUp, ChevronDown, Command as CommandIcon } from 'lucide-react';
import { useCADCommands } from '../hooks/useCADCommands';
import { useCloudCommands } from '../hooks/useCloudCommands';
import { useStore } from '../store/useStore';
import type { PendingCADCommand, CommandSuggestion } from '../types/cadCommands';

interface CADCommandLineProps {
  isOpen: boolean;
  onToggle: () => void;
}

const categoryColors: Record<string, string> = {
  draw: 'text-green-400',
  modify: 'text-yellow-400',
  annotate: 'text-blue-400',
  navigate: 'text-purple-400',
  cleanup: 'text-red-400',
  property: 'text-cyan-400',
  utility: 'text-gray-300',
  cloud: 'text-sky-400',
};

// Stirling PDF cloud commands surfaced as autocomplete suggestions.
// These are routed to useCloudCommands (not the CAD engine) on execute.
const CLOUD_SUGGESTIONS: CommandSuggestion[] = [
  { alias: 'CLOUD:COMPRESS', name: 'Compress PDF', description: 'Reduce file size (optimize=1-9)', category: 'cloud' },
  { alias: 'CLOUD:OCR', name: 'OCR PDF', description: 'Make scanned text searchable (lang=eng)', category: 'cloud' },
  { alias: 'CLOUD:REDACT', name: 'Auto Redact', description: 'Automatically redact sensitive text', category: 'cloud' },
  { alias: 'CLOUD:REPAIR', name: 'Repair PDF', description: 'Fix a corrupted or broken PDF', category: 'cloud' },
  { alias: 'CLOUD:ENCRYPT', name: 'Encrypt PDF', description: 'Password-protect the document', category: 'cloud' },
  { alias: 'CLOUD:PDF-A', name: 'Convert to PDF/A', description: 'Archive-grade PDF/A format', category: 'cloud' },
  { alias: 'CLOUD:TO-WORD', name: 'Convert to Word', description: 'Download as .docx (pages=1-10 for a subset)', category: 'cloud' },
  { alias: 'CLOUD:TO-PPT', name: 'Convert to PowerPoint', description: 'Download as .pptx (pages=1-10 for a subset)', category: 'cloud' },
  { alias: 'CLOUD:TO-HTML', name: 'Convert to HTML', description: 'Download as .zip (pages=1-10 for a subset)', category: 'cloud' },
  { alias: 'CLOUD:FIND-REPLACE', name: 'Find & Replace', description: 'Replace text in PDF (findText=..., replaceText=...)', category: 'cloud' },
  { alias: 'CLOUD:FIND', name: 'Find & Replace', description: 'Replace text in PDF (prompts for find/replace)', category: 'cloud' },
];

// Cloud operations that benefit from a page-range prompt (large/slow conversions).
const CLOUD_PAGE_PROMPT_OPS = new Set(['TO-HTML', 'TO-WORD', 'TO-PPT']);

// Cloud operations that require a text parameter (e.g., what text to redact).
const CLOUD_TEXT_PROMPT_OPS = new Set(['REDACT']);

// Cloud operations that require dual text parameters (find and replace).
const CLOUD_DUAL_TEXT_PROMPT_OPS = new Set(['FIND-REPLACE', 'FIND']);

// Extract the operation name from a CLOUD command string (handles both
// "CLOUD:OP" and "CLOUD OP" forms). Returns uppercase op or ''.
function parseCloudOperation(upperInput: string): string {
  const tokens = upperInput.trim().split(/\s+/);
  let op = '';
  if (tokens[0].startsWith('CLOUD:')) op = tokens[0].split(':')[1] || '';
  else if (tokens[0] === 'CLOUD') op = (tokens[1] || '').replace(/^:/, '');
  
  // Normalize operation names (e.g., FIND -> FIND-REPLACE)
  if (op === 'FIND') op = 'FIND-REPLACE';
  
  return op;
}

const categoryBgColors: Record<string, string> = {
  draw: 'bg-green-500/10',
  modify: 'bg-yellow-500/10',
  annotate: 'bg-blue-500/10',
  navigate: 'bg-purple-500/10',
  cleanup: 'bg-red-500/10',
  property: 'bg-cyan-500/10',
};

function getPlaceholder(cmd: string, pointCount: number, currentStep: number = 0, selectedCount: number = 0): string {
  const c = cmd.toUpperCase();
  switch (c) {
    case 'LINE': case 'L':
      return pointCount === 0 ? 'Click first point on canvas...' : 'Click second point (Shift=ortho)...';
    case 'ARC': case 'A':
      return pointCount === 0 ? 'Click start point...' : pointCount === 1 ? 'Click mid point...' : 'Click end point...';
    case 'PLINE': case 'PL':
      return pointCount === 0 ? 'Click start point...' : 'Click next point (Enter to finish)...';
    case 'RECTANG': case 'REC':
      return pointCount === 0 ? 'Click first corner...' : 'Click opposite corner...';
    case 'CIRCLE': case 'C':
      return pointCount === 0 ? 'Click center point...' : 'Click radius point...';
    case 'ARROW': case 'AR':
      return pointCount === 0 ? 'Click start point...' : 'Click end point (Shift=ortho)...';
    // --- COMBINED INTERACTIVE MODIFIERS ---
    case 'ROTATE': case 'RO':
    case 'MOVE': case 'M':
    case 'COPY': case 'CO': case 'CP':
      const cmdName = c === 'RO' ? 'ROTATE' : c === 'M' ? 'MOVE' : c === 'CO' || c === 'CP' ? 'COPY' : c;
      
      if (currentStep === 0) {
        return selectedCount > 0
          ? `🎯 ${cmdName}: ${selectedCount} item(s) selected. Press ENTER to confirm.` 
          : `🎯 ${cmdName}: Select objects, then press ENTER...`;
      }
      if (currentStep === 1) {
        return `🎯 ${cmdName}: CLICK on canvas to set the Base Point...`;
      }
      if (currentStep === 2) {
        if (c === 'RO' || c === 'ROTATE') {
          return `⌨️ ROTATE: Type angle (e.g. 45) + ENTER, or CLICK to finish...`;
        }
        return `⌨️ ${cmdName}: CLICK destination point, or type distance + ENTER...`;
      }
      return `${cmdName}: Processing...`;
    case 'OFFSET': case 'O':
      if (currentStep === 0) {
        return selectedCount > 0
          ? `🎯 OFFSET: ${selectedCount} item(s) selected. Press ENTER to confirm.` 
          : `🎯 OFFSET: Select objects, then press ENTER...`;
      }
      if (currentStep === 1) {
        return `⌨️ OFFSET: Type offset distance (e.g. 10) and press ENTER...`;
      }
      return `OFFSET: Processing...`;
    case 'DIST': case 'DI': case 'DIMLINEAR': case 'DLI': case 'DIMALIGNED': case 'DAL':
      return pointCount === 0 ? 'Click first measurement point...' : 'Click second measurement point...';
    case 'MTEXT': case 'T': case 'MT':
      return 'Click to place text...';
    default:
      return 'Click on canvas to specify point...';
  }
}

export default function CADCommandLine({ isOpen, onToggle }: CADCommandLineProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [localPendingCommand, setLocalPendingCommand] = useState<PendingCADCommand | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<string>('');

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  // When set, the command line is waiting for the user to type a page range
  // for this cloud conversion operation (e.g. 'TO-HTML').
  const [cloudPagePrompt, setCloudPagePrompt] = useState<string | null>(null);
  // When set, the command line is waiting for the user to type text
  // for this cloud operation (e.g., what text to redact).
  const [cloudTextPrompt, setCloudTextPrompt] = useState<string | null>(null);
  // When set, the command line is waiting for dual text input (find and replace).
  // Stores the operation name and the first text (find text).
  const [cloudDualTextPrompt, setCloudDualTextPrompt] = useState<{ op: string; findText: string } | null>(null);
  const { getSuggestions, executeCommand, getAllCommands } = useCADCommands();
  const { cloudStatus } = useStore();
  const { processCommand: processCloudCommand } = useCloudCommands();

  // Get CAD state from store
  const {
    cadPendingCommand,
    cadPendingPoints,
    cadCommandStep,
    cadSelectionMode,
    cadSelectedIds,
    cadFeedback,
    setCADPendingCommand,
    setCADPendingPoints,
    clearCADPendingPoints,
    setCADCommandStep,
    setCADFeedback,
  } = useStore();

  // Track isOpen changes
  useEffect(() => {
    console.log('isOpen changed to:', isOpen, 'cadPendingCommand:', cadPendingCommand, 'cadCommandStep:', cadCommandStep);
  }, [isOpen, cadPendingCommand, cadCommandStep]);

  // 1. Auto-focus input when the command line is opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Auto-focus & clear input when entering step 2 of interactive commands
  // (so user can immediately type the angle/distance)
  useEffect(() => {
    const cmd = cadPendingCommand?.toUpperCase();
    if (cadCommandStep === 2 && cmd && ['ROTATE', 'MOVE', 'COPY'].includes(cmd) && inputRef.current) {
      setInput('');
      // Use a short delay so the focus survives the canvas click that triggered step 2
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    // For OFFSET, focus when entering step 1 (where distance is typed)
    if (cadCommandStep === 1 && cmd === 'OFFSET' && inputRef.current) {
      setInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [cadCommandStep, cadPendingCommand]);

  // Update feedback message based on CAD command state and point progress
  useEffect(() => {
    console.log('Feedback useEffect triggered - cadPendingCommand:', cadPendingCommand, 'cadCommandStep:', cadCommandStep, 'cadPendingPoints.length:', cadPendingPoints.length, 'cadSelectionMode:', cadSelectionMode, 'localPendingCommand:', localPendingCommand?.command);
    // Detect interactive commands
    const activeCmd = cadPendingCommand?.toUpperCase() || localPendingCommand?.command?.toUpperCase() || '';
    const isInteractive = ['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(activeCmd);

    // If an interactive command is active, use dynamic feedback
    if (isInteractive) {
      if (cadCommandStep === 0) {
        const selectedCount = useStore.getState().cadSelectedIds.length;
        if (selectedCount === 0) {
          setLocalFeedback(`${activeCmd}: Click objects on the canvas to select, then press ENTER.`);
        } else {
          setLocalFeedback(`${activeCmd}: ${selectedCount} object(s) selected. Press ENTER to confirm.`);
        }
      } else if (cadCommandStep === 1) {
        if (activeCmd === 'OFFSET') setLocalFeedback(`${activeCmd}: Type offset distance (e.g. 25) and press ENTER`);
        else setLocalFeedback(`${activeCmd}: CLICK on canvas to set BASE POINT`);
      } else if (cadCommandStep === 2) {
        if (activeCmd === 'ROTATE') setLocalFeedback(`${activeCmd}: Type angle (e.g. 45) + ENTER, or CLICK canvas to set angle visually`);
        else setLocalFeedback(`${activeCmd}: Type distance (e.g. 100) + ENTER, or CLICK canvas for destination`);
      }
      return;
    }

    if (!cadPendingCommand) return;
    const cmd = cadPendingCommand.toUpperCase();

    // Dynamic prompts for point-based commands
    const pointCount = cadPendingPoints.length;
    switch (cmd) {
      case 'LINE': case 'L':
        if (pointCount === 0) setLocalFeedback('LINE — Click to specify the FIRST point.');
        else setLocalFeedback('LINE — Click to specify the SECOND point. (Hold Shift for ortho)');
        break;
      case 'ARC': case 'A':
        if (pointCount === 0) setLocalFeedback('ARC — Step 1/3: Click to specify the START point.');
        else if (pointCount === 1) setLocalFeedback('ARC — Step 2/3: Click to specify the MID point on the arc.');
        else setLocalFeedback('ARC — Step 3/3: Click to specify the END point of the arc.');
        break;
      case 'PLINE': case 'PL':
        if (pointCount === 0) setLocalFeedback('PLINE — Click to specify the START point.');
        else setLocalFeedback(`PLINE — ${pointCount} point(s) placed. Click to add more, press Enter/Esc to finish.`);
        break;
      case 'RECTANG': case 'REC':
        if (pointCount === 0) setLocalFeedback('RECTANGLE — Click to specify the FIRST corner.');
        else setLocalFeedback('RECTANGLE — Click to specify the OPPOSITE corner.');
        break;
      case 'CIRCLE': case 'C':
        if (pointCount === 0) setLocalFeedback('CIRCLE — Click to specify the CENTER point.');
        else setLocalFeedback('CIRCLE — Click to specify a point on the RADIUS.');
        break;
      case 'ARROW': case 'AR':
        if (pointCount === 0) setLocalFeedback('ARROW — Click to specify the START point.');
        else setLocalFeedback('ARROW — Click to specify the END point. (Hold Shift for ortho)');
        break;
      case 'DIST': case 'DI': case 'DIMLINEAR': case 'DLI': case 'DIMALIGNED': case 'DAL':
        if (pointCount === 0) setLocalFeedback(`${cmd} — Click to specify the FIRST measurement point.`);
        else setLocalFeedback(`${cmd} — Click to specify the SECOND measurement point.`);
        break;
      case 'MTEXT': case 'T': case 'MT':
        setLocalFeedback('TEXT — Click to place the text location.');
        break;
    }
  }, [cadPendingCommand, cadCommandStep, cadPendingPoints.length, cadSelectionMode, localPendingCommand]);

  // Update suggestions as user types
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const q = input.trim().toLowerCase();
    const cloudMatches = CLOUD_SUGGESTIONS.filter(
      (s) => s.alias.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
    const newSuggestions = [...cloudMatches, ...getSuggestions(input)];
    setSuggestions(newSuggestions);
    setSelectedSuggestion(0);
    setShowSuggestions(newSuggestions.length > 0);
  }, [input, getSuggestions]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExecute = useCallback(() => {
    console.log('handleExecute called - input:', input);
    const trimmed = input.trim();

    // If we're waiting for a page-range answer for a cloud conversion, consume it.
    if (cloudPagePrompt) {
      const op = cloudPagePrompt;
      setCloudPagePrompt(null);
      const answer = trimmed.replace(/\s+/g, '');
      const isAll = !answer || answer.toUpperCase() === 'ALL';
      const fullCmd = isAll ? `CLOUD:${op}` : `CLOUD:${op} pages=${answer}`;
      setHistory((prev) => [fullCmd, ...prev.filter((h) => h !== fullCmd)].slice(0, 10));
      setHistoryIndex(-1);
      processCloudCommand(fullCmd);
      setInput('');
      setShowSuggestions(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    // If we're waiting for a text answer for a cloud operation (e.g., REDACT), consume it.
    if (cloudTextPrompt) {
      const op = cloudTextPrompt;
      setCloudTextPrompt(null);
      const answer = trimmed.trim();
      if (!answer) {
        setLocalFeedback(`${op} cancelled: No text provided.`);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      const fullCmd = `CLOUD:${op} text=${answer}`;
      setHistory((prev) => [fullCmd, ...prev.filter((h) => h !== fullCmd)].slice(0, 10));
      setHistoryIndex(-1);
      processCloudCommand(fullCmd);
      setInput('');
      setShowSuggestions(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    // If we're waiting for dual text input (FIND-REPLACE), consume it.
    if (cloudDualTextPrompt) {
      const { op, findText } = cloudDualTextPrompt;
      const answer = trimmed.trim();
      
      if (!answer) {
        setLocalFeedback(`${op} cancelled: No text provided.`);
        setCloudDualTextPrompt(null);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      // If we have findText, this is the replace text
      if (findText) {
        const fullCmd = `CLOUD:${op} findText=${findText} replaceText=${answer}`;
        setHistory((prev) => [fullCmd, ...prev.filter((h) => h !== fullCmd)].slice(0, 10));
        setHistoryIndex(-1);
        processCloudCommand(fullCmd);
        setCloudDualTextPrompt(null);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      } else {
        // This is the find text, now prompt for replace text
        setCloudDualTextPrompt({ op, findText: answer });
        setLocalFeedback(`${op}: Enter the replacement text, or press Escape to cancel.`);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
    }

    if (!trimmed) {
      console.log('handleExecute: empty input, returning');
      return;
    }

    // Intercept Stirling PDF Cloud Commands (supports "CLOUD COMPRESS" and "CLOUD:COMPRESS")
    const upper = trimmed.toUpperCase();
    if (upper.startsWith('CLOUD ') || upper.startsWith('CLOUD:')) {
      const operation = parseCloudOperation(upper);
      const hasPages = upper.includes('PAGES=') || upper.includes('RANGE=');
      const hasText = upper.includes('TEXT=');
      const hasFindText = upper.includes('FINDTEXT=');
      const hasReplaceText = upper.includes('REPLACETEXT=');

      // For large conversions, prompt the user for an exact page range first
      // (unless they already supplied pages=/range=).
      if (CLOUD_PAGE_PROMPT_OPS.has(operation) && !hasPages) {
        setCloudPagePrompt(operation);
        setLocalFeedback(`${operation}: Enter page range (e.g. 1-10 or 1,3,5), or press Enter for ALL pages.`);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      // For operations requiring text input (e.g., REDACT), prompt for text
      // (unless they already supplied text=).
      if (CLOUD_TEXT_PROMPT_OPS.has(operation) && !hasText) {
        setCloudTextPrompt(operation);
        setLocalFeedback(`${operation}: Enter the text to redact (e.g., "confidential"), or press Escape to cancel.`);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      // For operations requiring dual text input (FIND-REPLACE), prompt for find text first
      // (unless they already supplied findText= and replaceText=).
      if (CLOUD_DUAL_TEXT_PROMPT_OPS.has(operation) && (!hasFindText || !hasReplaceText)) {
        setCloudDualTextPrompt({ op: operation, findText: '' });
        setLocalFeedback(`${operation}: Enter the text to find, or press Escape to cancel.`);
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      setHistory((prev) => [trimmed, ...prev.filter((h) => h !== trimmed)].slice(0, 10));
      setHistoryIndex(-1);
      processCloudCommand(trimmed); // Routes to useCloudCommands.ts (updates cadFeedback/cloudStatus)
      setInput('');
      setShowSuggestions(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    // Fetch live state to avoid stale closures
    const storeState = useStore.getState();
    const currentCmd = storeState.cadPendingCommand;
    const currentStep = storeState.cadCommandStep;

    // If ROTATE is active and input is numeric, let the Enter handler take it
    const isRotateActive = (currentCmd?.toUpperCase() === 'ROTATE' || localPendingCommand?.command === 'ROTATE') && currentStep === 2;
    if (isRotateActive) {
      const isNumeric = !isNaN(parseFloat(trimmed));
      if (isNumeric) return;
    }

    // Add to history
    setHistory(prev => {
      const filtered = prev.filter(h => h !== trimmed);
      return [trimmed, ...filtered].slice(0, 10);
    });
    setHistoryIndex(-1);

    // Execute command
    const result = executeCommand(trimmed, localPendingCommand || undefined, setLocalFeedback, setLocalPendingCommand);

    if (result.success) {
      setLocalFeedback(result.message);
      if (localPendingCommand) {
        storeState.setCADPendingCommand(localPendingCommand.command);
        storeState.setCADCommandStep(localPendingCommand.step || 0);
      }
      if (!localPendingCommand) {
        setInput('');
        setShowSuggestions(false);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else {
      setLocalFeedback(result.message);
      setInput('');
      setShowSuggestions(false);
      
      if (localPendingCommand?.command !== 'ROTATE') {
        setLocalPendingCommand(null);
      }
      
      const isNumeric = !isNaN(parseFloat(trimmed));
      const isRotatePending = currentCmd?.toUpperCase() === 'ROTATE' || localPendingCommand?.command === 'ROTATE';
      
      if (!currentCmd && !isNumeric && !isRotatePending && localPendingCommand?.command !== 'ROTATE') {
        console.log('handleExecute: Clearing CAD state - currentCmd:', currentCmd, 'isNumeric:', isNumeric, 'isRotatePending:', isRotatePending, 'localPendingCommand:', localPendingCommand?.command);
        storeState.setCADPendingCommand(null);
        storeState.clearCADPendingPoints();
        storeState.setCADCommandStep(0);
      } else {
        console.log('handleExecute: NOT clearing CAD state - currentCmd:', currentCmd, 'isNumeric:', isNumeric, 'isRotatePending:', isRotatePending, 'localPendingCommand:', localPendingCommand?.command);
      }
    }
  }, [input, localPendingCommand, executeCommand, processCloudCommand, cloudPagePrompt, cloudTextPrompt]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle autocomplete navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = suggestions[selectedSuggestion];
        if (selected) {
          setInput(selected.alias);
          setShowSuggestions(false);
        }
        return;
      }
    }

    // Handle history navigation
    if (e.key === 'ArrowUp' && !showSuggestions) {
      e.preventDefault();
      setHistoryIndex(prev => {
        const next = prev + 1;
        if (next < history.length) {
          setInput(history[next]);
          return next;
        }
        return prev;
      });
      return;
    }
    if (e.key === 'ArrowDown' && !showSuggestions && historyIndex >= 0) {
      e.preventDefault();
      setHistoryIndex(prev => {
        const next = prev - 1;
        if (next >= 0) {
          setInput(history[next]);
          return next;
        }
        setInput('');
        return -1;
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation(); // Stop global window listener from interfering
      
      if (showSuggestions && suggestions.length > 0) {
        const selected = suggestions[selectedSuggestion];
        if (selected) {
          // Cloud commands: fill input (with trailing space for params) and let
          // the user press Enter again to route through the cloud interceptor.
          if (selected.category === 'cloud') {
            setInput(selected.alias + ' ');
            setShowSuggestions(false);
            return;
          }
          setInput(selected.alias);
          setShowSuggestions(false);
          setTimeout(() => {
            executeCommand(selected.alias, localPendingCommand || undefined, setLocalFeedback, setLocalPendingCommand);
            if (!localPendingCommand) setInput('');
          }, 0);
          return;
        }
      }

      // Fetch live state to avoid stale closures
      const storeState = useStore.getState();
      const currentCmd = storeState.cadPendingCommand?.toUpperCase() || '';
      const currentStep = storeState.cadCommandStep;

      // Typed distance/angle for ROTATE, MOVE, COPY at step 2
      if (['ROTATE', 'MOVE', 'COPY'].includes(currentCmd) && currentStep === 2) {
        const val = parseFloat(input.trim());
        if (!isNaN(val)) {
          useStore.setState({ cadPendingExecute: { command: `${currentCmd}_TYPED` as 'ROTATE_TYPED' | 'MOVE_TYPED' | 'COPY_TYPED', payload: val } });
          setInput('');
          setLocalFeedback(`${currentCmd} executed with value ${val}`);
          return;
        } else if (input.trim() !== '') {
          setLocalFeedback(`⌨️ Please type a valid number or click the canvas.`);
          return;
        }
      }

      // Typed distance for OFFSET at step 1
      if (currentCmd === 'OFFSET' && currentStep === 1) {
        const val = parseFloat(input.trim());
        if (!isNaN(val)) {
          useStore.setState({ cadPendingExecute: { command: 'OFFSET', payload: val } });
          setInput('');
          setLocalFeedback(`Offset by ${val}`);
          // Don't clear CAD state here - let MainCanvas handle it after execution
          return;
        } else if (input.trim() !== '') {
          setLocalFeedback(`⌨️ Please type a valid numeric offset distance.`);
          return;
        }
      }

      // Typed radius for CIRCLE at step 1
      if (['CIRCLE', 'C'].includes(currentCmd) && useStore.getState().cadPendingPoints.length === 1) {
        const val = parseFloat(input.trim());
        if (!isNaN(val)) {
          useStore.setState({ cadPendingExecute: { command: 'CIRCLE_TYPED', payload: { radius: val } } });
          setInput('');
          setLocalFeedback(`Circle radius ${val}`);
          return;
        }
      }

      // Typed dimensions for RECTANG at step 1
      if (['RECTANG', 'REC'].includes(currentCmd) && useStore.getState().cadPendingPoints.length === 1) {
        const parts = input.trim().split(',');
        const w = parseFloat(parts[0]);
        const h = parseFloat(parts[1] !== undefined ? parts[1] : parts[0]);
        if (!isNaN(w) && !isNaN(h)) {
          useStore.setState({ cadPendingExecute: { command: 'RECTANG_TYPED', payload: { w, h } } });
          setInput('');
          setLocalFeedback(`Rectangle ${Math.abs(w)}x${Math.abs(h)}`);
          return;
        }
      }

      // Prevent Enter from cancelling ROTATE/MOVE/COPY at step 1
      if (['ROTATE', 'MOVE', 'COPY'].includes(currentCmd) && currentStep === 1) {
        setLocalFeedback('🎯 Please CLICK on the canvas to set the Base Point.');
        return;
      }

      // For multi-step commands, Enter advances to next step
      if (localPendingCommand) {
        executeCommand('', localPendingCommand, setLocalFeedback, setLocalPendingCommand);
      } else {
        handleExecute();
      }
      return;
    }

    if (e.key === ' ' && input.trim()) {
      e.preventDefault();
      e.stopPropagation();
      if (showSuggestions && suggestions.length > 0) {
        const selected = suggestions[selectedSuggestion];
        if (selected) {
          // Cloud commands: accept the alias and add a space so the user can
          // continue typing parameters instead of executing immediately.
          if (selected.category === 'cloud') {
            setInput((selected.alias.toLowerCase().startsWith(input.trim().toLowerCase()) ? selected.alias : input.trim()) + ' ');
            setShowSuggestions(false);
            return;
          }
          setInput(selected.alias);
          setShowSuggestions(false);
          setTimeout(() => {
            executeCommand(selected.alias, localPendingCommand || undefined, setLocalFeedback, setLocalPendingCommand);
            if (!localPendingCommand) setInput('');
          }, 0);
          return;
        }
      }
      handleExecute();
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();

      // Cancel a pending cloud dual text prompt first.
      if (cloudDualTextPrompt) {
        setCloudDualTextPrompt(null);
        setLocalFeedback(`${cloudDualTextPrompt.op} cancelled.`);
        setInput('');
        return;
      }

      // Cancel a pending cloud text prompt first.
      if (cloudTextPrompt) {
        setCloudTextPrompt(null);
        setLocalFeedback(`${cloudTextPrompt} cancelled.`);
        setInput('');
        return;
      }

      // Cancel a pending cloud page-range prompt.
      if (cloudPagePrompt) {
        setCloudPagePrompt(null);
        setLocalFeedback(`${cloudPagePrompt} cancelled.`);
        setInput('');
        return;
      }

      const storeState = useStore.getState();
      const currentCmd = storeState.cadPendingCommand;
      const currentStep = storeState.cadCommandStep;

      // Prevent Escape from cancelling ROTATE at step 2
      if (currentCmd?.toUpperCase() === 'ROTATE' && currentStep === 2) {
        setLocalFeedback('ROTATE: Base point set. Click to set rotation angle or type angle (e.g. 45)');
        setInput('');
        return;
      }
      
      if (currentCmd && (currentCmd.toUpperCase() === 'PLINE' || currentCmd.toUpperCase() === 'PL')) {
        storeState.completePolyline();
        setLocalPendingCommand(null);
        setLocalFeedback('Polyline completed.');
        setInput('');
        return;
      } else if (localPendingCommand || currentCmd) {
        setLocalPendingCommand(null);
        storeState.setCADPendingCommand(null);
        storeState.clearCADPendingPoints();
        storeState.setCADCommandStep(0);
        setLocalFeedback('Command cancelled.');
        setInput('');
      } else if (showSuggestions) {
        setShowSuggestions(false);
      } else {
        setInput('');
        setLocalFeedback('');
      }
      return;
    }
  }, [showSuggestions, suggestions, selectedSuggestion, history, historyIndex, input, localPendingCommand, handleExecute, executeCommand, cloudPagePrompt, cloudTextPrompt]);

  const handleSuggestionClick = (suggestion: CommandSuggestion) => {
    // Cloud commands often need parameters, so just fill the input and let the
    // user add args + press Enter (which routes through the cloud interceptor).
    if (suggestion.category === 'cloud') {
      setInput(suggestion.alias + ' ');
      setShowSuggestions(false);
      inputRef.current?.focus();
      return;
    }
    setInput(suggestion.alias);
    setShowSuggestions(false);
    inputRef.current?.focus();
    // Execute the command immediately
    setTimeout(() => {
      executeCommand(suggestion.alias, localPendingCommand || undefined, setLocalFeedback, setLocalPendingCommand);
      if (!localPendingCommand) {
        setInput('');
      }
    }, 0);
  };

  // Collapsed view - centered toggle button
  if (!isOpen) {
    return (
      <div className="flex justify-center relative h-8 z-40">
        <button
          onClick={onToggle}
          className="h-8 px-4 bg-[#252526] border border-bb-border rounded-t-lg flex items-center gap-2 text-xs text-bb-muted hover:text-bb-text hover:bg-bb-hover transition-colors"
          title="Open CAD Command Line (Ctrl+9)"
        >
          <Terminal size={14} />
          <span className="font-mono hidden sm:inline">Command</span>
        </button>
      </div>
    );
  }

  const isCloudBusy = !!cloudStatus && (cloudStatus.startsWith('Executing') || cloudStatus.startsWith('Validating'));
  const isCloudError = !!cloudStatus && (cloudStatus.startsWith('Failed') || cloudStatus.startsWith('Error'));

  return (
    <div className="flex flex-col items-center px-4 absolute bottom-full left-0 right-0 mb-0 z-40">
      {/* Cloud text prompt banner */}
      {cloudTextPrompt && (
        <div className="w-full max-w-2xl mb-1">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-mono shadow-lg bg-purple-500/15 border-purple-500/40 text-purple-200">
            <span className="shrink-0 font-semibold">{cloudTextPrompt}:</span>
            <span className="flex-1">Type the text to redact (e.g. <span className="font-bold">"confidential"</span>), then Enter. Esc to cancel.</span>
          </div>
        </div>
      )}
      {/* Cloud page-range prompt banner */}
      {cloudPagePrompt && (
        <div className="w-full max-w-2xl mb-1">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-mono shadow-lg bg-amber-500/15 border-amber-500/40 text-amber-200">
            <span className="shrink-0 font-semibold">{cloudPagePrompt}:</span>
            <span className="flex-1">Type page range (e.g. <span className="font-bold">1-10</span> or <span className="font-bold">1,3,5</span>), then Enter. Empty Enter = ALL pages. Esc to cancel.</span>
          </div>
        </div>
      )}
      {/* Cloud command status banner (always visible during/after cloud ops) */}
      {cloudStatus && (
        <div className="w-full max-w-2xl mb-1">
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-mono shadow-lg ${
              isCloudError
                ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : isCloudBusy
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                : 'bg-green-500/15 border-green-500/40 text-green-300'
            }`}
          >
            {isCloudBusy && (
              <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
            )}
            <span className="shrink-0 font-semibold">Cloud:</span>
            <span className="flex-1 truncate">{cloudStatus}</span>
          </div>
        </div>
      )}
      <div 
        className={`w-full max-w-2xl flex flex-col bg-[#1e1e1e] border border-bb-border rounded-t-lg shadow-2xl transition-all ${isExpanded ? 'h-64' : 'h-12'}`}
        
        // --- ADD THESE TWO LINES ---
        onPointerDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        onPointerUp={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        // ---------------------------
        
        onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
        onMouseUp={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
      >
      {/* Feedback/Message Area (visible when expanded) */}
      {isExpanded && (
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
          <div className="text-bb-muted mb-2">CAD Command History:</div>
          {(cadFeedback || localFeedback) && (
            <div className="text-green-400 whitespace-pre-wrap mb-2">{cadFeedback || localFeedback}</div>
          )}
          {(localPendingCommand || cadPendingCommand) && (
            <div className="text-yellow-400">
              {localPendingCommand?.command || cadPendingCommand} 
              {cadPendingPoints.length > 0 && ` (${cadPendingPoints.length} points collected)`}
              {cadCommandStep > 0 && ` - Step ${cadCommandStep}`}
            </div>
          )}
          {history.length === 0 && !cadFeedback && !localFeedback && (
            <div className="text-gray-500 italic">
              Welcome to CAD Command Line. Type ? for help or L for line tool.
            </div>
          )}
          {history.slice(0, 5).map((cmd, i) => (
            <div key={i} className="text-bb-muted/60">{`> ${cmd}`}</div>
          ))}
        </div>
      )}

      {/* Command Input Bar */}
      <div className="h-12 flex items-center gap-2 px-3 bg-[#252526] border-t border-bb-border">
        {/* Command Prompt */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Terminal size={14} className="text-bb-blue" />
          <span className={`font-mono text-sm font-semibold ${cloudPagePrompt ? 'text-amber-400' : cloudTextPrompt ? 'text-purple-400' : 'text-bb-blue'}`}>
            {cloudPagePrompt ? `${cloudPagePrompt} PAGES` : cloudTextPrompt ? `${cloudTextPrompt} TEXT` : (localPendingCommand ? localPendingCommand.alias : (cadPendingCommand || 'COMMAND'))}
          </span>
          <span className="text-bb-muted">{'>'}</span>
        </div>

        {/* Input Field */}
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              e.stopPropagation(); // Prevent event bubbling to global hotkey listener
              handleKeyDown(e);
            }}
            onFocus={() => input && setShowSuggestions(true)}
            placeholder={cloudPagePrompt ? 'e.g. 1-10 or 1,3,5  (Enter = all pages)' : cloudTextPrompt ? 'e.g. "confidential" or "secret"' : (localPendingCommand ? getPlaceholder(localPendingCommand.command, cadPendingPoints.length, localPendingCommand.step || 0, cadSelectedIds.length) : (cadPendingCommand ? getPlaceholder(cadPendingCommand, cadPendingPoints.length, cadCommandStep, cadSelectedIds.length) : 'Type command (e.g. L, REC, RO, ARC)...'))}
            className="w-full bg-transparent font-mono text-sm text-bb-text placeholder:text-gray-600 outline-none"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
          />

          {/* Autocomplete Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              className="absolute bottom-full left-0 mb-1 bg-[#252526] border border-bb-border rounded shadow-xl z-50 min-w-[280px] max-w-[400px]"
            >
              <div className="max-h-48 overflow-y-auto py-1">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.name}
                    onClick={() => handleSuggestionClick(suggestion)}
                    onMouseEnter={() => setSelectedSuggestion(index)}
                    className={`w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                      index === selectedSuggestion
                        ? 'bg-bb-blue/20'
                        : 'hover:bg-bb-hover'
                    }`}
                  >
                    <span className={`font-mono text-sm font-bold min-w-8 whitespace-nowrap ${categoryColors[suggestion.category]}`}>
                      {suggestion.alias}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-mono text-sm text-bb-text">
                      {suggestion.name}
                    </span>
                    <span className="flex-1" />
                    <span className="text-[10px] text-gray-500 truncate max-w-[120px]">
                      {suggestion.description}
                    </span>
                  </button>
                ))}
              </div>
              <div className="px-3 py-1 bg-[#1e1e1e] border-t border-bb-border text-[10px] text-gray-500">
                ↑↓ to navigate, Tab/Enter to select, Esc to close
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Expand/Collapse History */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-bb-hover text-bb-muted hover:text-bb-text transition-colors"
            title={isExpanded ? 'Collapse history' : 'Expand history'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {/* Help Button */}
          <button
            onClick={() => {
              setInput('?');
              handleExecute();
            }}
            className="p-1.5 rounded hover:bg-bb-hover text-bb-muted hover:text-bb-text transition-colors"
            title="Show help"
          >
            <CommandIcon size={14} />
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-bb-border mx-1" />

          {/* Close Button */}
          <button
            onClick={onToggle}
            className="p-1.5 rounded hover:bg-red-500/20 text-bb-muted hover:text-red-400 transition-colors"
            title="Close command line (Esc)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Quick Reference (visible when expanded) */}
      {isExpanded && (
        <div className="h-8 flex items-center gap-4 px-3 bg-[#1e1e1e] border-t border-bb-border text-[10px] text-gray-500 overflow-x-auto scrollbar-thin">
          <span className="text-bb-muted shrink-0">Quick:</span>
          {[
            { alias: 'L', name: 'Line', cat: 'draw' },
            { alias: 'C', name: 'Circle', cat: 'draw' },
            { alias: 'REC', name: 'Rect', cat: 'draw' },
            { alias: 'M', name: 'Move', cat: 'modify' },
            { alias: 'TR', name: 'Trim', cat: 'modify' },
            { alias: 'Z', name: 'Zoom', cat: 'navigate' },
            { alias: 'T', name: 'Text', cat: 'annotate' },
            { alias: 'DI', name: 'Dist', cat: 'annotate' },
          ].map(({ alias, name, cat }) => (
            <button
              key={alias}
              onClick={() => {
                setInput(alias);
                handleExecute();
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded hover:bg-bb-hover transition-colors shrink-0 ${categoryColors[cat]}`}
            >
              <span className="font-mono font-bold">{alias}</span>
              <span className="text-gray-500">{name}</span>
            </button>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
