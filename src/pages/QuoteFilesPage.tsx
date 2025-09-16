import React from "react";
import AnalyzeButton from "@/components/AnalyzeButton";
import { supabase } from "@/lib/quoteApi";

export default function QuoteFilesPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const quoteId = "CS00515"; // or derive from router / props

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("quote_files")
        .select("*")
        .eq("quote_id", quoteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRows(data || []);
    })().catch(err => alert(err.message));
  }, [quoteId]);

  function handleRowUpdate(updated: any) {
    setRows(prev => prev.map(r =>
      (r.quote_id === updated.quote_id && r.file_name === updated.file_name) ? { ...r, ...updated } : r
    ));
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold mb-4">Files for {quoteId}</h1>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">File</th>
            <th className="py-2">Status</th>
            <th className="py-2">Doc Type</th>
            <th className="py-2">Lang</th>
            <th className="py-2">Names</th>
            <th className="py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.file_name} className="border-b">
              <td className="py-2">{r.file_name}</td>
              <td className="py-2">{r.gem_status} — {r.gem_message}</td>
              <td className="py-2">{r.gem_doc_type || "-"}</td>
              <td className="py-2">{r.gem_language_code || "-"}</td>
              <td className="py-2">{Array.isArray(r.gem_names) ? r.gem_names.join(", ") : "-"}</td>
              <td className="py-2">
                <AnalyzeButton
                  quoteId={r.quote_id}
                  fileName={r.file_name}
                  onRowUpdate={handleRowUpdate}
                />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td className="py-6 text-neutral-500" colSpan={6}>No files yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
