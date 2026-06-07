const { onCall } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const FormData = require('form-data');

// Initialize Firebase Admin
admin.initializeApp();

// Cloud Run service configuration
const STIRLING_URL = process.env.STIRLING_URL || 'https://private-stirling-xxx.a.run.app';
const STIRLING_API_KEY = process.env.STIRLING_API_KEY;

/**
 * PDF Gateway - Proxy to private Stirling PDF service
 * Validates Firebase Auth, enforces business rules, forwards to Stirling
 */
exports.pdfGateway = onCall(async (request) => {
  try {
    // 1. Validate Firebase Auth
    const authHeader = request.rawRequest?.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Unauthorized: Missing or invalid authorization header');
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    
    // 2. Validate paid status (optional - uncomment if you have paid tier)
    // if (!decodedToken.paid) {
    //   throw new Error('Upgrade required: This feature requires a paid subscription');
    // }

    // 3. Extract parameters
    const { operation, pdfBase64, params } = request.data;
    
    if (!operation || !pdfBase64) {
      throw new Error('Missing required parameters: operation and pdfBase64');
    }

    // 4. Map operation to Stirling endpoint
    const ENDPOINT_MAP = {
      'COMPRESS': '/api/v1/misc/compress-pdf',
      'REDACT': '/api/v1/security/auto-redact',
      'OCR': '/api/v1/misc/ocr',
      'TO-WORD': '/api/v1/convert/pdf/word',
      'TO-PPT': '/api/v1/convert/pdf/presentation',
      'TO-HTML': '/api/v1/convert/pdf/html',
      'REPAIR': '/api/v1/misc/repair-pdf',
      'ENCRYPT': '/api/v1/security/encrypt-pdf',
      'PDF-A': '/api/v1/misc/pdf-to-pdfa',
    };

    const endpoint = ENDPOINT_MAP[operation.toUpperCase()];
    if (!endpoint) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    // 5. Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // 6. Construct FormData for Stirling
    const form = new FormData();
    form.append('fileInput', pdfBuffer, { filename: 'document.pdf', contentType: 'application/pdf' });
    
    // Add additional parameters
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        form.append(key, value);
      });
    }

    // 7. Forward to private Stirling Cloud Run
    const stirlingUrl = `${STIRLING_URL}${endpoint}`;
    
    const response = await fetch(stirlingUrl, {
      method: 'POST',
      headers: {
        // Temporarily disabled API key requirement for testing
        // 'X-API-KEY': STIRLING_API_KEY,
        ...form.getHeaders()
      },
      body: form,
      timeout: 300000 // 5 minute timeout for heavy operations
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stirling Error (${response.status}): ${errorText}`);
    }

    // 8. Return result as base64
    const resultBuffer = await response.buffer();
    const resultBase64 = resultBuffer.toString('base64');
    
    // Determine content type
    const contentType = response.headers.get('content-type') || 'application/pdf';
    const isConversion = contentType !== 'application/pdf';

    return {
      success: true,
      data: resultBase64,
      contentType: contentType,
      isConversion: isConversion
    };

  } catch (error) {
    console.error('Gateway Error:', error);
    throw new Error(error.message || 'Gateway operation failed');
  }
});
