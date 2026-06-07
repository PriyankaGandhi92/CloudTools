export interface RecentPDF {
  id: string;
  name: string;
  handle?: FileSystemFileHandle;
  lastOpened: number;
  source: 'local' | 'cloud';
  cloudId?: string; // For cloud PDFs
  useFallback?: boolean; // For browsers without File System Access API
}

const DB_NAME = 'MathflowRecentDB';
const STORE_NAME = 'recent_files';
const FALLBACK_KEY = 'recent_files_fallback';

// Check if File System Access API is supported
export const supportsFileSystemAccess = 'showOpenFilePicker' in window;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Fallback using localStorage for browsers without File System Access API
const fallbackStorage = {
  save: (files: RecentPDF[]) => {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(files));
    } catch (e) {
      console.warn('Failed to save recent files to localStorage:', e);
    }
  },
  getAll: (): RecentPDF[] => {
    try {
      const data = localStorage.getItem(FALLBACK_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Failed to load recent files from localStorage:', e);
      return [];
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(FALLBACK_KEY);
    } catch (e) {
      console.warn('Failed to clear recent files from localStorage:', e);
    }
  }
};

export const RecentDB = {
  async save(file: RecentPDF) {
    if (!supportsFileSystemAccess) {
      // Use localStorage fallback
      const files = fallbackStorage.getAll();
      const existingIndex = files.findIndex(f => f.name === file.name);
      if (existingIndex !== -1) {
        files[existingIndex] = file;
      } else {
        files.push(file);
      }
      // Enforce 10-item limit
      files.sort((a, b) => b.lastOpened - a.lastOpened);
      if (files.length > 10) {
        files.splice(10);
      }
      fallbackStorage.save(files);
      return;
    }

    // Use IndexedDB for browsers with File System Access API
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(file);

    // Enforce 10-item limit
    store.getAll().onsuccess = (e) => {
      const records = (e.target as IDBRequest).result as RecentPDF[];
      if (records.length > 10) {
        records.sort((a, b) => b.lastOpened - a.lastOpened);
        records.slice(10).forEach(rec => store.delete(rec.id));
      }
    };
  },

  async getAll(): Promise<RecentPDF[]> {
    if (!supportsFileSystemAccess) {
      // Use localStorage fallback
      const files = fallbackStorage.getAll();
      return files.sort((a, b) => b.lastOpened - a.lastOpened);
    }

    // Use IndexedDB for browsers with File System Access API
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      tx.objectStore(STORE_NAME).getAll().onsuccess = (e) => {
        const records = (e.target as IDBRequest).result as RecentPDF[];
        resolve(records.sort((a, b) => b.lastOpened - a.lastOpened));
      };
    });
  },

  async remove(id: string) {
    if (!supportsFileSystemAccess) {
      // Use localStorage fallback
      const files = fallbackStorage.getAll().filter(f => f.id !== id);
      fallbackStorage.save(files);
      return;
    }

    // Use IndexedDB for browsers with File System Access API
    const db = await openDB();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
  },

  async clearAll() {
    if (!supportsFileSystemAccess) {
      // Use localStorage fallback
      fallbackStorage.clear();
      return;
    }

    // Use IndexedDB for browsers with File System Access API
    const db = await openDB();
    db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).clear();
  }
};
