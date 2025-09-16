import type { Handler } from "@netlify/functions";
const REQUIRED = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","GOOGLE_API_KEY","GCP_PROJECT_ID","GCS_INPUT_BUCKET","GCS_OUTPUT_BUCKET"];
export const handler: Handler = async () => {
  const missing = REQUIRED.filter(k => !process.env[k]);
  return { statusCode: missing.length ? 500 : 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok: missing.length === 0, missing }) };
};
