# Firebase Functions Setup Guide

## Prerequisites
- Firebase CLI installed: `npm install -g firebase-tools`
- Logged in to Firebase: `firebase login`

## Step 1: Install Dependencies in Functions Folder
```bash
cd functions
npm install
cd ..
```

## Step 2: Set Up API Key Secrets

Run these commands to set your API keys as Firebase Secrets:

```bash
# Set Gemini API Key
firebase functions:secrets:set GEMINI_API_KEY

# When prompted, paste your Gemini API key (starts with AIza...)
```

## Step 3: Deploy Functions
```bash
firebase deploy --only functions
```

## Step 4: Verify Deployment
After deployment, verify functions are running:
```bash
firebase functions:log
```

## Firestore Schema for Usage Tracking

The functions automatically create the following Firestore collections:

### `usage/{uid}`
Tracks per-user rate limiting:
```javascript
{
  requests: {
    "GEMINI_VISION": [timestamp1, timestamp2, ...],
    "GEMINI_TEXT": [timestamp1, ...],
    "BIM_ANALYSIS": [timestamp1, ...]
  },
  lastUpdated: timestamp
}
```

### `daily_usage/{uid_date}`
Tracks daily usage for billing/analytics:
```javascript
{
  uid: "user_id",
  date: "2024-05-07",
  requests: 150,
  cost: 0.15,
  lastUpdated: timestamp
}
```

## Available Functions

### `geminiAnnotate`
- Purpose: PDF annotation with Gemini Vision
- Input: `{ imageBase64, prompt, pageWidth, pageHeight }`
- Output: `{ success: true, result: string }`

### `geminiBimAnalyze`
- Purpose: BIM image analysis for auto-fill
- Input: `{ imageBase64, bimType }`
- Output: `{ success: true, data: object }`

### `geminiSummarize`
- Purpose: PDF text summarization
- Input: `{ text, documentName }`
- Output: `{ success: true, summary: string }`

### `geminiEngParams`
- Purpose: Extract engineering parameters
- Input: `{ text, documentName }`
- Output: `{ success: true, data: { parameters, notes } }`

## Rate Limits

- GEMINI_VISION: 100 requests/hour
- GEMINI_TEXT: 200 requests/hour
- BIM_ANALYSIS: 50 requests/hour

## Security Features

- Firebase Auth required for all AI functions
- Subscription validation (paid users only)
- Per-user rate limiting
- Usage tracking in Firestore
- API keys stored in Firebase Secrets (never exposed to client)
