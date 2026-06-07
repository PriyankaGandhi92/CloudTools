import { useEffect } from 'react';
import { useStore } from '../store/useStore';
// import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore'; // Example Firebase imports
// import { db } from '../firebaseConfig';

export function useProjectSync(projectId: string | null) {
  const { annotations, setAnnotations } = useStore();

  // 1. LISTENER: Download tasks from the cloud in real-time
  useEffect(() => {
    if (!projectId) return;

    console.log(`Subscribing to cloud database for project: ${projectId}`);
    
    /* === FIREBASE EXAMPLE ===
    const unsubscribe = onSnapshot(collection(db, `projects/${projectId}/annotations`), (snapshot) => {
      const cloudAnnotations = snapshot.docs.map(doc => doc.data() as Annotation);
      
      // Update local Zustand store with fresh cloud data
      setAnnotations(cloudAnnotations);
    });
    return () => unsubscribe();
    ========================== */

  }, [projectId, setAnnotations]);

  // 2. SENDER: Push local changes to the cloud
  // You would intercept your existing `addAnnotation` and `updateAnnotation` 
  // calls in `useStore.ts` to also fire a network request.
  
  /* === ZUSTAND STORE UPDATE EXAMPLE ===
     Inside useStore.ts, update your addAnnotation function:

     addAnnotation: async (annotation) => {
       // 1. Update local UI instantly (Optimistic UI)
       set((state) => ({ annotations: [...state.annotations, annotation] }));
       
       // 2. Push to database in background
       if (currentProjectId) {
         await setDoc(doc(db, `projects/${currentProjectId}/annotations`, annotation.id), annotation);
       }
     }
  ====================================== */
}
