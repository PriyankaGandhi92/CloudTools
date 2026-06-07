import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyBwcm3wh6hTq8Gx8btveQ6tVEbFdrRW8Cw",
  authDomain: "blueprintpdf.firebaseapp.com",
  projectId: "blueprintpdf",
  storageBucket: "blueprintpdf.firebasestorage.app",
  messagingSenderId: "173129934453",
  appId: "1:173129934453:web:f51ff891037067fa2cba3c",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Uncomment for local development
// if (location.hostname === 'localhost') {
//   connectFunctionsEmulator(functions, 'localhost', 5001);
// }

export default app;
