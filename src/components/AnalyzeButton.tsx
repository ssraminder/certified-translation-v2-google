// src/components/AnalyzeButton.tsx
import React from "react";
import { uploadViaSignedUrl, saveQuoteFromUI, runOcrThenGemini, getQuoteFile } from "@/lib/quoteApi";

type Props = {
  quoteId: string;
  fileName?: string;     // for previously uploaded files
  file?: File;           // for fresh uploads
  onRowUpdate?: (row: any) => void;  // gets latest DB row after run
};

export default function AnalyzeButton({ quoteId, fileName, file, onRowUpdate }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [label, setLabel] = React.useState("Run Analysis");

  async function handleClick() {
    try {
      setBusy(true);
      setLabel("Preparing…");

      // If we have a File object, do full chain (upload → save → analyze)
      if (file) {
        setLabel("Uploading…");
        await uploadViaSignedUrl(quoteId, file);

        setLabel("Saving…");
        await saveQuoteFromUI(quoteId, file, null);

        setLabel("Analyzing…");
        const res = await runOcrThenGemini(quoteId, file.name, s => setLabel(s));

        // Refresh row
        const row = await getQuoteFile(quoteId, file.name);
        onRowUpdate?.(row);
        setLabel("Run Analysis");
        setBusy(false);
        return;
      }

      // Otherwise, we assume the file is already uploaded + saved in DB
      if (!fileName) throw new Error("Missing file or fileName");

      setLabel("Analyzing…");
      await runOcrThenGemini(quoteId, fileName, s => setLabel(s));

      const row = await getQuoteFile(quoteId, fileName);
      onRowUpdate?.(row);
      setLabel("Run Analysis");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
      setLabel("Run Analysis");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`px-3 py-2 rounded-md ${busy ? "opacity-60 cursor-not-allowed" : "bg-black text-white hover:opacity-90"}`}
      title={busy ? label : "Run OCR + Gemini and refresh"}
    >
      {busy ? label : "Run Analysis"}
    </button>
  );
}
