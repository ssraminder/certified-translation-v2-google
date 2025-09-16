import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";
import { getStorage } from "./_shared/gcpCreds";

const OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET!;

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") return { statusCode: 405, body: "Method Not Allowed" };
    const quote_id = (event.queryStringParameters?.quote_id || "").trim();
    const file_name = (event.queryStringParameters?.file_name || "").trim();
    if (!quote_id || !file_name) return { statusCode: 400, body: "quote_id and file_name required" };

    const storage = await getStorage(Storage);
    const prefix = `vision/${quote_id}/${file_name}/`;
    const [files] = await storage.bucket(OUTPUT_BUCKET).getFiles({ prefix });

    const jsonFiles = files.filter(f => f.name.endsWith(".json")).sort((a,b)=>a.name.localeCompare(b.name));
    if (jsonFiles.length === 0) {
      return { statusCode: 202, body: JSON.stringify({ ok: false, status: "pending" }) };
    }

    // Aggregate text + language
    let allText = "";
    const langMap = new Map<string, number>();
    let pageCount = 0;

    for (const f of jsonFiles) {
      const [buf] = await f.download();
      const payload = JSON.parse(buf.toString("utf8"));
      const responses = payload.responses || [];
      for (const r of responses) {
        const fta = r?.fullTextAnnotation;
        if (fta?.text) allText += fta.text + "\n";
        const pages = fta?.pages || [];
        pageCount += pages.length;
        for (const p of pages) {
          const langs = p?.property?.detectedLanguages || [];
          for (const l of langs) {
            const code = l.languageCode || "und";
            const conf = Number(l.confidence || 0);
            langMap.set(code, (langMap.get(code) || 0) + conf);
          }
        }
      }
    }

    const words = allText.trim() ? allText.trim().split(/\s+/u).filter(Boolean).length : 0;
    const topLang = [...langMap.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || null;
    const complexity = pageCount > 3 ? "high" : pageCount > 1 ? "medium" : "low";

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await supa.from("quote_files").update({
      gem_status: "success",
      gem_message: "OCR via Vision async PDF",
      gem_language_code: topLang,
      gem_complexity_level: complexity,
      gem_completed_at: new Date().toISOString()
    }).eq("quote_id", quote_id).eq("file_name", file_name);

    return { statusCode: 200, body: JSON.stringify({ ok: true, pages: pageCount, totalWords: words, language: topLang }) };
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: e?.message || String(e) }) };
  }
};
