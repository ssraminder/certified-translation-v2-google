import { createClient } from "@supabase/supabase-js";
import type { Storage } from "@google-cloud/storage";

let credsCache: any | null = null;
let storageSingleton: Storage | null = null;

export async function loadGcpCreds() {
  if (credsCache) return credsCache;
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data, error } = await supabase
    .storage.from("secrets")
    .download("gcp_sa.json");
  if (error) throw new Error("Unable to load secrets/gcp_sa.json: " + error.message);
  const text = await data.text();
  try {
    credsCache = JSON.parse(text);
  } catch {
    throw new Error("gcp_sa.json is not valid JSON");
  }
  return credsCache;
}

export async function getStorage(StorageCtor: { new(opts:any): Storage }) {
  if (storageSingleton) return storageSingleton;
  const creds = await loadGcpCreds();
  storageSingleton = new StorageCtor({
    projectId: process.env.GCP_PROJECT_ID,
    credentials: creds,
  });
  return storageSingleton;
}
