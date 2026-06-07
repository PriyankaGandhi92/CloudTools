import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

// ============================================================================
// FIREBASE FUNCTIONS - AI API CALLS (SERVER-SIDE)
// ============================================================================

/**
 * Call Firebase Function for Gemini Vision - PDF Annotation
 */
export async function callGeminiAnnotate(params: {
  imageBase64: string;
  prompt: string;
  pageWidth?: number;
  pageHeight?: number;
}) {
  try {
    const geminiAnnotate = httpsCallable(functions, 'geminiAnnotate');
    const result = await geminiAnnotate(params);
    return result.data as { success: boolean; result: string };
  } catch (error: any) {
    console.error('Firebase function error (geminiAnnotate):', error);
    throw new Error(error.message || 'Failed to analyze with Gemini');
  }
}

/**
 * Call Firebase Function for Gemini Vision - BIM Analysis
 */
export async function callGeminiBimAnalyze(params: {
  imageBase64: string;
  bimType: 'door' | 'wall' | 'supplier' | 'fire-rating';
}) {
  try {
    const geminiBimAnalyze = httpsCallable(functions, 'geminiBimAnalyze');
    const result = await geminiBimAnalyze(params);
    return result.data as { success: boolean; data: any };
  } catch (error: any) {
    console.error('Firebase function error (geminiBimAnalyze):', error);
    throw new Error(error.message || 'Failed to analyze BIM image');
  }
}

/**
 * Call Firebase Function for Gemini Text - PDF Summary
 */
export async function callGeminiSummarize(params: {
  text: string;
  documentName: string;
}) {
  try {
    const geminiSummarize = httpsCallable(functions, 'geminiSummarize');
    const result = await geminiSummarize(params);
    return result.data as { success: boolean; summary: string };
  } catch (error: any) {
    console.error('Firebase function error (geminiSummarize):', error);
    throw new Error(error.message || 'Failed to summarize PDF');
  }
}

/**
 * Call Firebase Function for Gemini Text - Engineering Parameters
 */
export async function callGeminiEngParams(params: {
  text: string;
  documentName: string;
}) {
  try {
    const geminiEngParams = httpsCallable(functions, 'geminiEngParams');
    const result = await geminiEngParams(params);
    return result.data as { success: boolean; data: { parameters: any[]; notes: string } };
  } catch (error: any) {
    console.error('Firebase function error (geminiEngParams):', error);
    throw new Error(error.message || 'Failed to extract engineering parameters');
  }
}
