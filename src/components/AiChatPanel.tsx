import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { chatWithPdf, extractFullText, clearTextCache } from '../utils/pdfChat';
import type { ChatMessage } from '../utils/pdfChat';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import {
  MessageSquare,
  Send,
  Loader2,
  X,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  Sparkles,
  FileText,
  Minimize2,
  Maximize2,
} from 'lucide-react';

const QUICK_PROMPTS = [
  'Summarize this document',
  'What are the key points?',
  'List all dates and deadlines',
  'Find all names mentioned',
  'What are the action items?',
  'Explain page {page} in simple terms',
];

export default function AiChatPanel({ onClose }: { onClose: () => void }) {
  const { pageCount, currentDocument, currentPage } = useStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-extract text when panel opens
  useEffect(() => {
    if (pdfText || extracting) return;
    if (pageCount === 0) return;
    setExtracting(true);
    extractFullText(pageCount, (page, total) => {
      setExtractStatus(`Reading page ${page}/${total}...`);
    })
      .then((text) => {
        setPdfText(text);
        setExtractStatus('');
      })
      .catch(() => setExtractStatus('Failed to extract text'))
      .finally(() => setExtracting(false));
  }, [pageCount, pdfText, extracting]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    if (!pdfText) {
      setError('PDF text is still loading...');
      return;
    }

    setError('');

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Get API key from Firebase Functions
      const result = await httpsCallable(functions, 'getApiKey')();
      const apiKey = (result.data as { apiKey: string }).apiKey;

      if (!apiKey) {
        throw new Error('Failed to get API key from Firebase Functions');
      }

      // Call chat with PDF using the API key
      const response = await chatWithPdf(
        apiKey,
        pdfText,
        currentDocument?.name || 'Document',
        [...messages, userMsg],
      );

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('AI chat error:', err);
      const errorMessage = err?.message || err?.toString() || 'Failed to get response';
      setError(errorMessage);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    const processed = prompt.replace('{page}', String(currentPage + 1));
    setInput(processed);
    inputRef.current?.focus();
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleClearChat = () => {
    setMessages([]);
    setError('');
  };

  if (minimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 bg-bb-panel border border-bb-border rounded-xl shadow-2xl cursor-pointer hover:border-bb-blue transition-colors"
        onClick={() => setMinimized(false)}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <Sparkles size={16} className="text-purple-400" />
          <span className="text-xs font-semibold text-bb-text">AI Chat</span>
          {messages.length > 0 && (
            <span className="bg-purple-600 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {messages.filter((m) => m.role === 'assistant').length}
            </span>
          )}
          <Maximize2 size={12} className="text-bb-muted ml-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[420px] h-[600px] max-h-[80vh] bg-bb-panel border border-bb-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border bg-gradient-to-r from-purple-600/10 to-blue-600/10 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-400" />
          <span className="text-sm font-semibold text-bb-text">AI Chat</span>
          {currentDocument && (
            <span className="text-[10px] text-bb-muted truncate max-w-[140px]">
              — {currentDocument.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-red-400 transition-colors"
              title="Clear chat"
            >
              <Trash2 size={13} />
            </button>
          )}
          <button
            onClick={() => setMinimized(true)}
            className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors"
            title="Minimize"
          >
            <Minimize2 size={13} />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Extraction status */}
      {extracting && (
        <div className="px-4 py-2 bg-blue-600/5 border-b border-bb-border flex items-center gap-2 text-[11px] text-blue-300 shrink-0">
          <Loader2 size={11} className="animate-spin" />
          {extractStatus || 'Extracting PDF text...'}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !extracting && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-600/10 flex items-center justify-center">
              <MessageSquare size={24} className="text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-bb-text mb-1">Chat with your PDF</p>
              <p className="text-[11px] text-bb-muted leading-relaxed max-w-[280px]">
                Ask questions, find information, get summaries, or explore your document with AI
              </p>
            </div>
            {/* Quick prompts */}
            <div className="flex flex-wrap gap-1.5 justify-center max-w-[340px]">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleQuickPrompt(prompt)}
                  className="px-2.5 py-1 bg-bb-hover hover:bg-bb-border border border-bb-border rounded-full text-[10px] text-bb-muted hover:text-bb-text transition-colors"
                >
                  {prompt.replace('{page}', String(currentPage + 1))}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-[12px] leading-relaxed relative group ${
                msg.role === 'user'
                  ? 'bg-bb-blue/20 text-bb-text rounded-br-sm'
                  : 'bg-bb-sidebar border border-bb-border text-bb-text rounded-bl-sm'
              }`}
            >
              {msg.role === 'user' && msg.pageRef !== undefined && (
                <span className="text-[9px] text-bb-muted block mb-0.5">
                  on page {msg.pageRef + 1}
                </span>
              )}
              <ChatMarkdown text={msg.content} />
              {msg.role === 'assistant' && (
                <button
                  onClick={() => handleCopy(msg.id, msg.content)}
                  className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 bg-bb-dark/80 rounded text-bb-muted hover:text-bb-text transition-all"
                  title="Copy"
                >
                  {copied === msg.id ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-bb-sidebar border border-bb-border rounded-xl rounded-bl-sm px-3 py-2 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-purple-400" />
              <span className="text-[11px] text-bb-muted">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts when conversation exists */}
      {messages.length > 0 && !loading && (
        <div className="px-4 py-1.5 border-t border-bb-border bg-bb-sidebar/50 shrink-0 overflow-x-auto">
          <div className="flex gap-1.5 whitespace-nowrap">
            {['Tell me more', 'Which page?', 'Summarize this', 'What else?'].map((q) => (
              <button
                key={q}
                onClick={() => handleQuickPrompt(q)}
                className="px-2 py-0.5 bg-bb-hover hover:bg-bb-border border border-bb-border rounded-full text-[9px] text-bb-muted hover:text-bb-text transition-colors shrink-0"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="px-4 py-3 border-t border-bb-border bg-bb-sidebar shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pdfText ? 'Ask about your PDF...' : 'Loading PDF text...'}
            disabled={!pdfText || loading}
            rows={1}
            className="flex-1 bg-bb-dark border border-bb-border rounded-lg px-3 py-2 text-xs text-bb-text outline-none focus:border-bb-blue resize-none max-h-[80px] disabled:opacity-50"
            style={{ minHeight: '36px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 80) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || !pdfText}
            className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-600/30 text-white rounded-lg transition-colors disabled:opacity-50 shrink-0"
            title="Send (Enter)"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[9px] text-bb-muted">
            {pdfText
              ? `${pageCount} pages loaded · Page ${currentPage + 1} active`
              : 'Extracting text...'}
          </span>
          <span className="text-[9px] text-bb-muted">
            Shift+Enter for newline
          </span>
        </div>
      </div>
    </div>
  );
}

/** Simple markdown renderer for chat messages */
function ChatMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-semibold text-[12px] text-purple-300 mt-2 mb-0.5">{parseBold(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-semibold text-[13px] text-purple-300 mt-2 mb-0.5">{parseBold(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-bold text-[13px] text-purple-200 mt-1.5 mb-0.5">{parseBold(line.slice(2))}</h2>);
    } else if (line.match(/^\s*[-*]\s/)) {
      const content = line.replace(/^\s*[-*]\s/, '');
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1.5 my-0.5">
          <span className="text-purple-400 shrink-0">•</span>
          <span>{parseBold(content)}</span>
        </div>,
      );
    } else if (line.match(/^\s*\d+\.\s/)) {
      const content = line.replace(/^\s*\d+\.\s/, '');
      const num = line.match(/^\s*(\d+)\./)?.[1];
      elements.push(
        <div key={i} className="flex gap-1.5 ml-1.5 my-0.5">
          <span className="text-purple-400 shrink-0 text-[10px] font-medium min-w-[14px]">{num}.</span>
          <span>{parseBold(content)}</span>
        </div>,
      );
    } else if (line.startsWith('```')) {
      // Collect code block
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-bb-dark rounded px-2 py-1.5 my-1 text-[10px] font-mono overflow-x-auto border border-bb-border">
          {codeLines.join('\n')}
        </pre>,
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="my-0.5">{parseBold(line)}</p>);
    }
  }

  return <>{elements}</>;
}

function parseBold(text: string): React.ReactNode {
  // Handle **bold**, `code`, and [Page X] references
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[Page\s*\d+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-bb-text font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-bb-dark px-1 rounded text-purple-300 text-[10px] font-mono">{part.slice(1, -1)}</code>;
    }
    if (part.match(/^\[Page\s*\d+\]$/)) {
      return <span key={i} className="text-blue-400 font-medium text-[10px]">{part}</span>;
    }
    return part;
  });
}
