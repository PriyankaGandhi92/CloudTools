// Project data structure for continuous AI analysis

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
  currentPdfId?: string; // ID of the current PDF version
  pdfVersions: PdfVersion[];
  annotations: ProjectAnnotation[];
}

export interface PdfVersion {
  id: string;
  projectId: string;
  fileName: string;
  uploadedAt: number; // timestamp
  pageCount: number;
  fileSize: number;
  reviewResults?: ReviewRun; // Latest AI review results for this version
}

export interface ReviewRun {
  id: string;
  pdfVersionId: string;
  runAt: number; // timestamp
  summary: string;
  scratchpad: string;
  annotations: ReviewAnnotation[];
  modelResults: { model: string; status: 'success' | 'error'; error?: string; count: number }[];
}

export interface ProjectAnnotation {
  id: string;
  projectId: string;
  // Reference to the review run where this annotation was created
  sourceReviewId: string;
  // Reference to the PDF version where this annotation was created
  sourcePdfVersionId: string;
  // The annotation data
  annotation: ReviewAnnotation;
  // Status tracking
  status: 'open' | 'resolved' | 'still_not_fixed';
  // When this status was last updated
  statusUpdatedAt: number;
  // If resolved, which review run resolved it
  resolvedInReviewId?: string;
  // Comments/notes from user
  userNotes?: string;
}

export interface ReviewAnnotation {
  annotation_id: string;
  page_number: number;
  sheet_number?: string;
  sheet_title?: string;
  location_description: string;
  coordinates_normalized?: { x1: number | null; y1: number | null; x2: number | null; y2: number | null };
  markup_type: string;
  severity: 'Critical' | 'Major' | 'Moderate' | 'Minor';
  category: string;
  comment_title: string;
  engineering_justification?: string;
  cad_directive?: string;
  cross_references?: string[];
  confidence: string;
  needs_human_engineer_review: boolean;
  source_model?: string;
}
