import type { Handler } from "@netlify/functions";
import { GoogleGenerativeAI } from "@google/generative-ai/server";
import { Storage } from "@google-cloud/storage";
import { getStorage } from "./_shared/gcpCreds";
import { createClient } from "@supabase/supabase-js";

const OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET!;
const DOC_TYPES = [
  "passport","birth_certificate","marriage_certificate","divorce_certificate",
  "driver_license","id_card","pr_card","work_permit","study_permit",
  "diploma","transcript","police_certificate","bank_statement","payslip",
  "utility_bill","tax_return","letter","invoice","other"
];

async function loadOcrText(prefix: string, cap = 50000) {
  const storage = await getStorage(Storage);
  const [files] = await storage.bucket(OUTPUT_BUCKET).getFiles({ prefix });
  const jsonFiles = files.filter(f => f.name.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name));
  let all = "";
  for (const jf of jsonFiles) {
    if (all.length >= cap) break;
    const [buf] = await jf.download();
    const payload = JSON.parse(buf.toString("utf8"));
    for (const r of (payload.responses || [])) {
      const t = r?.fullTextAnnotation?.text || "";
      if (!t) continue;
      const need = Math.max(0, cap - all.length);
      all += t.slice(0, need) + (t.length > need ? "\n[TRUNCATED]\n" : "");
    }
  }
  return all.trim();
}

function coerceJson(text: string) {
  const fence = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const body = fence || text;
  const obj = body.match(/\{[\s\S]*\}/);
  return obj ? obj[0] : body;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
    const quote_id = (event.queryStringParameters?.quote_id || "").trim();
    const file_name = (event.queryStringParameters?.file_name || "").trim();
    if (!quote_id || !file_name) return { statusCode: 400, body: "quote_id and file_name required" };

    const prefix = `vision/${quote_id}/${file_name}/`;
    const text = await loadOcrText(prefix);
    if (!text) return { statusCode: 404, body: "No OCR text found" };

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-pro" });

    const prompt = `You are an assistant that outputs STRICT JSON ONLY (no prose).
Return:
{
  "doc_type": one of ${JSON.stringify(DOC_TYPES)},
  "primary_language": string (IETF/ISO code),
  "secondary_languages": string[],
  "names": string[] (max 5),
  "confidence": number between 0 and 1
}
Document text:
-----
${text}
-----`;

    const res = await model.generateContent([{ text: prompt }]);
    const raw = res.response.text().trim();
    let parsed: any;
    try { parsed = JSON.parse(coerceJson(raw)); }
    catch { return { statusCode: 502, body: `Bad JSON from model: ${raw}` }; }

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const update = {
      gem_doc_type: DOC_TYPES.includes(parsed.doc_type) ? parsed.doc_type : "other",
      gem_language_code: parsed.primary_language || null,
      gem_names: parsed.names || null,
      gem_status: "success",
      gem_message: "Gemini classification complete",
      gem_model: "gemini-2.0-pro",
      gem_completed_at: new Date().toISOString(),
    };
    const { error } = await supa.from("quote_files")
      .update(update).eq("quote_id", quote_id).eq("file_name", file_name);
    if (error) return { statusCode: 500, body: `DB error: ${error.message}` };

    return { statusCode: 200, body: JSON.stringify({ ok: true, update }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || String(e) }) };
  }
};
