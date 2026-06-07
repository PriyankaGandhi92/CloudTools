import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface CloudOperation {
  endpoint: string;
  isFormatConversion: boolean; // True for TO-WORD, TO-HTML, etc.
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
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64');

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
    const resultBuffer = Buffer.from(response.data, 'base64');

    // If it's a conversion (Word/PPT), return a Blob for download
    if (response.isConversion) {
      const blob = new Blob([resultBuffer], { type: response.contentType || 'application/octet-stream' });
      return { success: true, data: blob, isConversion: true };
    } 
    
    // If it's a PDF mutation, return an ArrayBuffer to replace the canvas
    return { success: true, data: resultBuffer.buffer, isConversion: false };

  } catch (error: any) {
    console.error('Cloud command error:', error);
    return { success: false, error: error.message || 'Failed to execute cloud command' };
  }
}
