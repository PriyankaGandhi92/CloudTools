# PDF Gateway Deployment Guide

This guide explains how to deploy the PDF Gateway as a Firebase Functions v2 service that acts as a secure proxy to the private Stirling PDF service.

## Prerequisites

- Firebase CLI installed: `npm install -g firebase-tools`
- Firebase authenticated: `firebase login`
- Project selected: `firebase use blueprintpdf`
- Stirling PDF already deployed (see STIRLING_DEPLOYMENT.md)

## Step 1: Install Dependencies

```bash
cd functions
npm install firebase-admin firebase-functions node-fetch form-data
```

## Step 2: Configure Environment Variables

Create or update `functions/.env`:

```bash
# Stirling PDF service URL (from STIRLING_DEPLOYMENT.md Step 5)
STIRLING_URL=https://stirling-pdf-xxx.a.run.app

# Stirling API key (same as SECURITY_CUSTOMGLOBALAPIKEY in Stirling deployment)
STIRLING_API_KEY=your-random-api-key-here
```

## Step 3: Update functions/package.json

Ensure your `functions/package.json` has the correct Firebase Functions version:

```json
{
  "name": "functions",
  "description": "Cloud Functions for BlueprintPDF",
  "scripts": {
    "serve": "firebase emulators:start --only functions",
    "shell": "firebase functions:shell",
    "start": "npm run shell",
    "deploy": "firebase deploy --only functions"
  },
  "engines": {
    "node": "18"
  },
  "main": "index.js",
  "dependencies": {
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.0.0",
    "node-fetch": "^2.7.0",
    "form-data": "^4.0.0"
  },
  "private": true
}
```

## Step 4: Update functions/index.js

Add the export for the pdf-gateway function:

```javascript
const { pdfGateway } = require('./pdf-gateway');

exports.pdfGateway = pdfGateway;
```

## Step 5: Deploy the Function

```bash
# Deploy only the pdf-gateway function
firebase deploy --only functions:pdfGateway

# Or deploy all functions
firebase deploy --only functions
```

## Step 6: Configure Firebase Hosting Rewrite

Update `firebase.json` to add the rewrite rule (see REWRITE_CONFIG.md):

```json
{
  "functions": {
    "source": "functions"
  },
  "hosting": {
    "public": "dist",
    "rewrites": [
      {
        "source": "/api/pdf-command",
        "function": "pdfGateway"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Step 7: Deploy Hosting with Rewrite

```bash
firebase deploy --only hosting
```

## Step 8: Test the Gateway

```bash
# Get a Firebase ID token (from your authenticated app)
# Then test with curl:

curl -X POST https://blueprintpdf.web.app/api/pdf-command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -d '{
    "operation": "COMPRESS",
    "pdfBase64": "BASE64_ENCODED_PDF",
    "params": {}
  }'
```

## Configuration Options

### Memory and CPU

Edit `functions/pdf-gateway.js` to adjust resources:

```javascript
exports.pdfGateway = onCall({
  memory: '2Gi',
  cpu: 2,
  timeoutSeconds: 540, // 9 minutes
  maxInstances: 10
}, async (request) => {
  // ... existing code
});
```

### Region

To deploy to a specific region:

```bash
firebase deploy --only functions:pdfGateway --region=us-central1
```

## Security Features

1. **Firebase Auth Validation**: Only authenticated Firebase users can access the gateway
2. **Paid Tier Check**: Uncomment the paid status check to enforce subscription requirements
3. **Operation Whitelist**: Only operations in ENDPOINT_MAP are allowed
4. **Private Stirling Access**: Stirling API key is never exposed to the client

## Monitoring

```bash
# View function logs
firebase functions:log

# View in Firebase Console
# https://console.firebase.google.com/project/blueprintpdf/functions/logs
```

## Cost Estimation

- Firebase Functions v2: $0.000008765 per GB-second (memory) + $0.000010491 per GHz-second (CPU)
- With 2Gi memory and 2 CPU: ~$0.00004 per invocation-second
- Typical PDF operation (30s): ~$0.0012 per operation
- Free tier: 2M invocations/month (more than enough for most use cases)

## Troubleshooting

### "Unauthorized" Error

- Ensure Firebase Auth is working in your app
- Check that the ID token is being sent in the Authorization header
- Verify the token is not expired

### "Stirling Error" 

- Check that STIRLING_URL is correct in `.env`
- Verify STIRLING_API_KEY matches the one set in Stirling deployment
- Ensure the PDF Gateway service account has `roles/run.invoker` permission on Stirling

### Timeout Errors

- Increase timeout in the `onCall` configuration
- Consider using async job mode for long operations (OCR, large conversions)

### Memory Errors

- Increase memory allocation in `onCall` configuration
- Consider implementing chunking for very large PDFs

## Async Job Mode (Future Enhancement)

For long-running operations (OCR, large conversions), implement async job mode:

1. Add job queue in Firestore
2. Return `jobId` immediately
3. Background function processes the job
4. Frontend polls for job status

This would require:
- Firestore collection: `cloudJobs`
- Background trigger function
- Job status polling endpoint in frontend
