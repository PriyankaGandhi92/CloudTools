import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { X, ArrowRight, Sparkles, Briefcase, Building2, Users, FileCheck, Layout } from 'lucide-react';

type UserProfile = 'lawyer' | 'civil' | 'bim' | 'collaboration' | 'basic';

interface TourStep {
  target: string;
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: Record<UserProfile, TourStep[]> = {
  lawyer: [
    { target: '[data-tour="open-pdf"]', title: 'Open PDF', description: 'Upload or open a PDF document to begin reviewing contracts and legal documents.', position: 'bottom' },
    { target: '[data-tour="text-tool"]', title: 'Text Annotation', description: 'Add text notes and comments directly on the document for contract redlining.', position: 'bottom' },
    { target: '[data-tour="highlight"]', title: 'Highlight Tool', description: 'Highlight important clauses, terms, and sections for quick reference.', position: 'bottom' },
    { target: '[data-tour="annotation-summary"]', title: 'Annotation Summary', description: 'View all your annotations in a searchable list, sorted by time or content.', position: 'top' },
    { target: '[data-tour="export-csv"]', title: 'Export Summary', description: 'Export your annotations as CSV for sharing with colleagues or clients.', position: 'top' },
  ],
  civil: [
    { target: '[data-tour="open-pdf"]', title: 'Open PDF', description: 'Upload engineering plans, blueprints, or architectural drawings.', position: 'bottom' },
    { target: '[data-tour="measure-distance"]', title: 'Distance Measurement', description: 'Measure distances between points with automatic calibration.', position: 'bottom' },
    { target: '[data-tour="measure-area"]', title: 'Area Measurement', description: 'Calculate areas of rooms, spaces, or irregular shapes.', position: 'bottom' },
    { target: '[data-tour="calibrate"]', title: 'Calibration', description: 'Set the scale by measuring a known distance on the drawing.', position: 'bottom' },
    { target: '[data-tour="ai-tools"]', title: 'AI Plan Review', description: 'Use AI to automatically detect structural issues and code violations.', position: 'bottom' },
  ],
  bim: [
    { target: '[data-tour="open-pdf"]', title: 'Open PDF', description: 'Upload building plans for BIM element inspection.', position: 'bottom' },
    { target: '[data-tour="bim-capture"]', title: 'BIM Inspection', description: 'Capture building elements (doors, walls, fire ratings) with parametric data.', position: 'bottom' },
    { target: '[data-tour="identify-elements"]', title: 'Identify Elements', description: 'Use AI to automatically detect walls, rooms, ducts, and other building elements.', position: 'bottom' },
    { target: '[data-tour="pin"]', title: 'Inspection Pin', description: 'Add location pins with photos and AI-powered analysis.', position: 'bottom' },
    { target: '[data-tour="export-zip"]', title: 'Export Inspection Data', description: 'Export all BIM data and inspection photos as a ZIP package.', position: 'top' },
  ],
  collaboration: [
    { target: '[data-tour="open-pdf"]', title: 'Open PDF', description: 'Upload a document to start collaborating with your team.', position: 'bottom' },
    { target: '[data-tour="share"]', title: 'Share Document', description: 'Generate a shareable link to collaborate in real-time with team members.', position: 'bottom' },
    { target: '[data-tour="annotation-summary"]', title: 'Annotation Summary', description: 'View and search all team annotations in one place.', position: 'top' },
    { target: '[data-tour="ai-chat"]', title: 'AI Chat', description: 'Ask questions about the document and get instant AI-powered answers.', position: 'bottom' },
    { target: '[data-tour="projects"]', title: 'Project Manager', description: 'Organize documents and track review progress across projects.', position: 'bottom' },
  ],
  basic: [
    { target: '[data-tour="open-pdf"]', title: 'Open PDF', description: 'Upload any PDF document to get started.', position: 'bottom' },
    { target: '[data-tour="text-tool"]', title: 'Text Tool', description: 'Add text notes anywhere on the document.', position: 'bottom' },
    { target: '[data-tour="highlight"]', title: 'Highlight Tool', description: 'Highlight important sections with the highlighter.', position: 'bottom' },
    { target: '[data-tour="draw-tools"]', title: 'Drawing Tools', description: 'Use lines, rectangles, circles, and freehand to mark up the document.', position: 'bottom' },
    { target: '[data-tour="export-pdf"]', title: 'Export PDF', description: 'Save your annotated document as a PDF.', position: 'top' },
  ],
};

interface QuickStartTourProps {
  userProfile: UserProfile;
  onClose: () => void;
}

export default function QuickStartTour({ userProfile, onClose }: QuickStartTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const steps = TOUR_STEPS[userProfile] || TOUR_STEPS.basic;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const highlightTarget = () => {
      const target = document.querySelector(steps[currentStep].target);
      if (target) {
        const rect = target.getBoundingClientRect();
        setHighlightRect(rect);
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setHighlightRect(null);
      }
    };

    highlightTarget();
    const timer = setTimeout(highlightTarget, 100);

    return () => clearTimeout(timer);
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
      localStorage.setItem('quickStartTourCompleted', 'true');
    }
  };

  const handleSkip = () => {
    onClose();
    localStorage.setItem('quickStartTourCompleted', 'true');
  };

  const step = steps[currentStep];

  if (!highlightRect) return null;

  const portal = document.createElement('div');
  portal.style.position = 'fixed';
  portal.style.top = '0';
  portal.style.left = '0';
  portal.style.width = '100vw';
  portal.style.height = '100vh';
  portal.style.pointerEvents = 'none';
  portal.style.zIndex = '99999';
  document.body.appendChild(portal);

  useEffect(() => {
    return () => {
      document.body.removeChild(portal);
    };
  }, []);

  return ReactDOM.createPortal(
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60"
        onClick={handleSkip}
        style={{ pointerEvents: 'auto' }}
      />

      {/* Highlight box */}
      <div
        className="fixed border-2 border-bb-blue rounded-lg shadow-2xl"
        style={{
          top: highlightRect.top - 4,
          left: highlightRect.left - 4,
          width: highlightRect.width + 8,
          height: highlightRect.height + 8,
          pointerEvents: 'none',
        }}
      />

      {/* Tooltip */}
      <div
        ref={containerRef}
        className="fixed bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl p-4 max-w-sm"
        style={{
          top: step.position === 'top' ? highlightRect.top - 16 : highlightRect.bottom + 16,
          left: highlightRect.left,
          transform: step.position === 'top' ? 'translateY(-100%)' : 'translateY(0)',
          pointerEvents: 'auto',
        }}
      >
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-bb-blue/20 shrink-0">
            <Sparkles size={18} className="text-bb-blue" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-bb-text mb-1">{step.title}</h3>
            <p className="text-xs text-bb-muted leading-relaxed">{step.description}</p>
          </div>
          <button
            onClick={handleSkip}
            className="text-bb-muted hover:text-bb-text transition-colors shrink-0"
            title="Skip tour"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep ? 'bg-bb-blue' : 'bg-bb-border'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-3 py-1.5 bg-bb-blue hover:bg-blue-600 text-white text-xs font-medium rounded transition-colors"
          >
            {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </>,
    portal
  );
}

// Hook to check if tour should be shown
export function useQuickStartTour() {
  const [showTour, setShowTour] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const tourCompleted = localStorage.getItem('quickStartTourCompleted');
    const profile = localStorage.getItem('userProfile') as UserProfile | null;

    if (!tourCompleted && profile) {
      // Show tour after a short delay to let the app load
      const timer = setTimeout(() => {
        setUserProfile(profile);
        setShowTour(true);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, []);

  return { showTour, userProfile, closeTour: () => setShowTour(false) };
}
