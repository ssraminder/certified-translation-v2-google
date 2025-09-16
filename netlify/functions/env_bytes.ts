import type { Handler } from "@netlify/functions";
export const handler: Handler = async () => {
  const entries = Object.entries(process.env).map(([k,v]) => [k, (v||"").length] as const).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s, [,n]) => s+n, 0);
  return { statusCode: 200, body: JSON.stringify({ totalBytes: total, top: entries.slice(0,20) }) };
};
