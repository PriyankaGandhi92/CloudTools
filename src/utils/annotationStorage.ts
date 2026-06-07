import { Annotation, Measurement, CalibrationSettings, Bookmark } from '../types';

interface StoredAnnotations {
  documentId: string;
  annotations: Annotation[];
  measurements: Measurement[];
  calibrations: Record<number, CalibrationSettings>;
  bookmarks: Bookmark[];
  currentPage: number;
  lastModified: number;
}

const DB_NAME = 'BlueprintPDFAnnotations';
const DB_VERSION = 1;
const STORE_NAME = 'annotations';

let db: IDBDatabase | null = null;

/**
 * Initialize IndexedDB for annotation storage
 */
async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'documentId' });
        store.createIndex('lastModified', 'lastModified', { unique: false });
      }
    };
  });
}

/**
 * Save annotations to IndexedDB
 */
export async function saveAnnotationsToIndexedDB(
  documentId: string,
  annotations: Annotation[],
  measurements: Measurement[],
  calibrations: Record<number, CalibrationSettings>,
  bookmarks: Bookmark[],
  currentPage: number
): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const data: StoredAnnotations = {
      documentId,
      annotations,
      measurements,
      calibrations,
      bookmarks,
      currentPage,
      lastModified: Date.now(),
    };

    const request = store.put(data);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Load annotations from IndexedDB
 */
export async function loadAnnotationsFromIndexedDB(
  documentId: string
): Promise<StoredAnnotations | null> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(documentId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result || null);
    };
  });
}

/**
 * Delete annotations from IndexedDB
 */
export async function deleteAnnotationsFromIndexedDB(documentId: string): Promise<void> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(documentId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * List all stored documents
 */
export async function listStoredDocuments(): Promise<StoredAnnotations[]> {
  const database = await initDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result || []);
    };
  });
}
