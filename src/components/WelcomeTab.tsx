import React from 'react';
import { FileText, PenTool, Search, MessageSquare, Sparkles, ScanText, Ruler, Layers, Share2, Zap, Eye, Download, User, Settings } from 'lucide-react';

export default function WelcomeTab() {
  const features = [
    { icon: FileText, title: '100% PDF Edit', description: 'Open, view, and Edit (move, copy, flatten pages) PDFs with smooth scrolling and zoom controls' },
    { icon: PenTool, title: 'Annotations', description: 'Draw shapes, highlight text, add comments, pictures, and create custom annotations' },
    { icon: Search, title: 'Find & Replace', description: 'Search across all documents with advanced find and replace' },
    { icon: MessageSquare, title: 'Chat with PDF', description: 'Chat with your PDF using AI to extract information and answer questions' },
    { icon: Sparkles, title: 'AI Plan QC', description: 'Auto-quality check plans with QC-AI and reduce your work hours' },
    { icon: ScanText, title: 'OCR', description: 'Extract text from scanned PDFs with optical character recognition' },
    { icon: Ruler, title: 'Measurements', description: 'Measure distances, areas, angles, and more with calibration support' },
    { icon: Layers, title: 'No Installation No Upload', description: 'No instllation required, no powerful hardware needed, no website upload needed' },
    { icon: Share2, title: 'Realtime Sync & Link Share on Phone-Tab-PC', description: 'Share documents on Windows-Mac-Tablet-Phone seamlessly and work together' },
    { icon: Zap, title: 'Plan Review', description: 'AI-powered plan review for engineering and architectural drawings' },
    { icon: Eye, title: 'Split View', description: 'Vertical Split documents side-by-side for comparison' },
    { icon: Download, title: 'Legal Document Review - Timeline Prep', description: 'Study Local documents without uploading and Prepare CSV timeline of Events' },
    { icon: User, title: 'Signatures', description: 'Add digital signatures to your documents' },
    { icon: Settings, title: 'Calibration', description: 'Set measurement scales for accurate dimensioning' },
    { icon: Settings, title: 'Upgrade W/o Installation', description: 'Realtime Upgrades - No Download - No Installation - No Time-Waste' },
  ];

  return (
    <div className="h-full overflow-y-auto p-8 bg-bb-dark">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold text-bb-text mb-2">Welcome to BluePrint PDF</h1>
          <p className="text-bb-muted text-lg">Your all-in-one PDF annotation and collaboration tool</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-bb-panel border border-bb-border rounded-lg p-5 hover:border-bb-blue transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-bb-blue/10 rounded-lg">
                    <Icon size={20} className="text-bb-blue" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-bb-text mb-1">{feature.title}</h3>
                    <p className="text-sm text-bb-muted">{feature.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <p className="text-bb-muted text-sm">
            Open a PDF to get started, or use the toolbar above to explore all features
          </p>
        </div>
      </div>
    </div>
  );
}
