const { onCall } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const FormData = require('form-data');

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
      'FILE-TO-PDF': '/api/v1/convert/file/pdf',
    };

    const op = operation.toUpperCase();
    const endpoint = ENDPOINT_MAP[op];
    if (!endpoint) {
      throw new Error(`Unknown operation: ${operation}`);
    }

    // Some Stirling conversion endpoints require an explicit outputFormat,
    // otherwise they reject the request with HTTP 400.
    const REQUIRED_OUTPUT_FORMAT = {
      'TO-WORD': 'docx',
      'TO-PPT': 'pptx',
    };

    // Params handled client-side that must NOT be forwarded to Stirling.
    const SKIP_PARAMS = new Set(['pages', 'range', 'text']);

    // 5. Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // Determine correct filename and mime type based on operation
    let uploadFilename = 'document.pdf';
    let uploadContentType = 'application/pdf';

    // If we are sending a Word document TO Stirling to become a PDF
    if (op === 'FILE-TO-PDF') {
      uploadFilename = 'document.docx';
      uploadContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // 6. Construct FormData for Stirling
    const form = new FormData();
    form.append('fileInput', pdfBuffer, { 
      filename: uploadFilename, 
      contentType: uploadContentType 
    });

    // Add additional parameters (excluding client-side-only params)
    const forwardedParams = {};
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (SKIP_PARAMS.has(key.toLowerCase())) return;
        form.append(key, value);
        forwardedParams[key.toLowerCase()] = value;
      });
    }

    // Special handling for REDACT: convert client's 'text' to Stirling's 'listOfText' array
    if (op === 'REDACT' && params && params.text) {
      // Stirling expects listOfText as a JSON array of strings
      form.append('listOfText', JSON.stringify([params.text]));
    }

    // Inject required outputFormat if the caller didn't supply one.
    if (REQUIRED_OUTPUT_FORMAT[op] && !forwardedParams['outputformat']) {
      form.append('outputFormat', REQUIRED_OUTPUT_FORMAT[op]);
    }

    // 7. Forward to private Stirling Cloud Run
    const stirlingUrl = `${STIRLING_URL}${endpoint}`;
    
    // Only send the API key header if a real key is configured. When Stirling's
    // login/security is disabled, no key is needed and the header is omitted.
    const hasApiKey = STIRLING_API_KEY && STIRLING_API_KEY !== 'YOUR_STIRLING_API_KEY_HERE';
    const stirlingHeaders = { ...form.getHeaders() };
    if (hasApiKey) {
      stirlingHeaders['X-API-KEY'] = STIRLING_API_KEY;
    }

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    const response = await fetch(stirlingUrl, {
      method: 'POST',
      headers: stirlingHeaders,
      body: form,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

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
