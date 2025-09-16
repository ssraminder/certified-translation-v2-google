import type { Handler } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Storage } from "@google-cloud/storage";
import { createClient } from "@supabase/supabase-js";
import { getStorage } from "./_shared/gcpCreds";

const MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";
console.log("[gemini] model:", MODEL);

function json(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, body: JSON.stringify(body) };
}

async function loadOcrText(bucket: string, prefix: string, cap = 50000) {
  const storage = await getStorage(Storage);
  const [files] = await storage.bucket(bucket).getFiles({ prefix });
  const jsonFiles = files
    .filter((file) => file.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name));

  let combined = "";
  for (const file of jsonFiles) {
    if (combined.length >= cap) break;
    const [buffer] = await file.download();
    const payload = JSON.parse(buffer.toString("utf8"));
    for (const response of payload.responses || []) {
      const text = response?.fullTextAnnotation?.text || "";
      if (!text) continue;
      const remaining = Math.max(0, cap - combined.length);
      combined += text.slice(0, remaining);
      if (text.length > remaining) {
        combined += "\n[TRUNCATED]\n";
      }
      if (combined.length >= cap) break;
    }
  }
  return combined.trim();
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const body = fenced || text;
  const obj = body.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : body;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return json(405, { status: "error", message: "Method GET required" });
    }

    const API_KEY = process.env.GOOGLE_API_KEY;
    if (!API_KEY) {
      return json(500, { status: "error", message: "GOOGLE_API_KEY missing" });
    }

    const outputBucket = process.env.GCS_OUTPUT_BUCKET;
    if (!outputBucket) {
      return json(500, { status: "error", message: "GCS_OUTPUT_BUCKET missing" });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, { status: "error", message: "Supabase configuration missing" });
    }

    const quote_id = (event.queryStringParameters?.quote_id || "").trim();
    const file_name = (event.queryStringParameters?.file_name || "").trim();
    if (!quote_id || !file_name) {
      return json(400, { status: "error", message: "quote_id and file_name required" });
    }

    const prefix = `vision/${quote_id}/${file_name}/`;
    const text = await loadOcrText(outputBucket, prefix);
    if (!text) {
      return json(404, { status: "error", message: "No OCR text found" });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL });

    const DOC_TYPES = [
      "passport",
      "birth_certificate",
      "marriage_certificate",
      "divorce_certificate",
      "driver_license",
      "id_card",
      "pr_card",
      "work_permit",
      "study_permit",
      "diploma",
      "transcript",
      "police_certificate",
      "bank_statement",
      "payslip",
      "utility_bill",
      "tax_return",
      "letter",
      "invoice",
      "other",
    ];

    const prompt = `Return STRICT JSON only (no prose).
Shape:
{
  "doc_type": one of ${JSON.stringify(DOC_TYPES)},
  "primary_language": string,             // language/locale code
  "secondary_languages": string[],
  "names": string[],                      // max 5
  "confidence": number                    // 0..1
}
Document text:
-----
${text}
-----`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      return json(502, { status: "error", message: `Bad JSON from model: ${raw}` });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const update = {
      gem_doc_type: DOC_TYPES.includes(parsed.doc_type) ? parsed.doc_type : "other",
      gem_language_code: parsed.primary_language || null,
      gem_names: parsed.names || null,
      gem_status: "success",
      gem_message: `Gemini classification complete (${MODEL})`,
      gem_model: MODEL,
      gem_completed_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("quote_files")
      .update(update)
      .eq("quote_id", quote_id)
      .eq("file_name", file_name);

    if (error) {
      return json(500, { status: "error", message: `DB error: ${error.message}` });
    }

    return json(200, {
      status: "ok",
      message: `Gemini classification complete (${MODEL})`,
      update,
    });
  } catch (err: any) {
    console.error("[gemini] run-gemini-analyze error:", err);
    return json(500, { status: "error", message: err?.message || String(err) });
  }
};

export default handler;
