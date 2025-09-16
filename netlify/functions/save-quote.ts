import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type SaveQuoteBody = {
  quote_id: string;
  name?: string;
  email?: string;
  phone?: string;
  intended_use?: string;
  source_language?: string;
  target_language?: string;
  file_name?: string;
  storage_path?: string;
  public_url?: string | null;
};

function pickProvided<T extends object>(obj: T, keys: (keyof T)[]) {
  const out: Partial<T> = {};
  for (const k of keys) if (obj[k] !== undefined) (out as any)[k] = obj[k];
  return out;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok:false, error:"Method Not Allowed" }) };
    }

    let b: SaveQuoteBody;
    try { b = JSON.parse(event.body || "{}"); }
    catch {
      return { statusCode: 400, headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok:false, error:"Body is not valid JSON" }) };
    }
    if (!b.quote_id) {
      return { statusCode: 400, headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok:false, error:"Missing quote_id" }) };
    }

    // submissions: manual upsert
    const { data: existing, error: selErr } = await supabase
      .from("quote_submissions").select("quote_id").eq("quote_id", b.quote_id).maybeSingle();
    if (selErr) throw new Error(`select quote_submissions: ${selErr.message}`);

    if (!existing) {
      const insertPayload = {
        quote_id: b.quote_id,
        name: b.name ?? "",
        email: b.email ?? "",
        phone: b.phone ?? "",
        intended_use: b.intended_use ?? "",
        source_language: b.source_language ?? "",
        target_language: b.target_language ?? "",
      };
      const { error } = await supabase.from("quote_submissions").insert(insertPayload);
      if (error) throw new Error(`insert quote_submissions: ${error.message}`);
    } else {
      const updatePayload = pickProvided(b, [
        "name", "email", "phone", "intended_use", "source_language", "target_language"
      ]);
      if (Object.keys(updatePayload).length) {
        const { error } = await supabase
          .from("quote_submissions").update(updatePayload).eq("quote_id", b.quote_id);
        if (error) throw new Error(`update quote_submissions: ${error.message}`);
      }
    }

    // files: manual upsert (optional)
    if (b.file_name !== undefined || b.storage_path !== undefined || b.public_url !== undefined) {
      const { data: f, error: selErr2 } = await supabase
        .from("quote_files")
        .select("quote_id,file_name")
        .eq("quote_id", b.quote_id)
        .eq("file_name", b.file_name ?? "")
        .maybeSingle();
      if (selErr2) throw new Error(`select quote_files: ${selErr2.message}`);

      if (!f) {
        const insertFile = {
          quote_id: b.quote_id,
          file_name: b.file_name ?? "",
          storage_path: b.storage_path ?? "",
          public_url: b.public_url ?? null,
          gem_status: "pending",
          gem_message: "file saved",
        };
        const { error } = await supabase.from("quote_files").insert(insertFile);
        if (error) throw new Error(`insert quote_files: ${error.message}`);
      } else {
        const updateFile = pickProvided(b, ["file_name", "storage_path", "public_url"]);
        if (Object.keys(updateFile).length) {
          const { error } = await supabase
            .from("quote_files").update(updateFile)
            .eq("quote_id", b.quote_id).eq("file_name", b.file_name ?? "");
          if (error) throw new Error(`update quote_files: ${error.message}`);
        }
      }
    }

    return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:true }) };
  } catch (err: any) {
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ ok:false, error: err?.message || String(err) }) };
  }
};
