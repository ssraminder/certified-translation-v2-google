import type { Handler } from "@netlify/functions";

const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export const handler: Handler = async () => {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  return {
    statusCode: missing.length ? 500 : 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: missing.length === 0, missing }),
  };
};
