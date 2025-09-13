import React from 'react';
import ReactDOM from 'react-dom/client';

function EnvCheck() {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;
  const mask = (v?: string) => (v ? v.slice(0, 12) + '…' : 'undefined');
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <h1>Client Env Check</h1>
      <p><strong>Has VITE_SUPABASE_URL:</strong> {String(Boolean(url))}</p>
      <p><strong>VITE_SUPABASE_URL (masked):</strong> {mask(url)}</p>
      <p><strong>Has VITE_SUPABASE_ANON_KEY:</strong> {String(Boolean(key))}</p>
      <p><strong>VITE_SUPABASE_ANON_KEY (masked):</strong> {mask(key)}</p>
    </div>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <EnvCheck />
  </React.StrictMode>
);
