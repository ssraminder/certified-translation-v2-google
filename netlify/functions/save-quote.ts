import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

type NullableString = string | null | undefined;

type SaveQuoteBody = {
  quote_id?: string;
  name?: NullableString;
  email?: NullableString;
  phone?: NullableString;
  intended_use?: NullableString;
  source_language?: NullableString;
  target_language?: NullableString;
  file_name?: NullableString;
  storage_path?: NullableString;
  public_url?: NullableString;
};

function mustGet(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing server configuration: ${name}`);
  }
  return value;
}

const supabase = createClient(
  mustGet("SUPABASE_URL"),
  mustGet("SUPABASE_SERVICE_ROLE_KEY")
);

function normalize(value: NullableString) {
  if (value === undefined) return undefined;
  const trimmed = typeof value === "string" ? value.trim() : value;
  return trimmed === "" ? null : trimmed;
}

async function ensureQuoteId(body: SaveQuoteBody) {
  const incoming = normalize(body.quote_id);
  if (incoming) return incoming;

  const { data, error } = await supabase.rpc("get_next_cs_quote_id");
  if (error || !data) {
    throw new Error(
      `Failed to allocate quote_id${error?.message ? `: ${error.message}` : ""}`
    );
  }
  return String(data);
}

export const handler: Handler = async (event) => {
  const started = Date.now();

  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const body = event.body ? (JSON.parse(event.body) as SaveQuoteBody) : {};

    const quoteId = await ensureQuoteId(body);

    const submissionPayload: Record<string, unknown> = { quote_id: quoteId };

    const name = normalize(body.name);
    if (name !== undefined) submissionPayload.name = name;

    const email = normalize(body.email);
    if (email !== undefined) submissionPayload.email = email;

    const phone = normalize(body.phone);
    if (phone !== undefined) submissionPayload.phone = phone;

    const intendedUse = normalize(body.intended_use);
    if (intendedUse !== undefined) submissionPayload.intended_use = intendedUse;

    const sourceLanguage = normalize(body.source_language);
    if (sourceLanguage !== undefined) submissionPayload.source_language = sourceLanguage;

    const targetLanguage = normalize(body.target_language);
    if (targetLanguage !== undefined) submissionPayload.target_language = targetLanguage;

    const hasSubmissionFields = Object.keys(submissionPayload).length > 1;

    if (hasSubmissionFields) {
      const { error } = await supabase
        .from("quote_submissions")
        .upsert(submissionPayload, { onConflict: "quote_id" });
      if (error) {
        throw new Error(`DB upsert quote_submissions: ${error.message}`);
      }
    }

    const fileName = normalize(body.file_name);
    const storagePath = normalize(body.storage_path);
    const publicUrl = normalize(body.public_url);

    if (fileName || storagePath || publicUrl) {
      if (!fileName) {
        throw new Error("file_name is required when storing file metadata");
      }

      const filePayload: Record<string, unknown> = {
        quote_id: quoteId,
        file_name: fileName,
        gem_status: "pending",
        gem_message: "file saved",
      };

      if (storagePath !== undefined) filePayload.storage_path = storagePath;
      if (publicUrl !== undefined) filePayload.public_url = publicUrl;

      const { error } = await supabase
        .from("quote_files")
        .upsert(filePayload, { onConflict: "quote_id,file_name" });
      if (error) {
        throw new Error(`DB upsert quote_files: ${error.message}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, quote_id: quoteId, ms: Date.now() - started }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: error?.message || "Unknown error" }),
    };
  }
};
