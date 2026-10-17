#!/usr/bin/env bash
# Deploy QuestLearn AI to Cloud Run with Vertex AI, Firestore and Cloud Storage.
# Usage: PROJECT_ID=my-proj REGION=asia-south1 ./scripts/deploy-cloud-run.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SERVICE="${SERVICE:-questlearn-ai}"
BUCKET="${BUCKET:-${PROJECT_ID}-uploads}"
SA_NAME="${SA_NAME:-questlearn-run}"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
MODEL="${GEMINI_MODEL:-gemini-3.5-flash}"

gcloud config set project "$PROJECT_ID"

echo "› Enabling APIs"
gcloud services enable run.googleapis.com aiplatform.googleapis.com firestore.googleapis.com \
  storage.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com iamcredentials.googleapis.com

echo "› Firestore (native mode) — skipped if it already exists"
gcloud firestore databases create --location="$REGION" --type=firestore-native 2>/dev/null || true

echo "› Private bucket for uploads and generated assets"
gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access \
  --public-access-prevention 2>/dev/null || true
# A real file, not <(...): gcloud reads the path after the process-substitution pipe has closed.
LIFECYCLE="$(mktemp)"
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":180}}]}' > "$LIFECYCLE"
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file="$LIFECYCLE"
rm -f "$LIFECYCLE"

echo "› Service account with least-privilege roles"
gcloud iam service-accounts create "$SA_NAME" --display-name="QuestLearn Cloud Run" 2>/dev/null || true
for role in roles/aiplatform.user roles/datastore.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA}" --role="$role" --condition=None >/dev/null
done
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" --member="serviceAccount:${SA}" --role=roles/storage.objectAdmin >/dev/null
# Needed to sign short-lived download URLs with the runtime service account
gcloud iam service-accounts add-iam-policy-binding "$SA" --member="serviceAccount:${SA}" --role=roles/iam.serviceAccountTokenCreator >/dev/null

echo "› Let Cloud Build (runs as the default compute service account) read the source and push the image"
# New projects no longer grant this by default; without it the build fails with storage.objects.get 403.
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None >/dev/null

echo "› Building and deploying"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$SA" \
  --allow-unauthenticated \
  --memory 1Gi --cpu 1 --timeout 300 --concurrency 40 --min-instances 0 --max-instances 5 \
  --set-env-vars "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=us,GEMINI_MODEL=${MODEL},QL_DB=firestore,GCS_BUCKET=${BUCKET}"

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo "✓ Deployed: $URL"
curl -fsS "$URL/api/health" && echo
