import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Plus, ChevronDown, ChevronUp, HelpCircle, Ticket } from 'lucide-react';
import ReactDOM from 'react-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Ticket {
  id: string;
  type: 'bug' | 'feature';
  title: string;
  description: string;
  status: 'open' | 'closed';
  createdAt: number;
}

export default function HelpChatbox() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Welcome to World\'s Most Advanced PDF Editor with AI Capabilities for Engineers, Architects, and Lawyers!\n\nI can help you with:\n\n• Measurement tools (distance, area, perimeter, polyline, angle)\n• Drawing annotations (lines, arrows, shapes, text)\n• CAD command line (Ctrl+9) for AutoCAD-style commands\n• Calibration and scaling\n• PDF editing features\n• BIM capture and plan review\n• AI-powered analysis and annotations\n\nHow can I help you today?',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketType, setTicketType] = useState<'bug' | 'feature'>('bug');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response (in production, this would call an AI API)
    setTimeout(() => {
      const response = generateAIResponse(userMessage.content);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  };

  const generateAIResponse = (query: string): string => {
    const lowerQuery = query.toLowerCase();

    // CAD Command Line Help
    if (lowerQuery.includes('command') || lowerQuery.includes('cad') || lowerQuery.includes('autocad') || lowerQuery.includes('ctrl+9')) {
      return 'CAD Command Line (Ctrl+9):\n\nAccess AutoCAD-style commands by pressing Ctrl+9 or clicking the Command button at the bottom.\n\n**Drawing Commands:**\n• L (LINE) - Create straight line segments\n• PL/PLINE - Create a polyline (continuous line with multiple points)\n• REC (RECTANG) - Create a rectangle\n• C (CIRCLE) - Create a circle\n• A (ARC) - Create an arc\n• EL (ELLIPSE) - Create an ellipse\n• H (HATCH) - Fill an enclosed area\n• FH (FREEHAND) - Create freehand sketch\n\n**Modify Commands:**\n• M (MOVE) - Move selected objects\n• CO/CP (COPY) - Duplicate selected objects\n• RO (ROTATE) - Rotate objects around a base point\n• SC (SCALE) - Scale objects (zoom)\n• TR (TRIM) - Trim objects to meet other objects\n• EX (EXTEND) - Extend objects\n• F (FILLET) - Round edges\n• O (OFFSET) - Create parallel lines/curves\n• J (JOIN) - Join similar objects\n• X (EXPLODE) - Break compound objects into parts\n• E (ERASE) - Remove objects\n• FENCE/FENCE_TRIM - Draw cutting line to trim multiple objects\n\n**Annotation Commands:**\n• T/MT (MTEXT) - Create multiline text\n• ED (DDEDIT) - Edit text\n• DI (DIST) - Measure distance\n• DLI (DIMLINEAR) - Create linear dimensions\n• DAL (DIMALIGNED) - Create aligned dimensions\n• LE (LEADER) - Create leader lines\n• AA (AREA) - Calculate area and perimeter\n• CL (CLOUD) - Create revision cloud\n• AR (ARROW) - Create an arrow\n• CAL (CALIBRATE) - Calibrate measurement scale\n• PI (PIN) - Add location pin\n• HI (HIGHLIGHT) - Highlight text/area\n• ST (STRIKETHROUGH) - Add strikethrough markup\n• N (COUNT) - Add count markers\n\n**Navigation Commands:**\n• Z (ZOOM) - Zoom in/out (options: E/Extents, W/Window, P/Previous, S/Scale)\n• P (PAN) - Pan the view\n• RE (REGEN) - Regenerate display\n• R (REDRAW) - Refresh display\n\n**Utility Commands:**\n• U (UNDO) - Reverse last command\n• REDO - Reverse undo\n• ? (HELP) - Display help\n• SEL (SELECT) - Select objects\n• ALL - Select all objects\n• PU (PURGE) - Remove unused items\n• OVERKILL - Delete duplicate objects\n\n**Property Commands:**\n• LA (LAYER) - Manage layers\n• COL (COLOR) - Set color\n• LT (LINETYPE) - Set linetype\n• UN (UNITS) - Set drawing units\n\n**Special Features:**\n• F3 - Toggle OSNAP (PDF vector snapping) on/off\n• Middle mouse button - Temporary pan mode\n\n**Tips:**\n• Press Enter or Space to execute commands\n• Use Tab for autocomplete\n• Arrow keys navigate history\n• Press Esc to cancel or exit';
    }

    // Specific CAD command help
    if (lowerQuery.includes('pline') || lowerQuery.includes('polyline command')) {
      return 'PLINE Command:\n\nCreates a continuous polyline with multiple points.\n\nUsage:\n1. Type PL or PLINE in command line\n2. Click to place start point\n3. Continue clicking to add points (up to 50)\n4. Press Enter or right-click to finalize\n5. Press Esc to cancel\n\nUse Cases:\n• Measuring along complex paths\n• Creating multi-segment lines\n• Following contours on drawings\n• Measuring perimeter of irregular shapes';
    }

    if (lowerQuery.includes('trim') || lowerQuery.includes('extend')) {
      return 'TRIM (TR) and EXTEND (EX) Commands:\n\nTRIM:\n• Select cutting edges (lines that will trim others)\n• Click lines to trim them at intersection\n• Shift+click to extend instead of trim\n• Press Enter when done\n\nEXTEND:\n• Select boundary edges\n• Click lines to extend to boundary\n\nUse Cases:\n• Cleaning up intersecting lines\n• Extending lines to meet boundaries\n• Precise line editing on architectural drawings';
    }

    if (lowerQuery.includes('explode') || lowerQuery.includes('x command')) {
      return 'EXPLODE (X) Command:\n\nBreaks compound objects into component parts.\n\nUsage:\n1. Type X or EXPLODE\n2. Select objects to explode (rectangles, polylines)\n3. Press Enter to execute\n\nResults:\n• Rectangles become 4 separate lines\n• Polylines become individual line segments\n\nUse Cases:\n• Editing individual segments of shapes\n• Modifying parts of complex annotations\n• Converting shapes to editable lines';
    }

    if (lowerQuery.includes('erase') || lowerQuery.includes('delete command')) {
      return 'ERASE (E) Command:\n\nRemoves objects from the drawing.\n\nUsage:\n1. Type E or ERASE\n2. Click objects to select them (or drag selection box)\n3. Press Enter to delete selected\n4. Type ALL to delete all objects on current page\n\nUse Cases:\n• Quick deletion of multiple annotations\n• Batch cleanup of drawings\n• Removing unwanted markup';
    }

    if (lowerQuery.includes('zoom command') || lowerQuery.includes('z command')) {
      return 'ZOOM (Z) Command:\n\nControls view magnification.\n\nOptions:\n• E or EXTENTS - Fit entire page to screen\n• W or WINDOW - Drag rectangle to zoom to area\n• P or PREVIOUS - Return to previous zoom\n• S or SCALE - Enter scale factor (e.g., 2 for 200%)\n• Or just type a number (e.g., 1.5 for 150%)\n\nUse Cases:\n• Quick navigation between views\n• Precise zoom to specific areas\n• Standardized zoom levels for review';
    }

    if (lowerQuery.includes('distance') || lowerQuery.includes('di command')) {
      return 'DIST (DI) Command:\n\nMeasures distance and angle between two points.\n\nUsage:\n1. Type DI or DIST\n2. Click first point\n3. Click second point\n4. Distance is displayed\n\nUse Cases:\n• Quick distance measurements\n• Verifying dimensions on drawings\n• Checking spacing requirements';
    }

    if (lowerQuery.includes('area command') || lowerQuery.includes('aa command')) {
      return 'AREA (AA) Command:\n\nCalculates area and perimeter of closed shapes.\n\nUsage:\n1. Type AA or AREA\n2. Click points around the shape perimeter\n3. Click near start point to close the shape\n4. Area and perimeter are displayed\n\nUse Cases:\n• Calculating room areas\n• Measuring lot sizes\n• Determining material quantities';
    }

    if (lowerQuery.includes('calibrate') || lowerQuery.includes('cal command')) {
      return 'CALIBRATE (CAL) Command:\n\nSets the measurement scale for accurate measurements.\n\nUsage:\n1. Type CAL or CALIBRATE\n2. Click first point of known distance\n3. Click second point of known distance\n4. Enter the actual distance and unit\n\nUse Cases:\n• Setting scale from architectural drawings\n• Calibrating to engineering scales\n• Ensuring accurate measurements';
    }

    // New CAD tools help
    if (lowerQuery.includes('copy') || lowerQuery.includes('co command') || lowerQuery.includes('cp command')) {
      return 'COPY (CO/CP) Command:\n\nDuplicates selected annotations and places them 20 pixels away.\n\nUsage:\n1. Select the annotation(s) you want to copy (click on them, or use box selection)\n2. Open the Command Line (Ctrl+9)\n3. Type COPY (or CO or CP)\n4. Press Enter\n5. The copy appears immediately, offset by 20px\n\nUse Cases:\n• Quickly duplicating measurements\n• Creating repeated patterns\n• Copying annotations to similar locations';
    }

    if (lowerQuery.includes('offset') || lowerQuery.includes('o command')) {
      return 'OFFSET (O) Command:\n\nCreates a parallel copy of lines or polylines at a specified distance.\n\nUsage:\n1. Select the line or polyline you want to offset (must be selected first)\n2. Open the Command Line (Ctrl+9)\n3. Type OFFSET (or just O)\n4. Press Enter\n5. Type the distance (e.g., 10 for 10 pixels)\n6. Press Enter\n7. The offset copy appears\n\nUse Cases:\n• Creating parallel walls or boundaries\n• Drawing offset lines for construction\n• Creating spacing between elements';
    }

    if (lowerQuery.includes('fence') || lowerQuery.includes('fence_trim')) {
      return 'FENCE_TRIM (FENCE) Command:\n\nDraws a "cutting line" across annotations and trims everything on one side.\n\nUsage:\n1. Open the Command Line (Ctrl+9)\n2. Type FENCE or FENCE_TRIM\n3. Press Enter\n4. Your cursor changes - click and drag to draw the fence line\n5. Release to cut - everything on the "far side" of the fence gets trimmed\n\nTip: Start the fence on the side you want to KEEP. The side farther from your start point gets trimmed.\n\nUse Cases:\n• Trimming multiple lines at once\n• Cutting across complex drawings\n• Batch cleanup of intersecting lines';
    }

    if (lowerQuery.includes('hatch') || lowerQuery.includes('fill')) {
      return 'HATCH (H) Command:\n\nFills an existing closed shape with a semi-transparent color.\n\nUsage:\n1. Select the Hatch tool from the toolbar (or type H in command line)\n2. Click inside any closed shape (drawn rectangle, circle, area measurement, etc.)\n3. The shape fills with the current style color\n\nUse Cases:\n• Highlighting rooms or areas\n• Marking filled regions\n• Visualizing zones on plans';
    }

    if (lowerQuery.includes('osnap') || lowerQuery.includes('snap') || lowerQuery.includes('f3')) {
      return 'OSNAP (PDF Snap) - F3 Key:\n\nYour cursor will "stick" to endpoints of lines that exist in the original PDF (like walls, grid lines, etc.).\n\nUsage:\n1. Press F3 on your keyboard to turn it ON or OFF\n2. When ON, your cursor will snap to nearby PDF vector endpoints\n3. When OFF, cursor moves freely\n\nBest for:\n• Tracing over existing floor plans\n• Aligning measurements to PDF grid lines\n• Drawing precisely on top of PDF elements\n\nTip: Check the console to see if OSNAP is ON or OFF';
    }

    if (lowerQuery.includes('rotate') || lowerQuery.includes('ro command')) {
      return 'ROTATE (RO) Command:\n\nRotates selected annotations around a base point you pick.\n\nUsage:\n1. Open the Command Line (Ctrl+9)\n2. Type ROTATE (or RO)\n3. Press Enter\n4. Select the object(s) you want to rotate (click them)\n5. Press Enter when done selecting\n6. Click to set the "base point" (the center of rotation)\n7. Move your mouse to preview the rotation, or type an angle (like 45 for 45 degrees)\n8. Click to accept, or type the angle and press Enter\n\nUse Cases:\n• Rotating annotations to match drawing angles\n• Aligning elements to specific orientations\n• Adjusting the angle of measurements';
    }

    // Knowledge base for BluePrint PDF Editor
    if (lowerQuery.includes('polyline') || lowerQuery.includes('measure')) {
      return 'For the Polyline measurement tool:\n\n1. Select the Polyline tool from the toolbar (Ruler icon group)\n2. Click to place each point along the path you want to measure\n3. Continue clicking to add up to 50 points\n4. Press Enter or right-click to finalize the measurement\n5. The tool will show segment distances and total length\n\nTip: Use Shift+click to constrain to horizontal/vertical axes.\n\nCAD Alternative: Type PL or PLINE in command line (Ctrl+9)';
    }
    if (lowerQuery.includes('calibrat') || lowerQuery.includes('scale')) {
      return 'To calibrate measurements:\n\n1. Select the Calibrate tool (K key)\n2. Click two points on the PDF that you know the distance between\n3. Enter the known distance and unit when prompted\n4. All measurements will now be scaled correctly\n\nYou can set different calibrations for each page.\n\nCAD Alternative: Type CAL or CALIBRATE in command line (Ctrl+9)';
    }
    if (lowerQuery.includes('area') || lowerQuery.includes('perimeter')) {
      return 'Area and Perimeter measurements:\n\n• Area tool (Q key): Click points around a closed shape, then click near the start point to auto-close\n• Perimeter tool: Similar to polyline but measures the perimeter of a shape\n• Both require calibration for accurate measurements\n\nCAD Alternative: Type AA or AREA in command line (Ctrl+9)';
    }
    if (lowerQuery.includes('annotat') || lowerQuery.includes('draw')) {
      return 'Drawing annotations:\n\n• Line (L), Arrow (A), Rectangle (R), Circle (O)\n• Cloud (C), Freehand (F), Highlight (H)\n• Text (T), Text with Leader (Shift+T)\n• Use the toolbar to change color, stroke width, and opacity\n\nCAD Alternative: Use command line (Ctrl+9) with commands like L, C, REC, T, etc.';
    }
    if (lowerQuery.includes('bim') || lowerQuery.includes('plan review')) {
      return 'BIM Capture and Plan Review:\n\n• BIM Capture (B key): Place markers for doors, walls, suppliers, fire ratings\n• Plan Review: AI-powered structural plan review for engineering drawings\n• Use AI Tools menu to access these features';
    }
    if (lowerQuery.includes('zoom') || lowerQuery.includes('pan')) {
      return 'Zoom and Pan controls:\n\n• Scroll wheel to zoom in/out\n• Zoom rectangle tool for precise zooming\n• Pan tool (Space key or Space+drag)\n• Fit to Screen button in bottom bar\n\nCAD Alternative: Type Z (ZOOM) or P (PAN) in command line (Ctrl+9)';
    }
    if (lowerQuery.includes('export') || lowerQuery.includes('save')) {
      return 'Export and Save:\n\n• Ctrl+S to save (with file handle support)\n• Export PDF with annotations burned in\n• Export as ZIP (pages + images)\n• Print directly from the app';
    }
    if (lowerQuery.includes('ticket') || lowerQuery.includes('bug') || lowerQuery.includes('feature')) {
      return 'You can raise tickets for bugs or feature requests!\n\nClick the "Raise Ticket" button in this chat to:\n• Report a bug or issue you encountered\n• Request a new feature\n• Provide feedback on the software\n\nOur team will review and respond to your tickets.';
    }

    return 'I can help you with BluePrint PDF Editor features including:\n\n• CAD Command Line (Ctrl+9) - AutoCAD-style commands\n• New CAD tools: COPY, OFFSET, FENCE_TRIM, HATCH, OSNAP (F3), ROTATE\n• Measurement tools (distance, area, perimeter, polyline, angle)\n• Drawing annotations\n• Calibration and scaling\n• BIM capture and plan review\n• PDF editing and export\n• Zoom and navigation\n\nType "command" or "cad" for a full list of CAD commands, or ask about a specific tool like "copy", "offset", "fence", "hatch", "osnap", or "rotate". Click "Raise Ticket" to report an issue or request a feature.';
  };

  const handleTicketSubmit = async () => {
    if (!ticketTitle.trim() || !ticketDescription.trim()) {
      alert('Please fill in both title and description');
      return;
    }

    setIsSubmittingTicket(true);

    try {
      const ticketData = {
        type: ticketType,
        title: ticketTitle,
        description: ticketDescription,
        status: 'open' as const,
        userId: user?.uid || 'anonymous',
        userEmail: user?.email || null,
        userDisplayName: user?.displayName || null,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'tickets'), ticketData);

      setTicketTitle('');
      setTicketDescription('');
      setShowTicketForm(false);

      // Add confirmation message
      const confirmationMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `✅ ${ticketType === 'bug' ? 'Bug report' : 'Feature request'} submitted successfully!\n\nTicket ID: ${docRef.id}\nTitle: ${ticketTitle}\n\nOur team will review this and get back to you.`,
        timestamp: Date.now(),
      };
      setMessages((prev: Message[]) => [...prev, confirmationMessage]);
    } catch (error) {
      console.error('Failed to submit ticket:', error);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Failed to submit ticket. Please try again or contact support directly.\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      };
      setMessages((prev: Message[]) => [...prev, errorMessage]);
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-12 right-4 bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all hover:scale-105 z-50"
        title="Help & Support"
      >
        <HelpCircle size={24} />
      </button>
    );
  }

  const chatContent = (
    <div className="fixed bottom-12 right-4 w-96 bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl z-50 flex flex-col max-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-bb-border bg-bb-panel">
        <div className="flex items-center gap-2">
          <MessageSquare size={18} className="text-blue-400" />
          <span className="text-sm font-medium text-bb-text">Help & Support</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[300px] max-h-[400px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-2.5 rounded-lg text-xs ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-bb-panel border border-bb-border text-bb-text'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-bb-panel border border-bb-border p-2.5 rounded-lg text-xs text-bb-muted">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-bb-muted rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-bb-muted rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-bb-muted rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Ticket Form */}
          {showTicketForm && (
            <div className="p-3 border-t border-bb-border bg-bb-panel">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setTicketType('bug')}
                    className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                      ticketType === 'bug'
                        ? 'bg-red-600 text-white'
                        : 'bg-bb-dark border border-bb-border text-bb-muted hover:text-bb-text'
                    }`}
                  >
                    🐛 Bug Report
                  </button>
                  <button
                    onClick={() => setTicketType('feature')}
                    className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                      ticketType === 'feature'
                        ? 'bg-green-600 text-white'
                        : 'bg-bb-dark border border-bb-border text-bb-muted hover:text-bb-text'
                    }`}
                  >
                    ✨ Feature Request
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Title"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue"
                />
                <textarea
                  placeholder="Description"
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleTicketSubmit}
                    disabled={isSubmittingTicket}
                    className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
                  >
                    {isSubmittingTicket ? 'Submitting...' : 'Submit Ticket'}
                  </button>
                  <button
                    onClick={() => setShowTicketForm(false)}
                    disabled={isSubmittingTicket}
                    className="px-3 py-1.5 bg-bb-dark border border-bb-border text-bb-muted hover:text-bb-text disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-bb-border bg-bb-panel">
            <div className="flex gap-2">
              <button
                onClick={() => setShowTicketForm(!showTicketForm)}
                className="p-2 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors"
                title="Raise Ticket"
              >
                <Ticket size={18} />
              </button>
              <input
                ref={inputRef}
                type="text"
                placeholder="Ask a question..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                className="flex-1 bg-bb-dark border border-bb-border rounded px-3 py-2 text-xs text-bb-text outline-none focus:border-bb-blue"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:cursor-not-allowed rounded text-white transition-colors"
                title="Send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return ReactDOM.createPortal(chatContent, document.body);
}
