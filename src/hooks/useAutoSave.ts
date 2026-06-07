import { useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import { exportAnnotatedPdfAsBuffer } from '../utils/exportPdf';
import { saveAnnotationsToIndexedDB } from '../utils/annotationStorage';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export function useAutoSave() {
  const { 
    annotations, 
    formFields, 
    pdfData, 
    pageCount, 
    measurements, 
    measurementUnit,
    autoSaveEnabled,
    activeTabId,
    tabs,
    updateTab,
    documentId,
    calibrations,
    bookmarks,
    currentPage,
    cloudSyncEnabled,
    currentUser,
    setCADFeedback
  } = useStore();

  // Get fileHandle from the current tab
  const fileHandle = activeTabId ? tabs.find(t => t.id === activeTabId)?.fileHandle : null;

  const isSaving = useRef(false);
  const hasUserActivation = useRef(false);

  // Track user activation (clicks, keypresses)
  useEffect(() => {
    const handleUserActivation = () => {
      hasUserActivation.current = true;
      // Reset after 2 seconds (user activation window)
      setTimeout(() => {
        hasUserActivation.current = false;
      }, 2000);
    };

    window.addEventListener('click', handleUserActivation);
    window.addEventListener('keydown', handleUserActivation);
    
    return () => {
      window.removeEventListener('click', handleUserActivation);
      window.removeEventListener('keydown', handleUserActivation);
    };
  }, []);

  const performSilentSave = useCallback(async () => {
    // Prevent concurrent save attempts
    if (isSaving.current) {
      console.log('[AutoSave] Save already in progress, skipping');
      return false;
    }

    console.log('[AutoSave] performSilentSave called', { 
      hasFileHandle: !!fileHandle, 
      hasPdfData: !!pdfData,
      hasDocumentId: !!documentId,
      autoSaveEnabled,
      pageCount,
      annotationCount: annotations.length,
      formFieldCount: formFields.length
    });

    if (!pdfData) {
      console.error('[AutoSave] Missing pdfData');
      return false;
    }

    isSaving.current = true;

    try {
      // Save annotations to IndexedDB (fast, ~2ms) - doesn't need user activation
      if (documentId) {
        console.log('[AutoSave] Saving annotations to IndexedDB for', documentId);
        await saveAnnotationsToIndexedDB(
          documentId,
          annotations,
          measurements,
          calibrations,
          bookmarks,
          currentPage
        );
        console.log('[AutoSave] Annotations saved to IndexedDB');

        // Active Firebase Mirroring
        if (cloudSyncEnabled && currentUser?.uid) {
          console.log('[AutoSave] Mirroring layout state to Firestore...');
          const cloudDocRef = doc(db, 'documents', documentId);
          await setDoc(cloudDocRef, {
            lastSavedBy: currentUser.uid,
            lastSavedByDisplayName: currentUser.displayName,
            updatedAt: Date.now(),
            annotations,
            measurements,
            calibrations,
            bookmarks,
            currentPage
          }, { merge: true });
          console.log('[AutoSave] Firestore sync complete');
        }
      }
      
      console.log("[AutoSave] Save complete!");
      return true;
    } catch (error: any) {
      console.error("[AutoSave] Failed to save:", error);
      
      // If the file handle is stale (file moved/deleted), clear it
      if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
        console.log('[AutoSave] File handle is stale, clearing it');
        if (activeTabId) {
          updateTab(activeTabId, { fileHandle: undefined });
        }
      }
      
      return false;
    } finally {
      isSaving.current = false;
    }
  }, [fileHandle, pdfData, pageCount, annotations, measurements, measurementUnit, formFields, autoSaveEnabled, activeTabId, updateTab, documentId, calibrations, bookmarks, currentPage, cloudSyncEnabled, currentUser]);

  // Intercept Ctrl+S (or Cmd+S on Mac)
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // If the user is typing in an input, don't intercept
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        console.log('[AutoSave] Ctrl+S detected', { hasFileHandle: !!fileHandle, autoSaveEnabled });
        e.preventDefault(); // STOP THE BROWSER'S DEFAULT SAVE DIALOG!
        
        // Set user activation flag for this specific action
        hasUserActivation.current = true;
        
        const success = await performSilentSave();
        if (success) {
          console.log('Saved successfully');
          setCADFeedback('SAVED SUCCESSFULLY');
        } else {
          alert('Failed to save file. Please try again.');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fileHandle, performSilentSave, autoSaveEnabled]);

  // Auto-save on changes if enabled
  useEffect(() => {
    if (!autoSaveEnabled || !pdfData) return;

    const autoSaveTimer = setTimeout(async () => {
      console.log('[AutoSave] Auto-saving due to changes...');
      await performSilentSave();
    }, 2000); // Auto-save 2 seconds after last change

    return () => clearTimeout(autoSaveTimer);
  }, [autoSaveEnabled, pdfData, annotations, formFields, pageCount, measurements, measurementUnit, performSilentSave]);

  return { performSilentSave };
}
