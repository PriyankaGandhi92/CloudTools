import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface CloudOperation {
  endpoint: string;
  isFormatConversion: boolean; // True for TO-WORD, TO-HTML, etc.
}

// Browser-safe base64 helpers (no Node Buffer). Chunked to avoid
// "Maximum call stack size exceeded" on large PDFs.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB chunks
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

const OPERATION_MAP: Record<string, CloudOperation> = {
  'COMPRESS': { endpoint: '/api/v1/misc/compress-pdf', isFormatConversion: false },
  'REDACT': { endpoint: '/api/v1/security/auto-redact', isFormatConversion: false },
  'OCR': { endpoint: '/api/v1/misc/ocr', isFormatConversion: false },
  'TO-WORD': { endpoint: '/api/v1/convert/pdf/word', isFormatConversion: true },
  'TO-PPT': { endpoint: '/api/v1/convert/pdf/presentation', isFormatConversion: true },
  'TO-HTML': { endpoint: '/api/v1/convert/pdf/html', isFormatConversion: true },
  'REPAIR': { endpoint: '/api/v1/misc/repair-pdf', isFormatConversion: false },
  'ENCRYPT': { endpoint: '/api/v1/security/encrypt-pdf', isFormatConversion: false },
  'PDF-A': { endpoint: '/api/v1/misc/pdf-to-pdfa', isFormatConversion: false },
  'FIND-REPLACE': { endpoint: '/api/v1/misc/find-replace', isFormatConversion: false },
  'FILE-TO-PDF': { endpoint: '/api/v1/convert/file/pdf', isFormatConversion: true },
};

export async function executeCloudCommand(
  operation: string, 
  pdfBuffer: ArrayBuffer, 
  params: Record<string, string>
): Promise<{ success: boolean; data?: ArrayBuffer | Blob; isConversion?: boolean; error?: string }> {
  
  const opConfig = OPERATION_MAP[operation.toUpperCase()];
  if (!opConfig) return { success: false, error: 'Unknown operation' };

  try {
    // Convert ArrayBuffer to base64 for Firebase Functions
    const pdfBase64 = arrayBufferToBase64(pdfBuffer);

    // Call Firebase Functions v2 callable
    const pdfGatewayCallable = httpsCallable(functions, 'pdfGateway');
    const result = await pdfGatewayCallable({
      operation: operation.toUpperCase(),
      pdfBase64: pdfBase64,
      params: params
    });

    const response = result.data as { success: boolean; data?: string; contentType?: string; isConversion?: boolean; error?: string };

    if (!response.success || !response.data) {
      return { success: false, error: response.error || 'Operation failed' };
    }

    // Convert base64 back to ArrayBuffer/Blob
    const resultBuffer = base64ToArrayBuffer(response.data);

    // If it's a conversion (Word/PPT), return a Blob for download
    if (response.isConversion) {
      const blob = new Blob([resultBuffer], { type: response.contentType || 'application/octet-stream' });
      return { success: true, data: blob, isConversion: true };
    } 
    
    // If it's a PDF mutation, return an ArrayBuffer to replace the canvas
    return { success: true, data: resultBuffer, isConversion: false };

  } catch (error: any) {
    console.error('Cloud command error:', error);
    return { success: false, error: error.message || 'Failed to execute cloud command' };
  }
}
