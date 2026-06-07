import { useEffect, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useStore } from '../store/useStore';
import { loadPdf, getPageCount } from '../utils/pdfRenderer';
import type { Annotation, Measurement, CalibrationSettings, UserPresence } from '../types';

const PRESENCE_TIMEOUT_MS = 30_000;
const ANNOTATIONS_STORAGE_KEY = 'pdf-editor-annotations';

// Firestore rejects undefined values; strip them before writing
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        cleaned[key] = stripUndefined(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}

// Simple hash of PDF bytes for localStorage key
async function computePdfHash(buffer: ArrayBuffer): Promise<string> {
  const data = new Uint8Array(buffer);
  // Use first 1KB + length for quick hash (full SHA-256 is overkill for this use case)
  const sampleSize = Math.min(1024, data.length);
  const sample = data.slice(0, sampleSize);
  let hash = 0;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash) + sample[i];
    hash |= 0; // Convert to 32bit integer
  }
  return `pdf-${hash}-${data.length}`;
}

// Load annotations from localStorage for a PDF hash
function loadAnnotationsFromStorage(pdfHash: string): Annotation[] | null {
  try {
    const stored = localStorage.getItem(ANNOTATIONS_STORAGE_KEY);
    if (!stored) return null;
    const map: Record<string, Annotation[]> = JSON.parse(stored);
    return map[pdfHash] || null;
  } catch {
    return null;
  }
}

// Save annotations to localStorage for a PDF hash
function saveAnnotationsToStorage(pdfHash: string, annotations: Annotation[]) {
  try {
    const stored = localStorage.getItem(ANNOTATIONS_STORAGE_KEY);
    const map: Record<string, Annotation[]> = stored ? JSON.parse(stored) : {};
    map[pdfHash] = annotations;
    localStorage.setItem(ANNOTATIONS_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('Failed to save annotations to localStorage:', err);
  }
}

export function useFirebaseSync(documentId: string | null) {
  const {
    annotations,
    setAnnotations,
    measurements,
    setMeasurements,
    calibrations,
    setCalibration,
    currentPage,
    currentUser,
    setPresenceList,
    pdfData,
    setPdfData,
    setPageCount,
    setCurrentPage,
    setCurrentDocument,
  } = useStore();

  // Track current PDF hash for localStorage persistence
  const pdfHashRef = useRef<string | null>(null);

  // --- Load annotations from localStorage when PDF changes (local docs only) ---
  useEffect(() => {
    // Only use localStorage for local docs (not Firestore-shared ones)
    if (documentId) return;
    if (!pdfData) return;

    (async () => {
      try {
        const hash = await computePdfHash(pdfData);
        pdfHashRef.current = hash;
        const stored = loadAnnotationsFromStorage(hash);
        if (stored && stored.length > 0) {
          console.log('[LocalStorage] Loaded', stored.length, 'annotations for PDF hash:', hash);
          setAnnotations(stored);
        }
      } catch (err) {
        console.warn('[LocalStorage] Failed to load annotations:', err);
      }
    })();
  }, [pdfData, documentId, setAnnotations]);

  // --- Save annotations to localStorage when they change (local docs only) ---
  useEffect(() => {
    // Only save to localStorage for local docs (not Firestore-shared ones)
    if (documentId) return;
    const hash = pdfHashRef.current;
    if (!hash) return;

    saveAnnotationsToStorage(hash, annotations);
  }, [annotations, documentId]);

  // --- Check URL for ?doc= param and load shared PDF ---
  // Capture ?doc= from URL once on first render (before anything else clears it)
  const sharedDocIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('doc')
  );
  const sharedDocLoaded = useRef(false);

  useEffect(() => {
    const sharedDocId = sharedDocIdRef.current;
    if (!sharedDocId) return;
    if (sharedDocLoaded.current) return;
    if (!currentUser) {
      console.log('[SharedDoc] Waiting for auth before loading doc:', sharedDocId);
      return; // will re-run when currentUser changes
    }
    // If we already have this document loaded, skip
    const current = useStore.getState().currentDocument;
    if (current?.id === sharedDocId) {
      sharedDocLoaded.current = true;
      return;
    }

    sharedDocLoaded.current = true;
    console.log('[SharedDoc] Loading shared doc:', sharedDocId, 'user:', currentUser.uid);

    (async () => {
      try {
        // Fetch document metadata from Firestore
        const docSnap = await getDoc(doc(db, 'documents', sharedDocId));
        if (!docSnap.exists()) {
          console.warn('[SharedDoc] Doc not found in Firestore:', sharedDocId);
          return;
        }
        const meta = docSnap.data();
        console.log('[SharedDoc] Firestore meta:', { name: meta?.name, hasPdfUrl: !!meta?.pdfUrl, ownerId: meta?.ownerId });
        const pdfUrl = meta?.pdfUrl;
        if (!pdfUrl) {
          console.warn('[SharedDoc] Doc has no pdfUrl:', sharedDocId);
          return;
        }

        // Download the PDF from Storage
        console.log('[SharedDoc] Downloading PDF from:', pdfUrl.slice(0, 80) + '...');
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error(`PDF download failed: ${response.status} ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        console.log('[SharedDoc] PDF downloaded, size:', buffer.byteLength, 'bytes');

        setPdfData(buffer);
        await loadPdf(buffer);
        const pgCount = getPageCount();
        setPageCount(pgCount);
        setCurrentPage(0);
        setCurrentDocument({
          id: sharedDocId,
          name: meta?.name || 'Shared PDF',
          storageUrl: pdfUrl,
          pageCount: pgCount,
          ownerId: meta?.ownerId || 'unknown',
          sharedWith: meta?.sharedWith || {},
          createdAt: meta?.createdAt || Date.now(),
          updatedAt: meta?.updatedAt || Date.now(),
        });
        console.log('[SharedDoc] Successfully loaded shared PDF:', meta?.name, pgCount, 'pages');
        // Clean the URL param
        window.history.replaceState({}, '', window.location.pathname);
      } catch (err) {
        console.error('[SharedDoc] Failed to load shared PDF:', err);
        // Reset so user can retry
        sharedDocLoaded.current = false;
      }
    })();
  }, [currentUser]);

  // --- Two-way sync: annotations ---
  // Track which IDs came from Firestore to avoid echo loops
  const remoteAnnIds = useRef(new Set<string>());
  const remoteMeasIds = useRef(new Set<string>());

  // Pull: Firestore → local
  useEffect(() => {
    if (!documentId) return;
    const q = query(collection(db, 'documents', documentId, 'annotations'));
    const unsub = onSnapshot(q, (snapshot) => {
      // Skip snapshots that are echoes of local writes — this prevents
      // the "bounce-back" where a drag update gets overwritten by stale
      // Firestore data before the server confirms the write.
      if (snapshot.metadata.hasPendingWrites) return;

      const remote: Annotation[] = [];
      const ids = new Set<string>();
      snapshot.forEach((d) => {
        const ann = { id: d.id, ...d.data() } as Annotation;
        remote.push(ann);
        ids.add(d.id);
      });
      remoteAnnIds.current = ids;
      // Only update if the remote annotations are different from current
      const current = useStore.getState().annotations;
      const currentIds = new Set(current.map((a) => a.id));
      // Check if IDs are different
      const idsDifferent = ids.size !== currentIds.size || ![...ids].every((id) => currentIds.has(id));
      // Check if content is different - create a map of ID to annotation for comparison
      const remoteMap = new Map(remote.map((a) => [a.id, a]));
      const currentMap = new Map(current.map((a) => [a.id, a]));
      let contentDifferent = false;
      for (const [id, remoteAnn] of remoteMap) {
        const currentAnn = currentMap.get(id);
        if (!currentAnn || JSON.stringify(remoteAnn) !== JSON.stringify(currentAnn)) {
          contentDifferent = true;
          break;
        }
      }
      if (idsDifferent || contentDifferent) {
        setAnnotations(remote);
      }
    });
    return () => unsub();
  }, [documentId, setAnnotations]);

  // Push: local → Firestore (subscribe to store changes)
  // Debounced to prevent write-stream exhaustion when many annotations
  // change in rapid succession (e.g., plan review applying 24+ at once).
  useEffect(() => {
    if (!documentId) return;
    let prevIds = new Set(useStore.getState().annotations.map((a) => a.id));
    let pushTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingPrevState: typeof useStore extends { getState: () => infer S } ? S : never;
    const unsub = useStore.subscribe((state, prevState) => {
      if (state.annotations === prevState.annotations) return;
      // Keep the earliest prevState for the debounce window
      if (!pushTimer) pendingPrevState = prevState as any;
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        pushTimer = null;
        const currentState = useStore.getState();
        const currentIds = new Set(currentState.annotations.map((a) => a.id));
        const batch = writeBatch(db);
        let hasBatch = false;
        // New annotations (not from remote)
        for (const ann of currentState.annotations) {
          if (!prevIds.has(ann.id) && !remoteAnnIds.current.has(ann.id)) {
            batch.set(doc(db, 'documents', documentId, 'annotations', ann.id), stripUndefined(ann));
            hasBatch = true;
          }
        }
        // Updated annotations
        const prevAnns = (pendingPrevState as any)?.annotations || [];
        for (const ann of currentState.annotations) {
          const prev = prevAnns.find((a: Annotation) => a.id === ann.id);
          if (prev && prev !== ann && JSON.stringify(prev) !== JSON.stringify(ann)) {
            batch.set(doc(db, 'documents', documentId, 'annotations', ann.id), stripUndefined(ann));
            hasBatch = true;
          }
        }
        // Deleted annotations
        for (const id of prevIds) {
          if (!currentIds.has(id)) {
            batch.delete(doc(db, 'documents', documentId, 'annotations', id));
            hasBatch = true;
          }
        }
        if (hasBatch) {
          batch.commit().catch((err) => console.warn('[Firestore] Batch commit error:', err));
        }
        prevIds = currentIds;
      }, 300);
    });
    return () => {
      unsub();
      if (pushTimer) clearTimeout(pushTimer);
    };
  }, [documentId]);

  // --- Two-way sync: measurements ---
  useEffect(() => {
    if (!documentId) return;
    const q = query(collection(db, 'documents', documentId, 'measurements'));
    const unsub = onSnapshot(q, (snapshot) => {
      const remote: Measurement[] = [];
      const ids = new Set<string>();
      snapshot.forEach((d) => {
        remote.push({ id: d.id, ...d.data() } as Measurement);
        ids.add(d.id);
      });
      remoteMeasIds.current = ids;
      setMeasurements(remote);
    });
    return () => unsub();
  }, [documentId, setMeasurements]);

  useEffect(() => {
    if (!documentId) return;
    let prevIds = new Set(useStore.getState().measurements.map((m) => m.id));
    const unsub = useStore.subscribe((state, prevState) => {
      if (state.measurements === prevState.measurements) return;
      const currentIds = new Set(state.measurements.map((m) => m.id));
      for (const m of state.measurements) {
        if (!prevIds.has(m.id) && !remoteMeasIds.current.has(m.id)) {
          setDoc(doc(db, 'documents', documentId, 'measurements', m.id), stripUndefined(m)).catch(() => {});
        }
      }
      for (const m of state.measurements) {
        const prev = prevState.measurements.find((pm) => pm.id === m.id);
        if (prev && prev !== m) {
          setDoc(doc(db, 'documents', documentId, 'measurements', m.id), stripUndefined(m)).catch(() => {});
        }
      }
      for (const id of prevIds) {
        if (!currentIds.has(id)) {
          deleteDoc(doc(db, 'documents', documentId, 'measurements', id)).catch(() => {});
        }
      }
      prevIds = currentIds;
    });
    return () => unsub();
  }, [documentId]);

  // --- Sync calibrations from Firestore ---
  useEffect(() => {
    if (!documentId) return;
    const q = query(collection(db, 'documents', documentId, 'calibrations'));
    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.forEach((d) => {
        const cal = d.data() as CalibrationSettings;
        setCalibration(cal.pageIndex, cal);
      });
    });
    return () => unsub();
  }, [documentId, setCalibration]);

  // --- User presence ---
  useEffect(() => {
    if (!documentId || !currentUser) return;

    const presenceRef = doc(db, 'documents', documentId, 'presence', currentUser.uid);

    const updatePresence = () => {
      setDoc(presenceRef, {
        userId: currentUser.uid,
        displayName: currentUser.displayName,
        color: currentUser.color,
        currentPage,
        lastActive: Date.now(),
      } satisfies UserPresence);
    };

    updatePresence();
    const interval = setInterval(updatePresence, 10_000);

    const q = query(collection(db, 'documents', documentId, 'presence'));
    const unsub = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const list: UserPresence[] = [];
      snapshot.forEach((d) => {
        const p = d.data() as UserPresence;
        if (now - p.lastActive < PRESENCE_TIMEOUT_MS && p.userId !== currentUser.uid) {
          list.push(p);
        }
      });
      setPresenceList(list);
    });

    return () => {
      clearInterval(interval);
      deleteDoc(presenceRef).catch(() => {});
      unsub();
    };
  }, [documentId, currentUser, currentPage, setPresenceList]);

  // --- Push annotation to Firestore ---
  const pushAnnotation = useCallback(
    async (ann: Annotation) => {
      if (!documentId) return;
      await setDoc(doc(db, 'documents', documentId, 'annotations', ann.id), stripUndefined(ann));
    },
    [documentId]
  );

  const removeAnnotation = useCallback(
    async (annId: string) => {
      if (!documentId) return;
      await deleteDoc(doc(db, 'documents', documentId, 'annotations', annId));
    },
    [documentId]
  );

  const pushMeasurement = useCallback(
    async (m: Measurement) => {
      if (!documentId) return;
      await setDoc(doc(db, 'documents', documentId, 'measurements', m.id), stripUndefined(m));
    },
    [documentId]
  );

  const pushCalibration = useCallback(
    async (cal: CalibrationSettings) => {
      if (!documentId) return;
      await setDoc(
        doc(db, 'documents', documentId, 'calibrations', String(cal.pageIndex)),
        stripUndefined(cal)
      );
    },
    [documentId]
  );

  // --- Upload PDF to Firebase Storage and save metadata ---
  const uploadAndSharePdf = useCallback(
    async (name: string, data: ArrayBuffer): Promise<string> => {
      if (!documentId) throw new Error('No document ID');
      // Clone the ArrayBuffer to avoid "detached ArrayBuffer" errors
      const cloned = data.slice(0);
      // Upload PDF bytes to Storage
      const storageRef = ref(storage, `pdfs/${documentId}/document.pdf`);
      await uploadBytes(storageRef, new Uint8Array(cloned));
      const downloadUrl = await getDownloadURL(storageRef);

      // Save document metadata to Firestore
      await setDoc(doc(db, 'documents', documentId), {
        name,
        pdfUrl: downloadUrl,
        ownerId: useStore.getState().currentUser?.uid || 'local',
        sharedWith: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      return downloadUrl;
    },
    [documentId]
  );

  // --- Upload PDF to Firebase Storage (file-based) ---
  const uploadPdf = useCallback(
    async (file: File): Promise<string> => {
      const storageRef = ref(storage, `pdfs/${documentId}/${file.name}`);
      await uploadBytes(storageRef, file);
      return getDownloadURL(storageRef);
    },
    [documentId]
  );

  return {
    pushAnnotation,
    removeAnnotation,
    pushMeasurement,
    pushCalibration,
    uploadPdf,
    uploadAndSharePdf,
  };
}
