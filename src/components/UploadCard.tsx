import React from "react";
import AnalyzeButton from "@/components/AnalyzeButton";

export default function UploadCard({ quoteId }: { quoteId: string }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [lastRow, setLastRow] = React.useState<any | null>(null);

  return (
    <div className="p-4 border rounded-lg">
      <input
        type="file"
        accept="application/pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <div className="mt-3">
        <AnalyzeButton
          quoteId={quoteId}
          file={file ?? undefined}                // when File present → full chain (upload+save+analyze)
          onRowUpdate={(row) => setLastRow(row)}  // optional: keep the latest DB row
        />
      </div>
      {lastRow && (
        <pre className="mt-3 text-xs bg-neutral-50 p-2 rounded">{JSON.stringify(lastRow, null, 2)}</pre>
      )}
    </div>
  );
}
