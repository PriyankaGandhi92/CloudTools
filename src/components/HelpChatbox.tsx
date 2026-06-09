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

    // ===== PERFORMANCE & CORE ENGINE =====
    if (lowerQuery.includes('autosave') || lowerQuery.includes('auto-save') || lowerQuery.includes('save') || lowerQuery.includes('zero-latency')) {
      return 'Zero-Latency Autosave:\n\nNever lose a single line of work. Annotations and CAD geometries are vaulted into a local, offline-first database in milliseconds.\n\n**How it works:**\n• Automatic save 2 seconds after any change\n• Press Ctrl+S (or Cmd+S on Mac) for immediate save\n• Saves to local IndexedDB (fast, offline-first)\n• Optional cloud sync to Firebase when enabled\n\n**Benefits:**\n• No waiting for slow cloud uploads\n• Work offline without internet\n• Instant recovery if browser crashes\n\n**To enable/disable:**\nCheck Settings > Auto-Save toggle';
    }

    if (lowerQuery.includes('browser') || lowerQuery.includes('processing') || lowerQuery.includes('50mb') || lowerQuery.includes('massive')) {
      return 'Browser-Based Processing:\n\nOpen massive 50MB+ architectural blueprints instantly. Rendering and local edits happen directly on your device.\n\n**Features:**\n• No file upload/download wait times\n• All processing happens locally in your browser\n• Supports large PDF files (50MB+)\n• Hardware-accelerated rendering\n\n**Benefits:**\n• Instant file opening\n• Privacy - files stay on your device\n• No server processing delays\n• Works offline';
    }

    if (lowerQuery.includes('offline') || lowerQuery.includes('wi-fi') || lowerQuery.includes('internet') || lowerQuery.includes('sync')) {
      return 'Offline-First Reliability:\n\nKeep working even when the Wi-Fi drops on the job site. Sync to the cloud only when you are ready.\n\n**How it works:**\n• All features work without internet\n• Local database stores all changes\n• Cloud sync happens when connection available\n• No data loss during offline work\n\n**Cloud Sync (Optional):**\n• Enable in Settings > Cloud Sync\n• Secure Firebase syncing\n• Multiple team members can collaborate\n• Syncs annotations, measurements, bookmarks\n\n**Privacy:**\n• Local operations never touch servers\n• Your confidential blueprints stay on your machine\n• Cloud sync is optional and secure';
    }

    // ===== ENTERPRISE CLOUD PROCESSING =====
    if (lowerQuery.includes('redact') || lowerQuery.includes('redaction') || lowerQuery.includes('sensitive') || lowerQuery.includes('scrub')) {
      return 'True Data-Level Redaction:\n\nPermanently scrub sensitive information. Our Cloud Redact tool doesn\'t just draw a black box—it completely strips the underlying text from the document\'s internal data dictionary.\n\n**How to use:**\n1. Open Command Line (Ctrl+9)\n2. Type: CLOUD:REDACT\n3. Enter the text to redact (e.g., "confidential")\n4. The text is permanently removed from the PDF\n\n**What it does:**\n• Removes text from PDF internal structure\n• Not just visual masking\n• Text cannot be recovered\n• Meets compliance requirements';
    }

    if (lowerQuery.includes('compress') || lowerQuery.includes('compression') || lowerQuery.includes('shrink') || lowerQuery.includes('file size')) {
      return 'Intelligent Compression:\n\nShrink massive blueprint files without losing your perfectly aligned annotations and markups.\n\n**How to use:**\n1. Open Command Line (Ctrl+9)\n2. Type: CLOUD:COMPRESS\n3. Optionally specify optimization level (1-9, default 5)\n4. Download compressed PDF\n\n**Features:**\n• Reduces file size significantly\n• Preserves all annotations\n• Maintains image quality\n• Keeps text selectable';
    }

    if (lowerQuery.includes('ocr') || lowerQuery.includes('optical character') || lowerQuery.includes('scanned') || lowerQuery.includes('searchable')) {
      return 'Optical Character Recognition (OCR):\n\nTransform flat, scanned blueprints into fully selectable and searchable text documents.\n\n**How to use:**\n1. Open Command Line (Ctrl+9)\n2. Type: CLOUD:OCR\n3. Optionally specify language (default: eng)\n4. Download OCR-processed PDF\n\n**Features:**\n• Converts images to text\n• Makes PDF searchable\n• Text becomes selectable\n• Supports multiple languages';
    }

    if (lowerQuery.includes('convert') || lowerQuery.includes('word') || lowerQuery.includes('docx') || lowerQuery.includes('powerpoint') || lowerQuery.includes('pptx') || lowerQuery.includes('html')) {
      return 'Instant Format Conversions:\n\nConvert dense PDFs into native, editable Microsoft Word (.docx), PowerPoint, or HTML files with a single command.\n\n**Word Conversion:**\n• Type: CLOUD:TO-WORD\n• Optionally specify pages (e.g., pages=1-10)\n• Download as .docx\n\n**PowerPoint Conversion:**\n• Type: CLOUD:TO-PPT\n• Optionally specify pages\n• Download as .pptx\n\n**HTML Conversion:**\n• Type: CLOUD:TO-HTML\n• Optionally specify pages\n• Download as .zip with HTML\n\n**Page Range Syntax:**\n• Single page: pages=5\n• Range: pages=1-10\n• Multiple: pages=1,3,5-7\n• All pages: leave empty or pages=all';
    }

    // ===== FIELD INSPECTION & TASK MANAGEMENT =====
    if (lowerQuery.includes('task') || lowerQuery.includes('inspection') || lowerQuery.includes('pin') || lowerQuery.includes('geolocated')) {
      return 'Geolocated Task Pins:\n\nDrop inspection tasks, safety hazards, or punch-list items directly onto the exact location on the blueprint.\n\n**How to create a task:**\n1. Press B key or select Task tool\n2. Click on the blueprint location\n3. Fill in task details (name, assignee, category, priority, status)\n4. Add photos (optional)\n5. Save task\n\n**Task Management:**\n• View all tasks in Left Sidebar > Tasks tab\n• Filter by Assignee, Category, or Status\n• See status counts at a glance\n• Click task to navigate to location\n• Double-click to edit task\n\n**Task Status Workflow:**\nOpen → In Progress → Complete → Verified';
    }

    if (lowerQuery.includes('photo') || lowerQuery.includes('capture') || lowerQuery.includes('camera') || lowerQuery.includes('timestamp')) {
      return 'Integrated Photo Capture:\n\nTake photos in the field with automatic timestamps and bind them directly to specific architectural tasks.\n\n**How to add photos to a task:**\n1. Create or edit a task (B key)\n2. Click "Add Photo" button\n3. Take photo with device camera\n4. Photo is automatically timestamped and bound to the task\n\n**Viewing Photos:**\n• Left Sidebar > Photos tab\n• Filter by date or assignee\n• Click photo to go to task location\n• Grid view for easy browsing';
    }

    if (lowerQuery.includes('dashboard') || lowerQuery.includes('filter') || lowerQuery.includes('assignee') || lowerQuery.includes('category') || lowerQuery.includes('status')) {
      return 'Smart Dashboards:\n\nFilter the entire project by Assignee, Category, or Status to instantly see project health and bottlenecks.\n\n**Access Dashboard:**\n• Left Sidebar > Tasks tab\n\n**Filter Options:**\n• By Assignee: See all tasks for a specific person\n• By Category: Filter by task type (e.g., Electrical, Structural)\n• By Status: View Open, In Progress, Complete, or Verified\n\n**Status Counts:**\n• Real-time count of tasks in each status\n• Quick overview of project health\n• Identify bottlenecks at a glance';
    }

    // ===== AUTOMATED REPORTING =====
    if (lowerQuery.includes('report') || lowerQuery.includes('executive') || lowerQuery.includes('generate') || lowerQuery.includes('word report')) {
      return 'One-Click Executive Reports:\n\nGenerate professional, ready-to-send Microsoft Word or PDF inspection reports in seconds.\n\n**How to generate a report:**\n1. Complete your inspection tasks\n2. Go to File > Generate Report\n3. Select report type (Word or PDF)\n4. Choose content (all tasks or filtered, include photos, include measurements)\n5. Click Generate\n\n**Report Contents:**\n• Task summary with status\n• Task details and descriptions\n• Associated photos\n• Measurement data\n• Timestamps and assignees';
    }

    if (lowerQuery.includes('photo grid') || lowerQuery.includes('formatted photo') || lowerQuery.includes('3x3') || lowerQuery.includes('compile')) {
      return 'Formatted Photo Grids:\n\nAutomatically compile all field photos into clean, optimized 3"x3" grids alongside their associated task notes and coordinates.\n\n**How to create photo grid:**\n1. Complete tasks with photos\n2. Go to File > Generate Photo Grid\n3. Select options (all photos or filtered, grid size, include task notes)\n4. Click Generate\n\n**Output Features:**\n• Clean 3"x3" photo grids\n• Task notes below each photo\n• Location coordinates\n• Organized by task\n• Print-ready format';
    }

    if (lowerQuery.includes('share') || lowerQuery.includes('native') || lowerQuery.includes('email') || lowerQuery.includes('hand off')) {
      return 'Native OS Sharing:\n\nInstantly hand off documents to clients or contractors using your device\'s native email and sharing tools.\n\n**How to share:**\n1. Go to File > Share\n2. Choose sharing method (Email, Native share, Copy link)\n3. Select recipients\n4. Send\n\n**Supported Platforms:**\n• Windows: Outlook, Mail app, native share\n• Mac: Mail app, AirDrop, native share\n• Mobile: Native share to any app';
    }

    // ===== CORE PDF EDITING & ANNOTATION =====
    if (lowerQuery.includes('annotation') || lowerQuery.includes('draw') || lowerQuery.includes('tool') || lowerQuery.includes('text tool') || lowerQuery.includes('arrow')) {
      return 'Advanced Annotation Tools:\n\n**Text Annotations:**\n• Text (T key) - Add text anywhere\n• Text with Leader (Shift+T) - Text with arrow pointer\n• Edit existing PDF text directly\n\n**Drawing Tools:**\n• Line (L key) - Straight lines\n• Arrow (A key) - Arrows with heads\n• Rectangle (R key) - Rectangles and squares\n• Circle (O key) - Circles and ellipses\n• Cloud (C key) - Revision clouds\n• Freehand (F key) - Freehand drawing\n• Highlight (H key) - Highlight text/areas\n\n**Stamp Tools:**\n• Checkmark stamp - Quick approval\n• X mark stamp - Rejection mark\n\n**Other Tools:**\n• Eraser - Remove unwanted content\n• Cut & Overlay - Cut sections and move them\n• Strikethrough - Strike through text\n\n**Styling Options:**\n• Multiple fonts, custom colors, stroke width control, opacity adjustment\n\nCAD Alternative: Use command line (Ctrl+9) with L, C, REC, T, etc.';
    }

    if (lowerQuery.includes('edit text') || lowerQuery.includes('pdf text') || lowerQuery.includes('modify text')) {
      return 'PDF Text Editing:\n\nEdit existing PDF text directly or add new text with leader lines.\n\n**Edit Existing Text:**\n1. Select PDF Text Edit tool\n2. Click on text to edit\n3. Type new text\n4. Click outside to save\n\n**Add New Text:**\n1. Select Text tool (T key)\n2. Click where to place text\n3. Type your text\n4. Use toolbar to change font, size, color\n\n**Text with Leader:**\n1. Select Text with Leader (Shift+T)\n2. Click arrow head location\n3. Click arrow tail location\n4. Click text position\n5. Type text';
    }

    if (lowerQuery.includes('stamp') || lowerQuery.includes('checkmark') || lowerQuery.includes('approval') || lowerQuery.includes('x mark')) {
      return 'Stamp Tools:\n\nQuick approval stamps for fast document review.\n\n**Available Stamps:**\n• Checkmark (✓) - Approval stamp\n• X mark (✗) - Rejection stamp\n\n**How to use:**\n1. Select Stamp tool from toolbar\n2. Choose stamp type (Check or X)\n3. Click on document to place\n4. Stamp is placed at cursor location';
    }

    if (lowerQuery.includes('eraser') || lowerQuery.includes('remove') || lowerQuery.includes('delete content') || lowerQuery.includes('whiteout')) {
      return 'Eraser Tool:\n\nRemove unwanted content with precision using the eraser tool.\n\n**How to use:**\n1. Select Eraser tool\n2. Choose eraser type (Rectangle or Freehand)\n3. Click and drag to erase\n4. Content is covered with white\n\n**Eraser Types:**\n• Rectangle: Erase rectangular areas\n• Freehand: Erase by drawing';
    }

    if (lowerQuery.includes('cut') || lowerQuery.includes('overlay') || lowerQuery.includes('move section') || lowerQuery.includes('cut tool')) {
      return 'Cut & Overlay:\n\nCut out sections of the PDF and overlay them elsewhere.\n\n**How to use:**\n1. Select Cut tool (Ctrl+G)\n2. Choose cut mode (Rectangle or Polygon)\n3. Draw cut shape around content\n4. Content is copied to clipboard\n5. Click to paste at new location';
    }

    if (lowerQuery.includes('rotate annotation') || lowerQuery.includes('rotation') || lowerQuery.includes('rotate selection')) {
      return 'Rotation:\n\nRotate annotations and selections to any angle.\n\n**How to rotate:**\n1. Select annotation(s) to rotate\n2. Use one of these methods:\n   - Drag rotation handle (if available)\n   - Use CAD command: ROTATE (RO)\n   - Right-click > Rotate\n\n**CAD Rotation Command:**\n1. Type ROTATE or RO in command line\n2. Select objects to rotate\n3. Press Enter\n4. Click base point (center of rotation)\n5. Move mouse to preview or type angle\n6. Click to accept';
    }

    if (lowerQuery.includes('style') || lowerQuery.includes('color') || lowerQuery.includes('font') || lowerQuery.includes('stroke width') || lowerQuery.includes('opacity')) {
      return 'Custom Styling:\n\nCustomize the appearance of all annotations with multiple styling options.\n\n**Styling Options:**\n• Colors: Preset colors, custom color picker, transparency support\n• Fonts: Arial, Helvetica, Times New Roman, Courier New, Calibri, Verdana, and more\n• Stroke Width: Thin (1px), Medium (2-3px), Thick (4-6px), custom width\n• Opacity: 100% (fully opaque), 50% (semi-transparent), 10% (very transparent), custom opacity\n\n**How to apply:**\n1. Select annotation(s)\n2. Use toolbar style controls\n3. Or right-click > Properties';
    }

    // ===== PRECISION MEASUREMENT TOOLS =====
    if (lowerQuery.includes('calibration') || lowerQuery.includes('calibrate') || lowerQuery.includes('scale') || lowerQuery.includes('set scale')) {
      return 'Scale Calibration:\n\nSet custom scale for accurate measurements on your blueprints.\n\n**How to calibrate:**\n1. Select Calibrate tool (K key)\n2. Click first point of known distance\n3. Click second point of known distance\n4. Enter the actual distance and unit\n5. All measurements now use this scale\n\n**Example:**\n• Click two points 1 inch apart on drawing\n• Enter "1 inch" or "2.54 cm"\n• All measurements are now accurate\n\n**Units Supported:**\n• Inches (in), Feet (ft), Millimeters (mm), Centimeters (cm), Meters (m)\n\n**Per-Page Calibration:**\n• Set different scales for each page\n• Calibration is saved per page\n\nCAD Alternative: Type CAL or CALIBRATE in command line (Ctrl+9)';
    }

    if (lowerQuery.includes('distance measurement') || lowerQuery.includes('measure distance') || lowerQuery.includes('linear measurement')) {
      return 'Distance Measurement:\n\nMeasure straight-line distances between any two points.\n\n**How to measure:**\n1. Select Distance tool (DI key)\n2. Click first point\n3. Click second point\n4. Distance is displayed\n\n**Features:**\n• Real-time distance display\n• Angle measurement included\n• Snap to grid (if enabled)\n• Shift+click for orthogonal\n\nCAD Alternative: Type DI or DIST in command line (Ctrl+9)';
    }

    if (lowerQuery.includes('polyline measurement') || lowerQuery.includes('measure path') || lowerQuery.includes('complex path') || lowerQuery.includes('perimeter')) {
      return 'Polyline Measurement:\n\nMeasure along complex paths with up to 50 points.\n\n**How to measure:**\n1. Select Polyline tool (PL key)\n2. Click start point\n3. Continue clicking to add points\n4. Press Enter to finish\n5. Total length and segment distances shown\n\n**Features:**\n• Up to 50 points\n• Segment-by-segment distances\n• Total length\n• Shift+click for orthogonal\n\nCAD Alternative: Type PL or PLINE in command line (Ctrl+9)';
    }

    if (lowerQuery.includes('area calculation') || lowerQuery.includes('measure area') || lowerQuery.includes('room area')) {
      return 'Area Calculation:\n\nCalculate areas of any shape by clicking points around the perimeter.\n\n**How to measure area:**\n1. Select Area tool (Q key)\n2. Click points around shape perimeter\n3. Click near start point to close shape\n4. Area and perimeter are displayed\n\n**Features:**\n• Auto-close shape\n• Area in calibrated units\n• Perimeter included\n• Visual shape preview\n\nCAD Alternative: Type AA or AREA in command line (Ctrl+9)';
    }

    if (lowerQuery.includes('angle measurement') || lowerQuery.includes('measure angle') || lowerQuery.includes('angle between')) {
      return 'Angle Measurement:\n\nMeasure angles between two lines.\n\n**How to measure:**\n1. Select Angle tool\n2. Click first line endpoint\n3. Click vertex point\n4. Click second line endpoint\n5. Angle is displayed in degrees\n\n**Features:**\n• Angle in degrees\n• Visual arc display\n• Interior/exterior angles';
    }

    if (lowerQuery.includes('count tool') || lowerQuery.includes('count items') || lowerQuery.includes('automatic count')) {
      return 'Count Tool:\n\nCount items automatically by placing count markers.\n\n**How to use:**\n1. Select Count tool (N key)\n2. Click on items to count\n3. Each click adds a counter\n4. Total count displayed\n\n**Features:**\n• Sequential numbering\n• Custom labels\n• Color-coded counts\n• Export count list';
    }

    if (lowerQuery.includes('volume') || lowerQuery.includes('3d volume') || lowerQuery.includes('calculate volume')) {
      return 'Volume Calculation:\n\nCalculate 3D volumes from area measurements.\n\n**How to calculate:**\n1. Measure an area (using Area tool)\n2. Specify height/depth\n3. Volume is calculated automatically\n\n**Formula:**\nVolume = Area × Height';
    }

    // ===== AI-POWERED FEATURES =====
    if (lowerQuery.includes('ai annotation') || lowerQuery.includes('auto annotate') || lowerQuery.includes('ai analyze')) {
      return 'AI Annotation:\n\nLet AI analyze and annotate your PDFs automatically.\n\n**How to use:**\n1. Open AI Tools menu\n2. Select AI Annotation\n3. Choose analysis type (Element identification, Text extraction, Layout analysis)\n4. AI processes the document\n5. Annotations are added automatically\n\n**Features:**\n• Automatic element detection\n• Smart text recognition\n• Layout understanding\n• Intelligent annotation placement';
    }

    if (lowerQuery.includes('ai summary') || lowerQuery.includes('document summary') || lowerQuery.includes('summarize')) {
      return 'AI Document Summary:\n\nGet instant summaries of long documents using AI.\n\n**How to use:**\n1. Open AI Tools menu\n2. Select Document Summary\n3. AI analyzes the document\n4. Summary is generated\n\n**Summary Features:**\n• Key points extraction\n• Executive summary\n• Section summaries\n• Important highlights';
    }

    if (lowerQuery.includes('ai form fill') || lowerQuery.includes('auto fill') || lowerQuery.includes('smart form')) {
      return 'AI Form Filling:\n\nAuto-fill forms using AI-powered recognition.\n\n**How to use:**\n1. Open a PDF with form fields\n2. Enable AI Form Filling\n3. AI analyzes form structure\n4. Suggests fill values based on document context, previous entries, common patterns\n\n**Features:**\n• Field type recognition\n• Smart value suggestions\n• Auto-population\n• Validation checking';
    }

    if (lowerQuery.includes('ai chat') || lowerQuery.includes('chat with pdf') || lowerQuery.includes('ask pdf') || lowerQuery.includes('pdf assistant')) {
      return 'AI Chat Assistant:\n\nChat with your PDFs to get answers about content.\n\n**How to use:**\n1. Open AI Tools menu\n2. Select Chat with PDF\n3. Ask questions in natural language\n4. AI answers based on PDF content\n\n**Example Questions:**\n• "What is the total budget?"\n• "List all deadlines"\n• "What are the safety requirements?"\n• "Summarize section 3"\n\n**Features:**\n• Natural language queries\n• Context-aware answers\n• Source citation\n• Follow-up questions';
    }

    if (lowerQuery.includes('timeline') || lowerQuery.includes('schedule') || lowerQuery.includes('project timeline') || lowerQuery.includes('gantt')) {
      return 'AI Timeline Analysis:\n\nAnalyze project timelines and schedules using AI.\n\n**How to use:**\n1. Open a document with timeline/schedule\n2. Select AI Timeline Analysis\n3. AI extracts and analyzes timeline\n4. Timeline visualization is created\n\n**Analysis Features:**\n• Milestone identification\n• Critical path detection\n• Duration calculation\n• Dependency mapping';
    }

    if (lowerQuery.includes('engineering') || lowerQuery.includes('specifications') || lowerQuery.includes('parameters') || lowerQuery.includes('specs')) {
      return 'AI Engineering Parameters:\n\nExtract engineering specifications from documents.\n\n**How to use:**\n1. Open engineering document\n2. Select AI Engineering Parameters\n3. AI extracts specifications\n4. Parameters are organized by category\n\n**Extracted Parameters:**\n• Material specifications\n• Load requirements\n• Safety factors\n• Design criteria\n• Tolerances';
    }

    if (lowerQuery.includes('plan review') || lowerQuery.includes('compliance') || lowerQuery.includes('structural review') || lowerQuery.includes('code check')) {
      return 'AI Plan Review:\n\nAI-powered structural plan review and compliance checking.\n\n**How to use:**\n1. Open structural/engineering plan\n2. Select AI Plan Review\n3. AI analyzes the plan\n4. Review report is generated\n\n**Review Checks:**\n• Structural integrity\n• Code compliance\n• Safety requirements\n• Design standards\n• Best practices\n\n**Output:**\n• Pass/fail indicators\n• Issue locations\n• Recommendations\n• Code references';
    }

    if (lowerQuery.includes('address') || lowerQuery.includes('extract address') || lowerQuery.includes('location') || lowerQuery.includes('address scanning')) {
      return 'Address Scanning:\n\nExtract addresses from documents automatically.\n\n**How to use:**\n1. Open document with addresses\n2. Select Address Scanning\n3. AI scans for addresses\n4. Addresses are extracted and listed\n\n**Features:**\n• Address pattern recognition\n• Validation checking\n• Geocoding (optional)\n• Export to CSV';
    }

    if (lowerQuery.includes('element identification') || lowerQuery.includes('identify elements') || lowerQuery.includes('auto detect') || lowerQuery.includes('recognize')) {
      return 'Element Identification:\n\nAutomatically identify document elements using AI.\n\n**How to use:**\n1. Open document\n2. Select Element Identification\n3. AI analyzes document\n4. Elements are identified and labeled\n\n**Identified Elements:**\n• Text blocks, Images, Tables, Headers/footers, Drawings, Annotations';
    }

    if (lowerQuery.includes('inspection photo') || lowerQuery.includes('photo analysis') || lowerQuery.includes('analyze photo') || lowerQuery.includes('site photo')) {
      return 'Inspection Photo Analysis:\n\nAI analysis of inspection photos for defect detection.\n\n**How to use:**\n1. Upload inspection photo\n2. Select Photo Analysis\n3. AI analyzes the photo\n4. Defects/issues are identified\n\n**Analysis Features:**\n• Defect detection\n• Quality assessment\n• Issue classification\n• Severity rating';
    }

    // ===== CAD & BIM INTEGRATION =====
    if (lowerQuery.includes('bim capture') || lowerQuery.includes('bim element') || lowerQuery.includes('door') || lowerQuery.includes('wall') || lowerQuery.includes('supplier')) {
      return 'BIM Capture:\n\nCapture and tag BIM elements (doors, walls, suppliers, fire ratings) directly on your PDFs.\n\n**How to use:**\n1. Select BIM Capture tool (B key)\n2. Choose element type (Door, Wall, Supplier, Fire Rating)\n3. Click on element location\n4. Fill in element details\n5. Element is tagged and stored\n\n**Element Types:**\n• Doors (size, type, material)\n• Walls (thickness, material, fire rating)\n• Suppliers (name, contact, type)\n• Fire Ratings (rating, location)';
    }

    if (lowerQuery.includes('convert to cad') || lowerQuery.includes('dxf') || lowerQuery.includes('export cad') || lowerQuery.includes('cad export')) {
      return 'Convert to CAD:\n\nExport PDFs to DXF format for use in CAD software.\n\n**How to use:**\n1. Open PDF with vector content\n2. Go to File > Export to CAD\n3. Select DXF format\n4. Choose export options (All pages or specific pages, Include annotations, Layer organization)\n5. Click Export\n\n**Export Features:**\n• DXF format (AutoCAD compatible)\n• Vector preservation\n• Layer support\n• Scale retention';
    }

    if (lowerQuery.includes('cad geometry') || lowerQuery.includes('geometric calculation') || lowerQuery.includes('cad tools') || lowerQuery.includes('geometry tools')) {
      return 'CAD Geometry Tools:\n\nAdvanced geometric calculations and tools for precise drafting.\n\n**Available Tools:**\n• Trim - Cut lines at intersections\n• Extend - Extend lines to boundaries\n• Offset - Create parallel lines\n• Fillet - Round corners\n• Chamfer - Bevel corners\n• Join - Connect line segments\n• Explode - Break compound objects\n\n**How to use:**\nMost tools available via Command Line (Ctrl+9), Toolbar buttons, or Right-click context menu';
    }

    // ===== DOCUMENT MANAGEMENT =====
    if (lowerQuery.includes('multi-tab') || lowerQuery.includes('multiple pdfs') || lowerQuery.includes('tab') || lowerQuery.includes('switch document')) {
      return 'Multi-Tab Interface:\n\nWork on multiple PDFs simultaneously with tabbed interface.\n\n**How to use:**\n• Open new PDF: File > Open PDF (opens in new tab)\n• Switch tabs: Click tab headers\n• Close tab: Click X on tab\n• Reorder tabs: Drag tab to new position\n\n**Tab Features:**\n• Independent zoom/pan per tab\n• Separate annotations per document\n• Tab-specific bookmarks\n• Quick switching';
    }

    if (lowerQuery.includes('thumbnail') || lowerQuery.includes('page navigation') || lowerQuery.includes('page thumb') || lowerQuery.includes('visual navigation')) {
      return 'Page Thumbnails:\n\nVisual page navigation and management with thumbnail previews.\n\n**How to use:**\n• View thumbnails: Left Sidebar > Pages tab\n• Navigate: Click thumbnail to go to page\n• Select: Click to select page\n• Multi-select: Ctrl+click or Shift+click\n\n**Thumbnail Features:**\n• Visual page preview\n• Page numbers displayed\n• Selection indicators\n• Bookmark icons';
    }

    if (lowerQuery.includes('reorder') || lowerQuery.includes('reorder page') || lowerQuery.includes('drag drop') || lowerQuery.includes('move page')) {
      return 'Page Reordering:\n\nDrag and drop to reorder pages in your PDF.\n\n**How to reorder:**\n1. Go to Left Sidebar > Pages tab\n2. Drag page thumbnail to new position\n3. Drop to reorder\n\n**Multi-page Reorder:**\n1. Select multiple pages (Ctrl+click or Shift+click)\n2. Drag selection to new position\n3. All selected pages move together';
    }

    if (lowerQuery.includes('insert page') || lowerQuery.includes('add page') || lowerQuery.includes('insert pdf') || lowerQuery.includes('append')) {
      return 'Page Insertion:\n\nInsert pages from other PDFs or add blank pages.\n\n**Insert from PDF:**\n1. Right-click page thumbnail\n2. Select "Insert PDF Here"\n3. Choose PDF file\n4. Pages are inserted after selected page\n\n**Insert Blank Page:**\n1. Right-click page thumbnail\n2. Select "Insert Blank Page"\n3. Choose page size (Letter, 11x17, A4, Legal)\n4. Blank page is inserted';
    }

    if (lowerQuery.includes('blank page') || lowerQuery.includes('create page') || lowerQuery.includes('new page') || lowerQuery.includes('add blank')) {
      return 'Blank Page Creation:\n\nAdd blank pages anywhere in your document.\n\n**How to create:**\n1. Right-click page thumbnail\n2. Select "Insert Blank Page"\n3. Choose page size (Letter, 11x17, A4, Legal)\n4. Blank page is inserted';
    }

    if (lowerQuery.includes('delete page') || lowerQuery.includes('remove page') || lowerQuery.includes('delete pages') || lowerQuery.includes('remove pages')) {
      return 'Page Deletion:\n\nRemove unwanted pages from your PDF.\n\n**How to delete:**\n1. Select page(s) to delete (Single: Click thumbnail, Multiple: Ctrl+click or Shift+click)\n2. Click Delete button or press Delete key\n3. Confirm deletion\n\n**Delete Options:**\n• Delete selected pages\n• Delete single page (right-click)\n• Undo available (Ctrl+Z)';
    }

    if (lowerQuery.includes('bookmark') || lowerQuery.includes('save page') || lowerQuery.includes('mark page') || lowerQuery.includes('ctrl+b')) {
      return 'Bookmarks:\n\nSave and organize bookmarks for quick page navigation.\n\n**How to bookmark:**\n• Press Ctrl+B on current page\n• Or right-click thumbnail > Add Bookmark\n\n**Managing Bookmarks:**\n• View: Left Sidebar > Bookmarks tab\n• Rename: Double-click bookmark name\n• Delete: Click X on bookmark\n• Navigate: Click bookmark to go to page';
    }

    if (lowerQuery.includes('recent files') || lowerQuery.includes('open recent') || lowerQuery.includes('file history') || lowerQuery.includes('recent')) {
      return 'Recent Files:\n\nQuick access to recently opened files.\n\n**How to access:**\n• File > Open Recent\n• Shows list of recently opened files\n• Click to open\n\n**Features:**\n• File names displayed\n• File paths shown\n• Clear history option\n• Persistent across sessions';
    }

    if (lowerQuery.includes('split view') || lowerQuery.includes('side by side') || lowerQuery.includes('two pages') || lowerQuery.includes('compare')) {
      return 'Split View:\n\nView two pages side-by-side for comparison.\n\n**How to enable:**\n1. Go to View menu\n2. Select Split View\n3. Choose split type (Horizontal or Vertical)\n\n**Split View Features:**\n• Independent zoom per pane\n• Independent pan per pane\n• Synchronized scrolling (optional)\n• Different pages visible';
    }

    if (lowerQuery.includes('search') || lowerQuery.includes('find') || lowerQuery.includes('find text') || lowerQuery.includes('search text')) {
      return 'Search & Replace:\n\nFull-text search with find and replace functionality.\n\n**How to search:**\n1. Go to Left Sidebar > Find tab\n2. Type search query\n3. Results appear in list\n4. Click result to navigate\n\n**Search Features:**\n• Search PDF text layer\n• Search OCR results (if available)\n• Search all open documents\n• Context preview\n\n**Navigation:**\n• Enter: Next match\n• Shift+Enter: Previous match\n• Click result: Go to location\n\n**Replace:**\n• Enable Replace toggle\n• Enter replacement text\n• Replace single or all\n• Adds annotation markups';
    }

    if (lowerQuery.includes('drag drop') || lowerQuery.includes('drag and drop') || lowerQuery.includes('open file') || lowerQuery.includes('drop file')) {
      return 'Drag & Drop:\n\nOpen files by dragging them into the application.\n\n**How to use:**\n1. Drag PDF file from file explorer\n2. Drop onto the application window\n3. File opens automatically\n\n**Supported Actions:**\n• Open new PDF (drops into new tab)\n• Insert pages (drops onto sidebar)\n• Add images (drops onto canvas)';
    }

    // ===== SIGNATURES & SECURITY =====
    if (lowerQuery.includes('signature') || lowerQuery.includes('sign') || lowerQuery.includes('digital signature') || lowerQuery.includes('legally binding')) {
      return 'Digital Signatures:\n\nAdd legally-binding digital signatures to your PDFs.\n\n**How to add signature:**\n1. Select Signature tool\n2. Choose signature type (Draw, Type, Upload)\n3. Place signature on document\n4. Signature is embedded\n\n**Signature Types:**\n• Draw: Use mouse/touch to draw\n• Type: Type name with font styling\n• Upload: Use signature image file\n\n**Features:**\n• Legally binding\n• Timestamped\n• Encrypted\n• Tamper-evident';
    }

    if (lowerQuery.includes('signature pad') || lowerQuery.includes('draw signature') || lowerQuery.includes('touch signature') || lowerQuery.includes('handwritten')) {
      return 'Signature Pad:\n\nDraw signatures with touch or mouse using the signature pad.\n\n**How to use:**\n1. Select Signature tool\n2. Choose "Draw Signature"\n3. Signature pad appears\n4. Draw signature with mouse or touch\n5. Click "Apply" to place\n\n**Signature Pad Features:**\n• Smooth drawing\n• Pressure sensitivity (touch)\n• Undo stroke\n• Clear and redraw';
    }

    if (lowerQuery.includes('watermark') || lowerQuery.includes('add watermark') || lowerQuery.includes('custom watermark') || lowerQuery.includes('draft')) {
      return 'Watermarks:\n\nAdd custom watermarks to documents for security or branding.\n\n**How to add watermark:**\n1. Go to Tools > Watermarks\n2. Click "Add Watermark"\n3. Configure (Text content, Position, Opacity, Font size, Color, Pages)\n4. Click Apply\n\n**Common Watermarks:**\n• NOT FOR CONSTRUCTION, APPROVED, DRAFT, CONFIDENTIAL, WORK IN PROGRESS\n\n**Watermark Options:**\n• Preset watermarks (quick add)\n• Custom text\n• Multiple watermarks\n• Per-page application';
    }

    if (lowerQuery.includes('password') || lowerQuery.includes('protect') || lowerQuery.includes('encrypt') || lowerQuery.includes('secure pdf')) {
      return 'Password Protection:\n\nSecure PDFs with password protection.\n\n**How to protect:**\n1. Go to File > Protect\n2. Enter password\n3. Confirm password\n4. Choose protection level (Open password, Edit password, Both)\n5. Click Apply\n\n**Protection Types:**\n• Open Password: Required to open PDF\n• Edit Password: Required to edit/annotate\n• Both: Full protection\n\n**Features:**\n• 256-bit encryption\n• Secure password storage\n• Optional password hint';
    }

    // ===== EXPORT & REPORTING =====
    if (lowerQuery.includes('export pdf') || lowerQuery.includes('save pdf') || lowerQuery.includes('flatten') || lowerQuery.includes('burn in')) {
      return 'Export Annotated PDFs:\n\nSave your PDF with all annotations flattened (burned in).\n\n**How to export:**\n1. Go to File > Export PDF\n2. Choose export options (Include annotations, Include measurements, Page range)\n3. Click Export\n4. Choose save location\n\n**Export Features:**\n• Annotations flattened into PDF\n• Measurements included\n• Vector quality preserved\n• Text remains selectable';
    }

    if (lowerQuery.includes('custom report') || lowerQuery.includes('generate report') || lowerQuery.includes('inspection report') || lowerQuery.includes('project report')) {
      return 'Custom Reports:\n\nGenerate inspection and project reports with customizable content.\n\n**How to generate:**\n1. Go to File > Generate Report\n2. Select report type (Inspection Report, Project Report, Summary Report)\n3. Choose content (Tasks, Photos, Measurements, Annotations)\n4. Customize (Company branding, Header/footer, Date range)\n5. Click Generate\n\n**Report Formats:**\n• Microsoft Word (.docx)\n• PDF\n• HTML';
    }

    if (lowerQuery.includes('header') || lowerQuery.includes('footer') || lowerQuery.includes('header footer') || lowerQuery.includes('page header')) {
      return 'Header/Footer Editing:\n\nAdd custom headers and footers to your documents.\n\n**How to add:**\n1. Go to Tools > Headers/Footers\n2. Configure header (Text content, Font and size, Position, Page numbers)\n3. Configure footer (same options)\n4. Apply to pages (all, current, custom)\n5. Click Apply\n\n**Header/Footer Options:**\n• Custom text\n• Page numbers\n• Date/time\n• File name\n• Multiple lines';
    }

    if (lowerQuery.includes('export format') || lowerQuery.includes('file format') || lowerQuery.includes('save as') || lowerQuery.includes('export options')) {
      return 'Multiple Export Formats:\n\nExport your documents in various formats for different needs.\n\n**Available Formats:**\n• PDF (with or without annotations)\n• Microsoft Word (.docx)\n• PowerPoint (.pptx)\n• HTML (web format)\n• Images (PNG, JPG)\n• DXF (CAD format)\n\n**How to export:**\n1. Go to File > Export\n2. Choose format\n3. Select options (Page range, Include annotations, Quality settings)\n4. Click Export';
    }

    // ===== FORM HANDLING =====
    if (lowerQuery.includes('form edit') || lowerQuery.includes('form mode') || lowerQuery.includes('edit form') || lowerQuery.includes('pdf form')) {
      return 'Form Edit Mode:\n\nSpecialized mode for editing PDF forms with intelligent field detection.\n\n**How to enable:**\n1. Go to Tools > Form Edit Mode\n2. Form fields are detected automatically\n3. Edit fields directly on document\n\n**Form Field Types:**\n• Text fields, Checkboxes, Radio buttons, Dropdown menus, Signatures\n\n**Editing Features:**\n• Direct text editing\n• Checkbox toggling\n• Dropdown selection\n• Field validation';
    }

    if (lowerQuery.includes('smart form') || lowerQuery.includes('ai form') || lowerQuery.includes('auto fill') || lowerQuery.includes('intelligent form')) {
      return 'Smart Form Filling:\n\nAI-assisted form completion with intelligent field recognition.\n\n**How it works:**\n1. Enable Smart Form Filling\n2. AI analyzes form structure\n3. Fields are identified and categorized\n4. AI suggests values based on document context, common patterns, previous entries\n\n**Features:**\n• Field type recognition\n• Smart value suggestions\n• Auto-population\n• Data validation';
    }

    // ===== IMAGE PROCESSING =====
    if (lowerQuery.includes('image to pdf') || lowerQuery.includes('convert image') || lowerQuery.includes('jpg to pdf') || lowerQuery.includes('png to pdf')) {
      return 'Image to PDF:\n\nConvert images (JPG, PNG, etc.) to PDF format.\n\n**How to convert:**\n1. Go to File > Import Images\n2. Select images (multiple supported)\n3. Choose options (Page size, Orientation, Margins)\n4. Click Convert\n5. PDF is created\n\n**Supported Formats:**\n• JPG/JPEG, PNG, GIF, BMP, TIFF';
    }

    if (lowerQuery.includes('batch image') || lowerQuery.includes('multiple images') || lowerQuery.includes('convert multiple') || lowerQuery.includes('batch convert')) {
      return 'Batch Image Conversion:\n\nConvert multiple images at once for efficiency.\n\n**How to use:**\n1. Go to File > Batch Import Images\n2. Select multiple images\n3. Choose conversion options (Output format, Page size, Orientation, Sorting)\n4. Click Convert\n\n**Batch Features:**\n• Process multiple files\n• Progress indicator\n• Error handling\n• Skip/retry options';
    }

    if (lowerQuery.includes('image color') || lowerQuery.includes('color editor') || lowerQuery.includes('adjust color') || lowerQuery.includes('image edit')) {
      return 'Image Color Editor:\n\nAdjust image colors and properties for inserted images.\n\n**How to use:**\n1. Select inserted image\n2. Right-click > Edit Image\n3. Adjust properties (Brightness, Contrast, Saturation, Hue, Exposure)\n4. Click Apply\n\n**Editing Options:**\n• Real-time preview\n• Reset to original\n• Fine-tune controls\n• Preset filters';
    }

    if (lowerQuery.includes('insert image') || lowerQuery.includes('add image') || lowerQuery.includes('paste image') || lowerQuery.includes('image insertion')) {
      return 'Image Insertion:\n\nInsert images into PDF pages.\n\n**How to insert:**\n1. Copy image (Ctrl+C)\n2. Paste into PDF (Ctrl+V)\n3. Or drag image file onto canvas\n4. Image is placed at cursor\n\n**Image Features:**\n• Resize with handles\n• Move by dragging\n• Rotate with rotation handle\n• Edit colors (right-click)\n\n**Supported Formats:**\n• JPG/JPEG, PNG, GIF, BMP, TIFF';
    }

    // ===== PLATFORM & PERFORMANCE =====
    if (lowerQuery.includes('desktop') || lowerQuery.includes('native app') || lowerQuery.includes('windows') || lowerQuery.includes('mac') || lowerQuery.includes('linux')) {
      return 'Desktop Application:\n\nNative desktop application available for Windows, Mac, and Linux.\n\n**Features:**\n• Native performance\n• System integration\n• File association\n• Offline capability\n• Auto-updates\n\n**Installation:**\n• Download from website\n• Run installer\n• Launch from desktop\n• Pin to taskbar/dock';
    }

    if (lowerQuery.includes('web app') || lowerQuery.includes('browser') || lowerQuery.includes('online') || lowerQuery.includes('no install')) {
      return 'Web Application:\n\nAccess from any browser without installation.\n\n**Features:**\n• No installation required\n• Cross-platform compatibility\n• Automatic updates\n• Cloud sync (optional)\n• Share via link\n\n**Access:**\n• Go to website URL\n• Works in modern browsers (Chrome, Firefox, Safari, Edge)';
    }

    if (lowerQuery.includes('pwa') || lowerQuery.includes('progressive web app') || lowerQuery.includes('install') || lowerQuery.includes('offline app')) {
      return 'PWA Support:\n\nInstall as a progressive web app for offline use.\n\n**How to install:**\n1. Open in browser\n2. Click install icon in address bar\n3. Confirm installation\n4. App appears in applications\n\n**PWA Features:**\n• Works offline\n• Desktop icon\n• Full-screen mode\n• Auto-updates\n• Native-like experience';
    }

    if (lowerQuery.includes('offline mode') || lowerQuery.includes('work offline') || lowerQuery.includes('no internet') || lowerQuery.includes('disconnected')) {
      return 'Offline Mode:\n\nWork without internet connection.\n\n**How it works:**\n• All features work offline\n• Data stored locally\n• Syncs when connection available\n• No functionality loss\n\n**Offline Features:**\n• PDF viewing/editing\n• All annotation tools\n• CAD commands\n• Measurements\n• Form editing';
    }

    if (lowerQuery.includes('keyboard shortcut') || lowerQuery.includes('hotkey') || lowerQuery.includes('shortcut') || lowerQuery.includes('key')) {
      return 'Keyboard Shortcuts:\n\nProfessional keyboard shortcuts for power users.\n\n**Common Shortcuts:**\n• Ctrl+S - Save\n• Ctrl+Z - Undo\n• Ctrl+Y - Redo\n• Ctrl+9 - Command Line\n• Ctrl+B - Bookmark\n• Space - Pan mode\n• Delete - Delete selected\n• Escape - Cancel/Exit tool\n\n**Tool Shortcuts:**\n• L - Line, C - Circle, R - Rectangle, T - Text, A - Arrow\n• F - Freehand, H - Highlight, K - Calibrate, Q - Area\n• DI - Distance, B - BIM Capture, N - Count\n\n**Navigation:**\n• Page Up/Down - Previous/Next page\n• Home - First page, End - Last page\n• Ctrl+F - Find';
    }

    if (lowerQuery.includes('undo') || lowerQuery.includes('redo') || lowerQuery.includes('history') || lowerQuery.includes('revert')) {
      return 'Undo/Redo:\n\nFull history with unlimited undo/redo capability.\n\n**How to use:**\n• Undo: Ctrl+Z or Edit > Undo\n• Redo: Ctrl+Y or Edit > Redo\n• View history: Edit > History\n\n**History Features:**\n• Unlimited undo steps\n• Action descriptions\n• History navigation\n• Selective undo\n\n**Tracked Actions:**\n• All annotations, Page operations, Style changes, Measurements, Form edits';
    }

    if (lowerQuery.includes('responsive') || lowerQuery.includes('mobile') || lowerQuery.includes('tablet') || lowerQuery.includes('touch')) {
      return 'Responsive Design:\n\nWorks on desktop, tablet, and mobile devices.\n\n**Device Support:**\n• Desktop (Windows, Mac, Linux)\n• Tablet (iPad, Android tablets)\n• Mobile (iPhone, Android phones)\n\n**Responsive Features:**\n• Adaptive UI layout\n• Touch-optimized controls\n• Gesture support\n• Screen size adaptation\n\n**Mobile Features:**\n• Touch gestures\n• On-screen controls\n• Compact mode\n• Performance optimized';
    }

    // ===== USER EXPERIENCE =====
    if (lowerQuery.includes('quick start') || lowerQuery.includes('tour') || lowerQuery.includes('onboarding') || lowerQuery.includes('tutorial')) {
      return 'Quick Start Tour:\n\nInteractive onboarding for new users.\n\n**How to start:**\n• First-time users see tour automatically\n• Or go to Help > Quick Start Tour\n\n**Tour Covers:**\n• Interface overview\n• Tool introduction\n• Basic workflows\n• Key features\n• Tips and tricks\n\n**Tour Features:**\n• Interactive highlights\n• Step-by-step guidance\n• Skip anytime\n• Replay anytime';
    }

    if (lowerQuery.includes('help chatbox') || lowerQuery.includes('support') || lowerQuery.includes('assistant') || lowerQuery.includes('this chat')) {
      return 'Help Chatbox:\n\nBuilt-in help and support assistant.\n\n**How to access:**\n• Click help icon (bottom-right)\n• Or press F1\n\n**Chatbox Features:**\n• AI-powered responses\n• Feature explanations\n• Step-by-step guidance\n• Ticket submission\n\n**What I can help with:**\n• Feature explanations\n• How-to questions\n• Troubleshooting\n• Best practices\n• Workflow suggestions\n\n**Ticket System:**\n• Report bugs\n• Request features\n• Provide feedback\n• Track status';
    }

    if (lowerQuery.includes('dark mode') || lowerQuery.includes('theme') || lowerQuery.includes('ui theme') || lowerQuery.includes('eye-friendly')) {
      return 'Dark Mode UI:\n\nModern, eye-friendly dark interface for reduced eye strain.\n\n**How to enable:**\n• Settings > Appearance > Dark Mode\n• Or toggle in toolbar\n\n**Dark Mode Benefits:**\n• Reduced eye strain\n• Better for low-light environments\n• Professional appearance\n• Improved focus';
    }

    if (lowerQuery.includes('customizable') || lowerQuery.includes('customize interface') || lowerQuery.includes('toolbar') || lowerQuery.includes('sidebar')) {
      return 'Customizable Interface:\n\nAdjustable toolbars and sidebars for your workflow.\n\n**Customization Options:**\n\n**Toolbars:**\n• Show/hide toolbars\n• Rearrange tools\n• Custom tool sets\n• Toolbar position\n\n**Sidebars:**\n• Resize width\n• Collapse/expand\n• Position (left/right)\n• Tab selection\n\n**Layout:**\n• Full screen mode\n• Split view\n• Panel arrangement\n• Save layouts';
    }

    if (lowerQuery.includes('zoom control') || lowerQuery.includes('zoom') || lowerQuery.includes('pan') || lowerQuery.includes('navigation')) {
      return 'Zoom Controls:\n\nSmooth zooming and pan controls for precise navigation.\n\n**Zoom Methods:**\n• Mouse wheel - Zoom in/out\n• Zoom rectangle - Precise zoom\n• Fit to screen - Fit page\n• Zoom percentage - Exact zoom\n• Pinch-to-zoom (touch)\n\n**Pan Methods:**\n• Space + drag - Pan\n• Middle mouse button - Pan\n• Pan tool - Click and drag\n• Arrow keys - Pan\n\n**Zoom Options:**\n• 10% - 500% range\n• Smooth transitions\n• Center on cursor\n• Fit to width/height';
    }

    // ===== COLLABORATION & SECURITY =====
    if (lowerQuery.includes('collaboration') || lowerQuery.includes('real-time') || lowerQuery.includes('multi-user') || lowerQuery.includes('teamwork')) {
      return 'Real-Time Collaboration:\n\nMultiple users can work on the same document simultaneously.\n\n**How to collaborate:**\n1. Enable Cloud Sync in Settings\n2. Share document via link\n3. Invite team members\n4. See changes in real-time\n\n**Collaboration Features:**\n• Live presence indicators\n• Real-time updates\n• Conflict resolution\n• Change tracking';
    }

    if (lowerQuery.includes('presence') || lowerQuery.includes('live presence') || lowerQuery.includes('who is viewing') || lowerQuery.includes('cursor')) {
      return 'Live Presence Indicators:\n\nSee who else is viewing or editing the document.\n\n**What you see:**\n• User names/avatars\n• Online status\n• Cursor positions\n• Selection highlights\n\n**Presence Features:**\n• Real-time updates\n• User identification\n• Activity indicators\n• Away status detection';
    }

    if (lowerQuery.includes('document sharing') || lowerQuery.includes('share link') || lowerQuery.includes('share document') || lowerQuery.includes('invite')) {
      return 'Document Sharing:\n\nShare documents via secure URL links.\n\n**How to share:**\n1. Go to File > Share\n2. Generate share link\n3. Set permissions (View only, Edit access, Comment only)\n4. Copy link\n5. Send to recipients\n\n**Sharing Features:**\n• Secure links\n• Permission control\n• Expiration dates\n• Access logging';
    }

    if (lowerQuery.includes('project management') || lowerQuery.includes('organize documents') || lowerQuery.includes('project') || lowerQuery.includes('folder')) {
      return 'Project Management:\n\nOrganize documents into projects for better organization.\n\n**How to organize:**\n1. Go to Projects panel\n2. Create new project\n3. Add documents to project\n4. Organize with folders\n\n**Project Features:**\n• Project folders\n• Document tagging\n• Project settings\n• Team assignment';
    }

    if (lowerQuery.includes('cloud sync') || lowerQuery.includes('sync') || lowerQuery.includes('backup') || lowerQuery.includes('across devices')) {
      return 'Cloud Sync:\n\nAutomatic cloud synchronization across devices.\n\n**How to enable:**\n1. Go to Settings > Cloud Sync\n2. Sign in to account\n3. Enable sync\n4. Choose what to sync\n\n**Sync Features:**\n• Automatic synchronization\n• Cross-device access\n• Conflict resolution\n• Version history\n\n**What syncs:**\n• Annotations, Measurements, Bookmarks, Calibrations, Form data';
    }

    if (lowerQuery.includes('client-side privacy') || lowerQuery.includes('local only') || lowerQuery.includes('privacy') || lowerQuery.includes('confidential')) {
      return 'Client-Side Privacy:\n\nFor local operations, your highly confidential blueprints never touch our servers. They remain securely vaulted on your local machine.\n\n**Privacy Features:**\n• All processing happens locally\n• No server uploads (unless cloud sync enabled)\n• Data stays on your device\n• No telemetry for sensitive data\n\n**When data stays local:**\n• PDF viewing/editing\n• Annotations\n• Measurements\n• CAD operations\n• Form editing\n\n**When data goes to cloud:**\n• Only when Cloud Sync is enabled\n• Only to your Firebase project\n• Encrypted in transit\n• You control access';
    }

    // ===== NEW CAD FEATURES =====
    if (lowerQuery.includes('markups only') || lowerQuery.includes('markups-only') || lowerQuery.includes('instant dxf') || lowerQuery.includes('export annotations')) {
      return 'Markups-Only CAD Export:\n\nInstant client-side DXF export of your annotations without cloud processing.\n\n**How to use:**\n1. Click "Export to CAD" button\n2. Select "Export My Markups Only" mode (green button with PenTool icon)\n3. Adjust Scale Factor if needed (default 1.0 = raw pixels, use 0.1 or 0.05 for engineering units)\n4. Click "Generate" to instantly download DXF file\n5. File named: Markups-page-X.dxf\n\n**Features:**\n• Empty state check (won\'t export if no annotations)\n• Freehand drawings treated as unified polylines\n• Scale factor applied for AutoCAD compatibility\n• Supports: lines, arrows, freehand, circles, rectangles, measurements\n• No cloud processing - runs entirely in browser';
    }

    if (lowerQuery.includes('boolean estimator') || lowerQuery.includes('material takeoff') || lowerQuery.includes('net area') || lowerQuery.includes('subtract area')) {
      return 'Boolean Estimator (Material Takeoff):\n\nCalculate net square footage by subtracting cutouts (columns, openings) from a base perimeter.\n\n**How to use:**\n1. Draw or select rectangle shapes on canvas\n2. Select primary room perimeter (first shape)\n3. Hold Shift+Click to select additional cutout shapes (columns, openings)\n4. Estimating Panel appears automatically in Right Sidebar\n5. Click "Calculate Net Area" button\n6. View result in raw pixels (multiply by calibrated scale factor for real-world SQFT)\n\n**Features:**\n• Only appears when shapes are selected\n• Requires at least 2 shapes (1 base + 1 cutout)\n• Uses Maker.js boolean subtraction for accuracy\n• Shows warning if insufficient shapes selected\n• Perfect for contractor material takeoffs';
    }

    if (lowerQuery.includes('smart ortho') || lowerQuery.includes('ortho trace') || lowerQuery.includes('snap to cad') || lowerQuery.includes('magnet') || lowerQuery.includes('straighten lines')) {
      return 'Smart Ortho Trace (Snap-to-CAD):\n\nAutomatically straightens hand-drawn lines to perfect horizontal/vertical angles when close to 90 degrees.\n\n**How to use:**\n1. Look for Magnet icon in toolbar (next to Form Edit Mode)\n2. Toggle is enabled by default (highlighted in blue)\n3. Draw lines, arrows, rectangles, or polylines normally\n4. Lines within 15° of horizontal/vertical automatically snap to perfect 90°\n5. Click Magnet icon to toggle off for freehand diagonal lines\n\n**Features:**\n• Applies to: line, arrow, freehand, rectangle, measure-polyline, measure-perimeter\n• 15-degree tolerance for snapping\n• Intentionally diagonal lines left unchanged\n• State persists across session (default: enabled)\n• Desktop CAD precision in the browser';
    }

    return 'I can help you with BluePrint PDF Editor features including:\n\n**⚡ Performance & Core Engine:**\n• Zero-Latency Autosave (Ctrl+S)\n• Browser-Based Processing (50MB+ files)\n• Offline-First Reliability\n\n**📐 Precision Drafting & CAD Tools:**\n• CAD Command Line (Ctrl+9) - AutoCAD-style commands\n• New CAD tools: COPY, OFFSET, FENCE_TRIM, HATCH, OSNAP (F3), ROTATE\n• Measurement tools (distance, area, perimeter, polyline, angle)\n• Drawing annotations\n• Calibration and scaling\n• Markups-Only CAD Export (instant DXF)\n• Boolean Estimator (material takeoff)\n• Smart Ortho Trace (snap-to-CAD)\n\n**☁️ Enterprise Cloud Processing:**\n• True Data-Level Redaction (CLOUD:REDACT)\n• Intelligent Compression (CLOUD:COMPRESS)\n• OCR (CLOUD:OCR)\n• Format Conversions (CLOUD:TO-WORD, CLOUD:TO-PPT, CLOUD:TO-HTML)\n\n**📋 Field Inspection & Task Management:**\n• Geolocated Task Pins (B key)\n• Integrated Photo Capture\n• Smart Dashboards (filter by assignee, category, status)\n\n**📑 Automated Reporting:**\n• One-Click Executive Reports\n• Formatted Photo Grids\n• Native OS Sharing\n\n**Core PDF Editing & Annotation:**\n• Advanced Annotation Tools (text, arrows, shapes, highlight)\n• PDF Text Editing\n• Stamp Tools\n• Eraser Tool\n• Cut & Overlay\n• Rotation\n• Custom Styling\n\n**Precision Measurement Tools:**\n• Scale Calibration (K key)\n• Distance, Polyline, Area, Angle, Count, Volume measurements\n\n**AI-Powered Features:**\n• AI Annotation, Document Summary, Form Filling, Chat Assistant\n• Timeline Analysis, Engineering Parameters, Plan Review\n• Address Scanning, Element Identification, Photo Analysis\n\n**CAD & BIM Integration:**\n• BIM Capture (doors, walls, suppliers, fire ratings)\n• Convert to CAD (DXF export)\n• CAD Geometry Tools\n\n**Document Management:**\n• Multi-Tab Interface, Page Thumbnails, Reordering, Insertion/Deletion\n• Bookmarks, Recent Files, Split View, Search & Replace\n\n**Signatures & Security:**\n• Digital Signatures, Signature Pad, Watermarks, Password Protection\n\n**Export & Reporting:**\n• Export Annotated PDFs, Custom Reports, Header/Footer Editing\n• Multiple Export Formats (PDF, Word, PowerPoint, HTML, Images, DXF)\n\n**Form Handling:**\n• Form Edit Mode, Smart Form Filling\n\n**Image Processing:**\n• Image to PDF, Batch Conversion, Color Editor, Image Insertion\n\n**Platform & Performance:**\n• Desktop Application, Web Application, PWA Support, Offline Mode\n• Keyboard Shortcuts, Undo/Redo, Responsive Design\n\n**User Experience:**\n• Quick Start Tour, Help Chatbox, Dark Mode UI, Customizable Interface\n• Zoom Controls\n\n**Collaboration & Security:**\n• Real-Time Collaboration, Live Presence Indicators, Document Sharing\n• Project Management, Cloud Sync, Client-Side Privacy\n\nType "command" or "cad" for a full list of CAD commands, or ask about any specific feature. Click "Raise Ticket" to report an issue or request a feature.';
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
