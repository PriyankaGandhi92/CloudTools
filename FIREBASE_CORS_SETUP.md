# Firebase Storage CORS Configuration for OpenCV.js

## Why This Is Needed

The `PhotoAnalyzerDialog.tsx` component uses OpenCV.js to perform image analysis on task photos. OpenCV reads image data from the canvas, which requires the image to be loaded with proper CORS headers.

If your photos are stored in Firebase Storage, you'll see this error in the console when trying to run defect detection:

```
SecurityError: The operation is insecure
Tainted canvases may not be exported
```

## How to Fix

You need to configure your Firebase Storage bucket's CORS policy to allow your web app's domain.

### Step 1: Create a `cors.json` file

Create a file named `cors.json` in your project root with the following content:

```json
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

**For production**, replace `"*"` with your actual domain for better security:

```json
[
  {
    "origin": ["https://blueprintpdf.web.app", "http://localhost:5173"],
    "method": ["GET"],
    "maxAgeSeconds": 3600
  }
]
```

### Step 2: Install gsutil (if not already installed)

The Google Cloud Storage CLI tool is required to set CORS policies.

- **macOS**: `brew install gsutil`
- **Windows**: Download from https://cloud.google.com/storage/docs/gsutil_install
- **Linux**: Follow the guide at https://cloud.google.com/storage/docs/gsutil_install#linux

### Step 3: Authenticate with Google Cloud

```bash
gcloud auth login
```

### Step 4: Apply the CORS policy

Run the following command, replacing `your-bucket-name` with your actual Firebase Storage bucket name:

```bash
gsutil cors set cors.json gs://your-bucket-name
```

To find your bucket name, check your Firebase project settings or run:
```bash
gsutil ls
```

### Step 5: Verify the CORS policy

```bash
gsutil cors get gs://your-bucket-name
```

## Testing

After applying the CORS policy:

1. Hard-refresh your web app
2. Navigate to a task with attached photos
3. Click on a photo thumbnail to open the Photo Analyzer
4. Click "Highlight Defects & Cracks"
5. The edge detection should work without CORS errors

## Notes

- CORS changes may take a few minutes to propagate
- If you're using Firebase Emulator for local development, CORS is usually not enforced
- The `crossOrigin="anonymous"` attribute is already set on the `<img>` tag in `PhotoAnalyzerDialog.tsx`
