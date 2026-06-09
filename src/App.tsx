import React, { lazy, Suspense } from 'react';
import { useAuth } from './hooks/useAuth';
import AuthScreen from './components/AuthScreen';
import { Loader2 } from 'lucide-react';

// Lazy-load the entire heavy workspace - only loads after authentication
const MainWorkspace = lazy(() => import('./components/MainWorkspace'));

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bb-dark">
        <Loader2 size={32} className="animate-spin text-bb-blue" />
      </div>
    );
  }

  // If not logged in, only load AuthScreen (instant load!)
  if (!user) {
    return <AuthScreen />;
  }

  // If logged in, lazy-load the entire heavy workspace
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center bg-bb-dark">
        <Loader2 size={32} className="animate-spin text-bb-blue" />
      </div>
    }>
      <MainWorkspace />
    </Suspense>
  );
}
