import { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { auth } from '../config/firebase';
import { useStore } from '../store/useStore';

const USER_COLORS = [
  '#e53935', '#8e24aa', '#3949ab', '#00897b',
  '#43a047', '#f4511e', '#6d4c41', '#1e88e5',
];

function pickColor(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentUser } = useStore();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        setCurrentUser({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || firebaseUser.email || 'User',
          color: pickColor(firebaseUser.uid),
        });
      } else {
        setCurrentUser(null);
      }
    });
    return () => unsub();
  }, [setCurrentUser]);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      const msg = err?.code === 'auth/network-request-failed'
        ? 'Network error — check your internet connection and Firebase config.'
        : err?.code === 'auth/invalid-credential'
        ? 'Invalid email or password.'
        : err?.code === 'auth/user-not-found'
        ? 'No account found with this email.'
        : err?.code === 'auth/wrong-password'
        ? 'Incorrect password.'
        : err?.code === 'auth/too-many-requests'
        ? 'Too many failed attempts. Try again later.'
        : err?.message || 'Login failed.';
      setError(msg);
      throw err;
    }
  };

  const signup = async (email: string, password: string, displayName: string) => {
    setError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        await updateProfile(cred.user, { displayName });
      }
    } catch (err: any) {
      const msg = err?.code === 'auth/email-already-in-use'
        ? 'An account with this email already exists.'
        : err?.code === 'auth/weak-password'
        ? 'Password must be at least 6 characters.'
        : err?.code === 'auth/network-request-failed'
        ? 'Network error — check your internet connection and Firebase config.'
        : err?.message || 'Signup failed.';
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const signInWithGoogle = async () => {
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      const msg = err?.code === 'auth/popup-closed-by-user'
        ? 'Sign-in was cancelled.'
        : err?.code === 'auth/network-request-failed'
        ? 'Network error — check your internet connection and Firebase config.'
        : err?.code === 'auth/account-exists-with-different-credential'
        ? 'An account already exists with the same email address but different sign-in credentials.'
        : err?.code === 'auth/popup-blocked'
        ? 'Popup was blocked. Please allow popups for this site.'
        : err?.message || 'Google sign-in failed.';
      setError(msg);
      throw err;
    }
  };

  return { user, loading, error, login, signup, logout, signInWithGoogle, clearError: () => setError(null) };
}
