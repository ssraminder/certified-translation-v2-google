export async function saveQuote(formData: FormData) {
  const res = await fetch('/api/save-quote', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    let msg = 'Save failed';
    try {
      const err = await res.json();
      if (err?.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

