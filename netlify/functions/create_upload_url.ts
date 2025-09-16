import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return { statusCode: 405, body: "Method Not Allowed" };

    const { quote_id, file_name } = JSON.parse(event.body || "{}");
    if (!quote_id || !file_name)
      return { statusCode: 400, body: "quote_id and file_name required" };

    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const objectPath = `${quote_id}/${file_name}`; // relative to bucket 'orders'
    const { data, error } = await supa
      .storage.from("orders")
      .createSignedUploadUrl(objectPath, 60);
    if (error) return { statusCode: 500, body: error.message };

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ objectPath, token: data.token })
    };
  } catch (e: any) {
    return { statusCode: 500, body: e?.message || "error" };
  }
};
