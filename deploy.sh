#!/bin/bash
set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE="sigma"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE:latest"
API_KEY=$(grep VITE_GEMINI_API_KEY .env | cut -d= -f2)

echo "Enabling required services..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

echo "Building and pushing image via Cloud Build..."
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions _VITE_GEMINI_API_KEY="$API_KEY"

echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --memory 256Mi \
  --cpu 1 \
  --timeout 60 \
  --max-instances 10 \
  --allow-unauthenticated

echo "Done! Service URL:"
gcloud run services describe "$SERVICE" \
  --platform managed \
  --region "$REGION" \
  --format "value(status.url)"
