import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../config/firebase';
import { useStore } from '../store/useStore';
import app from '../config/firebase';

const functions = getFunctions(app);

interface ApiKeyResponse {
  apiKey: string;
  expiresIn: number;
}

interface RedeemResponse {
  success: boolean;
  plan: string;
  expiresAt: string;
}

let cachedKey: string | null = null;
let cacheExpiry = 0;

/**
 * Fetches the Gemini API key from the secure Cloud Function.
 * Only works for authenticated paid users.
 * Caches the key locally for the session (1hr TTL).
 * Has a 5-second timeout to prevent app hanging on server errors.
 */
export async function fetchApiKey(): Promise<string | null> {
  // Return cached if still valid
  if (cachedKey && Date.now() < cacheExpiry) {
    return cachedKey;
  }

  const user = auth.currentUser;
  if (!user) return null;

  try {
    const getKey = httpsCallable<void, ApiKeyResponse>(functions, 'getApiKey');
    
    // Add 5-second timeout to prevent app hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 5000);
    });
    
    const result = await Promise.race([getKey(), timeoutPromise]);
    cachedKey = result.data.apiKey;
    cacheExpiry = Date.now() + result.data.expiresIn * 1000;

    return cachedKey;
  } catch (err: any) {
    console.warn('[License] Failed to fetch API key:', err?.message || 'INTERNAL');
    cachedKey = null;
    cacheExpiry = 0;
    return null;
  }
}

/**
 * Redeem a license key purchased externally.
 * Returns the plan info on success or throws on failure.
 */
export async function redeemLicenseKey(licenseKey: string): Promise<RedeemResponse> {
  const redeem = httpsCallable<{ licenseKey: string }, RedeemResponse>(functions, 'redeemLicenseKey');
  const result = await redeem({ licenseKey });
  // After successful redemption, fetch the API key
  await fetchApiKey();
  return result.data;
}

/**
 * Check if current user has an active license.
 * This is a lightweight check against Firestore (cached by Firebase SDK).
 */
export async function checkLicenseStatus(): Promise<{
  isPaid: boolean;
  plan?: string;
  expiresAt?: string;
}> {
  const user = auth.currentUser;
  if (!user) return { isPaid: false };

  try {
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const db = getFirestore(app);
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const data = userDoc.data();

    if (!data) return { isPaid: false };

    if (data.isAdmin || data.isPaid) {
      return {
        isPaid: true,
        plan: data.subscription?.plan || 'pro',
        expiresAt: data.subscription?.expiresAt?.toDate?.()?.toISOString(),
      };
    }

    if (data.subscription?.status === 'active') {
      const expires = data.subscription.expiresAt?.toDate?.();
      if (!expires || expires > new Date()) {
        return {
          isPaid: true,
          plan: data.subscription.plan,
          expiresAt: expires?.toISOString(),
        };
      }
    }

    return { isPaid: false };
  } catch {
    return { isPaid: false };
  }
}

/** Clear cached key on logout */
export function clearKeyCache() {
  cachedKey = null;
  cacheExpiry = 0;
}

/**
 * Listen for messages from the BluePrint Chrome extension.
 * The extension can request the API key if user is authenticated and paid.
 */
export function setupExtensionBridge() {
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== 'BLUEPRINT_EXT_REQUEST') return;

    const { action } = event.data;

    if (action === 'GET_API_KEY') {
      const key = await fetchApiKey();
      window.postMessage({
        type: 'BLUEPRINT_EXT_RESPONSE',
        action: 'API_KEY',
        data: key ? { apiKey: key } : { error: 'No active license' },
      }, '*');
    }

    if (action === 'CHECK_LICENSE') {
      const status = await checkLicenseStatus();
      window.postMessage({
        type: 'BLUEPRINT_EXT_RESPONSE',
        action: 'LICENSE_STATUS',
        data: status,
      }, '*');
    }
  });
}
