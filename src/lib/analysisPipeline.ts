/* src/lib/analysisPipeline.ts */
/* Auto-runs OCR → poll → Gemini with progress + ETA callbacks (client-side). */

export type PipelinePhase =
  | "idle"
  | "starting_ocr"
  | "ocr_polling"
  | "gemini"
  | "done"
  | "error";

export type PipelineUpdate = {
  phase: PipelinePhase;
  message: string;
  percent: number;       // 0..100
  etaSeconds?: number;   // rough estimate
};

type ProgressCb = (u: PipelineUpdate) => void;

const POLL_INTERVAL_MS = 8000;  // must match server ocr_poll cadence
const MAX_POLLS = 15;           // ~2 minutes; tune if needed
const GEMINI_ESTIMATE_S = 12;   // average classify time

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function runOcrAndGemini(
  quote_id: string,
  file_name: string,
  onProgress?: ProgressCb
) {
  try {
    onProgress?.({
      phase: "starting_ocr",
      message: "Starting OCR…",
      percent: 8,
      etaSeconds: Math.round((MAX_POLLS * POLL_INTERVAL_MS)/1000 + GEMINI_ESTIMATE_S)
    });

    // 1) Kick off OCR (idempotent)
    await fetch("/api/ocr_start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quote_id, file_name }),
    });

    // 2) Poll until OCR JSON exists
    for (let i = 0; i < MAX_POLLS; i++) {
      const remaining = MAX_POLLS - i;
      const eta = Math.round((remaining * POLL_INTERVAL_MS)/1000 + GEMINI_ESTIMATE_S);
      const pct = Math.min(80, 10 + Math.floor((i / MAX_POLLS) * 70)); // 10→80% during OCR

      onProgress?.({
        phase: "ocr_polling",
        message: i === 0 ? "OCR in progress… (scanned PDFs take longer)" : "Still doing OCR…",
        percent: pct,
        etaSeconds: eta
      });

      const r = await fetch(`/api/ocr_poll?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
      if (r.status === 202) { await new Promise(res => setTimeout(res, POLL_INTERVAL_MS)); continue; }

      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "OCR poll failed");
      break; // OCR done
    }

    // 3) Gemini
    onProgress?.({
      phase: "gemini",
      message: "Analyzing with Gemini…",
      percent: 88,
      etaSeconds: GEMINI_ESTIMATE_S
    });

    const g = await fetch(`/api/gemini_analyze?quote_id=${encodeURIComponent(quote_id)}&file_name=${encodeURIComponent(file_name)}`);
    const gj = await g.json();
    if (!g.ok || !gj.ok) throw new Error(gj.error || "Gemini analyze failed");

    onProgress?.({
      phase: "done",
      message: "Analysis complete ✅",
      percent: 100,
      etaSeconds: 0
    });

    return gj;
  } catch (err: any) {
    onProgress?.({
      phase: "error",
      message: err?.message || String(err),
      percent: 0
    });
    throw err;
  }
}
