import { getFirestore, collection, doc, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Project, PdfVersion, ProjectAnnotation, ReviewRun, ReviewAnnotation } from '../types/project';

export type { Project, PdfVersion, ProjectAnnotation, ReviewRun, ReviewAnnotation };

const projectsCollection = collection(db, 'projects');

// Create a new project
export async function createProject(name: string, description?: string): Promise<Project> {
  const docRef = await addDoc(projectsCollection, {
    name,
    description,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    currentPdfId: null,
    pdfVersions: [],
    annotations: [],
  });
  
  const docSnap = await getDoc(docRef);
  return { id: docRef.id, ...docSnap.data() } as Project;
}

// Get all projects for a user (currently no auth, so gets all)
export async function getProjects(): Promise<Project[]> {
  const q = query(projectsCollection, orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Project);
}

// Get a single project by ID
export async function getProject(projectId: string): Promise<Project | null> {
  const docRef = doc(db, 'projects', projectId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Project;
}

// Update project metadata
export async function updateProject(projectId: string, updates: Partial<Pick<Project, 'name' | 'description'>>): Promise<void> {
  const docRef = doc(db, 'projects', projectId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: Timestamp.now(),
  });
}

// Delete a project
export async function deleteProject(projectId: string): Promise<void> {
  const docRef = doc(db, 'projects', projectId);
  await deleteDoc(docRef);
}

// Add a PDF version to a project
export async function addPdfVersion(
  projectId: string,
  fileName: string,
  pageCount: number,
  fileSize: number,
  reviewResults?: ReviewRun
): Promise<PdfVersion> {
  const projectRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) throw new Error('Project not found');
  
  const project = { id: projectRef.id, ...projectSnap.data() } as Project;
  
  // Clean review results before saving to prevent undefined values
  let cleanReviewResults: ReviewRun | undefined;
  if (reviewResults) {
    const cleanAnnotations = (reviewResults.annotations || []).map(ann => ({
      annotation_id: ann.annotation_id || '',
      page_number: ann.page_number || 1,
      sheet_number: ann.sheet_number || '',
      sheet_title: ann.sheet_title || '',
      location_description: ann.location_description || '',
      coordinates_normalized: ann.coordinates_normalized || { x1: null, y1: null, x2: null, y2: null },
      markup_type: ann.markup_type || 'pin_comment',
      severity: ann.severity || 'Moderate',
      category: ann.category || 'Drawing Completeness',
      comment_title: ann.comment_title || '',
      engineering_justification: ann.engineering_justification || '',
      cad_directive: ann.cad_directive || '',
      cross_references: ann.cross_references || [],
      confidence: ann.confidence || 'Medium',
      needs_human_engineer_review: ann.needs_human_engineer_review || false,
      source_model: ann.source_model || 'ai',
    }));
    
    const cleanModelResults = (reviewResults.modelResults || []).map(m => ({
      model: m.model || '',
      status: m.status || 'failed',
      count: m.count || 0,
    }));
    
    cleanReviewResults = {
      id: reviewResults.id,
      pdfVersionId: reviewResults.pdfVersionId,
      runAt: reviewResults.runAt,
      summary: reviewResults.summary || '',
      scratchpad: reviewResults.scratchpad || '',
      annotations: cleanAnnotations,
      modelResults: cleanModelResults,
    };
  }
  
  const pdfVersion: PdfVersion = {
    id: `pdf-${Date.now()}`,
    projectId,
    fileName,
    uploadedAt: Timestamp.now().toMillis(),
    pageCount,
    fileSize,
    reviewResults: cleanReviewResults,
  };
  
  project.pdfVersions.push(pdfVersion);
  project.currentPdfId = pdfVersion.id;
  project.updatedAt = Timestamp.now().toMillis();
  
  await updateDoc(projectRef, {
    pdfVersions: project.pdfVersions,
    currentPdfId: project.currentPdfId,
    updatedAt: Timestamp.now(),
  });
  
  return pdfVersion;
}

// Set current PDF version for a project
export async function setCurrentPdfVersion(projectId: string, pdfVersionId: string): Promise<void> {
  const projectRef = doc(db, 'projects', projectId);
  await updateDoc(projectRef, {
    currentPdfId: pdfVersionId,
    updatedAt: Timestamp.now(),
  });
}

// Save review results to a PDF version
export async function saveReviewResults(
  projectId: string,
  pdfVersionId: string,
  reviewResults: ReviewRun
): Promise<void> {
  const projectRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) throw new Error('Project not found');
  
  const project = { id: projectRef.id, ...projectSnap.data() } as Project;
  
  const pdfVersionIndex = project.pdfVersions.findIndex(v => v.id === pdfVersionId);
  if (pdfVersionIndex === -1) throw new Error('PDF version not found');
  
  // Filter out undefined values before saving, including nested values in annotations
  const cleanAnnotations = (reviewResults.annotations || []).map(ann => ({
    annotation_id: ann.annotation_id || '',
    page_number: ann.page_number || 1,
    sheet_number: ann.sheet_number || '',
    sheet_title: ann.sheet_title || '',
    location_description: ann.location_description || '',
    coordinates_normalized: ann.coordinates_normalized || { x1: null, y1: null, x2: null, y2: null },
    markup_type: ann.markup_type || 'pin_comment',
    severity: ann.severity || 'Moderate',
    category: ann.category || 'Drawing Completeness',
    comment_title: ann.comment_title || '',
    engineering_justification: ann.engineering_justification || '',
    cad_directive: ann.cad_directive || '',
    cross_references: ann.cross_references || [],
    confidence: ann.confidence || 'Medium',
    needs_human_engineer_review: ann.needs_human_engineer_review || false,
    source_model: ann.source_model || 'ai',
  }));
  
  const cleanModelResults = (reviewResults.modelResults || []).map(m => ({
    model: m.model || '',
    status: m.status || 'failed',
    count: m.count || 0,
  }));
  
  const cleanReviewResults: ReviewRun = {
    id: reviewResults.id,
    pdfVersionId: reviewResults.pdfVersionId,
    runAt: reviewResults.runAt,
    summary: reviewResults.summary || '',
    scratchpad: reviewResults.scratchpad || '',
    annotations: cleanAnnotations,
    modelResults: cleanModelResults,
  };
  
  project.pdfVersions[pdfVersionIndex].reviewResults = cleanReviewResults;
  project.updatedAt = Timestamp.now().toMillis();
  
  await updateDoc(projectRef, {
    pdfVersions: project.pdfVersions,
    updatedAt: Timestamp.now(),
  });
}

// Compare new annotations with previous ones and update status
export async function updateAnnotationStatus(
  projectId: string,
  newAnnotations: ReviewAnnotation[],
  previousAnnotations: ReviewAnnotation[]
): Promise<ProjectAnnotation[]> {
  const projectRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) throw new Error('Project not found');
  
  const project = { id: projectRef.id, ...projectSnap.data() } as Project;
  const reviewId = `review-${Date.now()}`;
  const currentPdfId = project.currentPdfId;
  if (!currentPdfId) throw new Error('No current PDF version');
  
  const updatedAnnotations: ProjectAnnotation[] = [];
  
  // Create new project annotations from new review results
  for (const ann of newAnnotations) {
    // Check if this annotation was previously identified
    const previousMatch = previousAnnotations.find(prev => 
      prev.comment_title === ann.comment_title && 
      prev.location_description === ann.location_description
    );
    
    const projectAnn: ProjectAnnotation = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      projectId,
      sourceReviewId: reviewId,
      sourcePdfVersionId: currentPdfId,
      annotation: ann,
      status: previousMatch ? 'still_not_fixed' : 'open',
      statusUpdatedAt: Date.now(),
    };
    
    updatedAnnotations.push(projectAnn);
  }
  
  // Mark previous annotations as resolved if they don't appear in new results
  for (const existingAnn of project.annotations) {
    const stillPresent = newAnnotations.find(newAnn =>
      newAnn.comment_title === existingAnn.annotation.comment_title &&
      newAnn.location_description === existingAnn.annotation.location_description
    );
    
    if (!stillPresent && existingAnn.status === 'open') {
      existingAnn.status = 'resolved';
      existingAnn.statusUpdatedAt = Date.now();
      existingAnn.resolvedInReviewId = reviewId;
    }
  }
  
  // Merge new annotations with existing ones
  project.annotations = [...project.annotations, ...updatedAnnotations];
  project.updatedAt = Timestamp.now().toMillis();
  
  await updateDoc(projectRef, {
    annotations: project.annotations,
    updatedAt: Timestamp.now(),
  });
  
  return updatedAnnotations;
}

// Get annotations for a project
export async function getProjectAnnotations(projectId: string): Promise<ProjectAnnotation[]> {
  const projectRef = doc(db, 'projects', projectId);
  const projectSnap = await getDoc(projectRef);
  if (!projectSnap.exists()) return [];
  
  const project = { id: projectRef.id, ...projectSnap.data() } as Project;
  return project.annotations;
}

// Get current PDF version for a project
export async function getCurrentPdfVersion(projectId: string): Promise<PdfVersion | null> {
  const project = await getProject(projectId);
  if (!project || !project.currentPdfId) return null;
  
  return project.pdfVersions.find(v => v.id === project.currentPdfId) || null;
}
