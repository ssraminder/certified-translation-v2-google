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
  storage_path?: string; // e.g., "orders/CS00515/JapanDL.pdf"
  public_url?: string | null;
};

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" })
      };
    }

    let b: SaveQuoteBody;
    try {
      b = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Body is not valid JSON" })
      };
    }

    if (!b.quote_id) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing quote_id" })
      };
    }

    // --- quote_submissions manual upsert ---
    {
      const { data: existing, error: selErr } = await supabase
        .from("quote_submissions")
        .select("quote_id")
        .eq("quote_id", b.quote_id)
        .maybeSingle();
      if (selErr) throw new Error(`select quote_submissions: ${selErr.message}`);

      const payload = {
        quote_id: b.quote_id,
        name: b.name ?? null,
        email: b.email ?? null,
        phone: b.phone ?? null,
        intended_use: b.intended_use ?? null,
        source_language: b.source_language ?? null,
        target_language: b.target_language ?? null,
      };

      if (!existing) {
        const { error } = await supabase.from("quote_submissions").insert(payload);
        if (error) throw new Error(`insert quote_submissions: ${error.message}`);
      } else {
        const { error } = await supabase.from("quote_submissions").update(payload).eq("quote_id", b.quote_id);
        if (error) throw new Error(`update quote_submissions: ${error.message}`);
      }
    }

    // --- quote_files manual upsert (optional) ---
    if (b.file_name || b.storage_path || b.public_url !== undefined) {
      const { data: f, error: selErr } = await supabase
        .from("quote_files")
        .select("quote_id,file_name")
        .eq("quote_id", b.quote_id)
        .eq("file_name", b.file_name ?? "")
        .maybeSingle();
      if (selErr) throw new Error(`select quote_files: ${selErr.message}`);

      const payload = {
        quote_id: b.quote_id,
        file_name: b.file_name ?? null,
        storage_path: b.storage_path ?? null,
        public_url: b.public_url ?? null,
        gem_status: "pending",
        gem_message: "file saved",
      };

      if (!f) {
        const { error } = await supabase.from("quote_files").insert(payload);
        if (error) throw new Error(`insert quote_files: ${error.message}`);
      } else {
        const { error } = await supabase
          .from("quote_files")
          .update(payload)
          .eq("quote_id", b.quote_id)
          .eq("file_name", b.file_name ?? "");
        if (error) throw new Error(`update quote_files: ${error.message}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true })
    };
  } catch (err: any) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: err?.message || String(err) })
    };
  }
};
