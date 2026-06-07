# Stirling PDF Cloud Run Deployment Guide

This guide explains how to deploy Stirling PDF as a private Cloud Run service for BlueprintPDF.

## Prerequisites

- Google Cloud SDK installed and configured
- gcloud authenticated: `gcloud auth login`
- Project selected: `gcloud config set project blueprintpdf`
- Docker installed

## Step 1: Clone and Build Stirling PDF

```bash
# Clone the repository
git clone https://github.com/Stirling-Tools/stirling-pdf.git
cd stirling-pdf

# Build the Docker image
docker build -t stirling-pdf:latest .

# Tag for Google Artifact Registry
docker tag stirling-pdf:latest us-central1-docker.pkg.dev/blueprintpdf/stirling-pdf/stirling-pdf:latest
```

## Step 2: Push to Google Artifact Registry

```bash
# Create the repository (if it doesn't exist)
gcloud artifacts repositories create stirling-pdf \
    --repository-format=docker \
    --location=us-central1 \
    --description="Stirling PDF Docker repository"

# Authenticate Docker for Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Push the image
docker push us-central1-docker.pkg.dev/blueprintpdf/stirling-pdf/stirling-pdf:latest
```

## Step 3: Deploy to Cloud Run (Private)

```bash
# Deploy as a private service
gcloud run deploy stirling-pdf \
    --image=us-central1-docker.pkg.dev/blueprintpdf/stirling-pdf/stirling-pdf:latest \
    --platform=managed \
    --region=us-central1 \
    --no-allow-unauthenticated \
    --memory=2Gi \
    --cpu=2 \
    --max-instances=10 \
    --timeout=600 \
    --set-env-vars=SECURITY_CUSTOMGLOBALAPIKEY=your-random-api-key-here \
    --set-env-vars=SECURITY_ENABLELOGIN=false \
    --set-env-vars=SECURITY_ALLOWOFFLINE=false
```

## Step 4: Configure IAM Access

The PDF Gateway service needs permission to call this private Stirling service.

```bash
# Get the service account for the PDF Gateway (or create one)
# For Firebase Functions, use the App Engine default service account
PROJECT_NUMBER=$(gcloud projects describe blueprintpdf --format='value(projectNumber)')
GATEWAY_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant the gateway service account permission to invoke the Cloud Run service
gcloud run services add-iam-policy-binding stirling-pdf \
    --region=us-central1 \
    --member="serviceAccount:${GATEWAY_SA}" \
    --role="roles/run.invoker"
```

## Step 5: Get the Service URL

```bash
# Get the service URL
STIRLING_URL=$(gcloud run services describe stirling-pdf \
    --region=us-central1 \
    --format='value(status.url)')

echo "Stirling PDF URL: $STIRLING_URL"
```

## Step 6: Configure Environment Variables

Save the following for the PDF Gateway deployment:

- `STIRLING_URL`: The URL from Step 5
- `STIRLING_API_KEY`: The same value you set for `SECURITY_CUSTOMGLOBALAPIKEY`

## Security Notes

1. **Private Service**: The `--no-allow-unauthenticated` flag ensures only authenticated requests can access the service.

2. **API Key**: The `SECURITY_CUSTOMGLOBALAPIKEY` environment variable adds an additional layer of security. Store this securely in your PDF Gateway's environment variables.

3. **IAM**: Only the PDF Gateway service account has `roles/run.invoker` permission, preventing direct access from other services.

4. **No Login**: `SECURITY_ENABLELOGIN=false` disables Stirling's built-in authentication since we handle auth at the gateway layer.

## Testing the Deployment

```bash
# Test the service (requires authentication)
curl -X POST "$STIRLING_URL/api/v1/misc/compress-pdf" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "X-API-KEY: your-api-key" \
  -F "fileInput=@test.pdf"
```

## Scaling Configuration

Adjust these parameters based on your needs:

- `--memory`: Default 2Gi, increase for large PDFs
- `--cpu`: Default 2, increase for CPU-intensive operations (OCR)
- `--max-instances`: Default 10, adjust based on expected load
- `--timeout`: Default 600s (10 minutes), maximum is 3600s (1 hour)

## Cost Estimation

- Instance type: 2 vCPU, 2Gi RAM
- Estimated cost: ~$0.04 per instance-hour
- With 10 max instances: ~$0.40 per hour at peak
- Cloud Run is pay-per-use, so you only pay for actual execution time

## Monitoring

```bash
# View logs
gcloud logs tail /projects/blueprintpdf/logs/stirling-pdf

# View metrics
gcloud monitoring dashboards create
```
