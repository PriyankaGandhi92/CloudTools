import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { FileText, LogIn, UserPlus, AlertCircle, Loader2, Briefcase, Building2, Users, FileCheck, Layout } from 'lucide-react';

type UserProfile = 'lawyer' | 'civil' | 'bim' | 'collaboration' | 'basic';

const USER_PROFILES: { id: UserProfile; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'lawyer', label: 'Legal Professional', icon: <Briefcase size={20} />, description: 'Contract review, redlining, document markup' },
  { id: 'civil', label: 'Civil Engineer / Architect', icon: <Building2 size={20} />, description: 'Plan review, measurements, annotations' },
  { id: 'bim', label: 'BIM Inspection', icon: <Layout size={20} />, description: 'Building element capture, inspections' },
  { id: 'collaboration', label: 'Team Collaboration', icon: <Users size={20} />, description: 'Real-time sharing, annotations, feedback' },
  { id: 'basic', label: 'Everyday Use', icon: <FileCheck size={20} />, description: 'Basic PDF editing, highlighting, notes' },
];

export default function AuthScreen() {
  const { login, signup, error, clearError, signInWithGoogle } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isSignup) {
        await signup(email, password, displayName);
        // Store user profile preference
        if (userProfile) {
          localStorage.setItem('userProfile', userProfile);
        }
      } else {
        await login(email, password);
      }
    } catch {
      // error is set in the hook
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-bb-dark">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-bb-blue/20 mb-4">
            <FileText size={28} className="text-bb-blue" />
          </div>
          <h1 className="text-xl font-bold text-bb-text">BluePrint</h1>
          <p className="text-xs text-bb-muted mt-1">Collaborative PDF Editor</p>
        </div>

        {/* Card */}
        <div className="bg-bb-sidebar rounded-xl border border-bb-border p-6 shadow-2xl">
          <h2 className="text-sm font-semibold mb-4">
            {isSignup ? 'Create Account' : 'Sign In'}
          </h2>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 mb-4">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {isSignup && (
              <>
                <div>
                  <label className="text-[11px] text-bb-muted block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-bb-panel border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text outline-none focus:border-bb-blue transition-colors placeholder:text-bb-muted/50"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-bb-muted block mb-2">What best describes you?</label>
                  <div className="grid grid-cols-1 gap-2">
                    {USER_PROFILES.map((profile) => (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setUserProfile(profile.id)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                          userProfile === profile.id
                            ? 'border-bb-blue bg-bb-blue/10'
                            : 'border-bb-border hover:border-bb-hover bg-bb-panel'
                        }`}
                      >
                        <div className={`p-2 rounded-lg ${userProfile === profile.id ? 'bg-bb-blue/20' : 'bg-bb-dark'}`}>
                          {profile.icon}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-bb-text">{profile.label}</div>
                          <div className="text-[10px] text-bb-muted">{profile.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="text-[11px] text-bb-muted block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                placeholder="you@example.com"
                required
                className="w-full bg-bb-panel border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text outline-none focus:border-bb-blue transition-colors placeholder:text-bb-muted/50"
                autoFocus
              />
            </div>

            <div>
              <label className="text-[11px] text-bb-muted block mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                placeholder="Enter password"
                required
                minLength={6}
                className="w-full bg-bb-panel border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text outline-none focus:border-bb-blue transition-colors placeholder:text-bb-muted/50"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-bb-blue hover:bg-blue-600 disabled:opacity-60 text-white font-medium text-sm rounded-lg px-4 py-2.5 transition-colors mt-1"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isSignup ? (
                <UserPlus size={16} />
              ) : (
                <LogIn size={16} />
              )}
              {submitting ? 'Please wait...' : isSignup ? 'Create Account' : 'Sign In'}
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-bb-border"></div>
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-2 bg-bb-sidebar text-bb-muted">or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                setSubmitting(true);
                try {
                  await signInWithGoogle();
                } catch {
                  // error is set in the hook
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-100 disabled:opacity-60 text-gray-800 font-medium text-sm rounded-lg px-4 py-2.5 transition-colors border border-gray-300"
            >
              {submitting ? (
                <Loader2 size={16} className="animate-spin text-gray-600" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              )}
              {submitting ? 'Signing in...' : 'Google'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => { setIsSignup(!isSignup); clearError(); }}
              className="text-xs text-bb-accent hover:underline"
            >
              {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-bb-muted text-center mt-4">
          Powered by Firebase Authentication
        </p>
      </div>
    </div>
  );
}
