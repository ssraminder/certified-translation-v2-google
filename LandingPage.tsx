import React, { useState, useEffect, useRef } from 'react';
import Spinner from './components/Spinner';
import Logo from './components/Logo';
import { runOcr, OcrResult as MockOcrResult } from './integrations/googleVision';
import { analyzeWithGemini, GeminiAnalysis } from './integrations/gemini';
import supabase from './src/lib/supabaseClient';
import { saveQuote, sendQuote, runVisionOcr, runGeminiAnalyze, fetchQuoteFiles } from 'api';
import type { OcrResult as VisionOcrResult } from './types';

type Screen = 'form' | 'waiting' | 'review' | 'result' | 'error';

interface CombinedPage {
  pageNumber: number;
  wordCount: number;
  complexity: string;
  complexityMultiplier: number;
}

interface CombinedFile {
  fileName: string;
  pages: CombinedPage[];
}

// allow images and common document types
const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// check file type against allow list (fallback to extension)
const isAllowed = (file: File) =>
  ALLOWED_TYPES.has(file.type) ||
  (!file.type && /\.(pdf|docx|xlsx)$/i.test(file.name));

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB, matches server limit

function uniqSorted(arr: (string | null | undefined)[] = []) {
  return Array.from(new Set(arr.filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

const LandingPage: React.FC = () => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [languages, setLanguages] = useState<string[]>([]);
  const [intendedUses, setIntendedUses] = useState<string[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);
  const [dropdownError, setDropdownError] = useState<string | null>(null);

  // DO NOT EDIT OUTSIDE THIS BLOCK
  const [certTypes, setCertTypes] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [languagesData, setLanguagesData] = useState<any[]>([]);
  const [certificationMap, setCertificationMap] = useState<any[]>([]);
  // DO NOT EDIT OUTSIDE THIS BLOCK

  const [errors, setErrors] = useState<Record<string,string>>({});
  const [screen, setScreen] = useState<Screen>('form');
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<CombinedFile[]>([]);
  const [errorStep, setErrorStep] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [ocrPreview, setOcrPreview] = useState<VisionOcrResult[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [gemResults, setGemResults] = useState<any[]>([]);
  const [gemLoading, setGemLoading] = useState(false);
  const [gemError, setGemError] = useState<string | null>(null);

  useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      setLoadingDropdowns(true);
      setDropdownError(null);

      // DO NOT EDIT OUTSIDE THIS BLOCK
      const { data: langRows, error: langErr } = await supabase
        .from('languages')
        .select('languagename, tier')
        .order('languagename', { ascending: true });
      if (langErr) throw langErr;

      const { data: tierRows, error: tierErr } = await supabase
        .from('tiers')
        .select('tier, multiplier')
        .order('tier', { ascending: true });
      if (tierErr) throw tierErr;

      const { data: ctypeRows, error: ctypeErr } = await supabase
        .from('certificationtypes')
        .select('certtype, price')
        .order('certtype', { ascending: true });
      if (ctypeErr) throw ctypeErr;

      const { data: cmapRows, error: cmapErr } = await supabase
        .from('certificationmap')
        .select('intendeduse, certtype')
        .order('intendeduse', { ascending: true });
      if (cmapErr) throw cmapErr;

      if (!mounted) return;
      setLanguagesData((langRows ?? []).map(r => ({ name: r.languagename, tier: r.tier })));
      setLanguages(uniqSorted((langRows ?? []).map(r => r.languagename)));
      setTiers(tierRows ?? []);
      setCertTypes((ctypeRows ?? []).map(r => ({ certType: r.certtype, price: r.price })));
      setCertificationMap((cmapRows ?? []).map(r => ({ intendedUse: r.intendeduse, certType: r.certtype })));
      setIntendedUses(uniqSorted((cmapRows ?? []).map(r => r.intendeduse)));
      // DO NOT EDIT OUTSIDE THIS BLOCK
    } catch (e: any) {
      if (mounted) setDropdownError('Could not load form options. Please retry.');
      console.error('Dropdown fetch failed:', e?.message || e);
    } finally {
      if (mounted) setLoadingDropdowns(false);
    }
  })();
  return () => {
    mounted = false;
  };
}, []);


  const validate = (): boolean => {
    const newErrors: Record<string,string> = {};
    if(!customerName.trim()) newErrors.customerName = 'Name is required';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) newErrors.customerEmail = 'Valid email required';
    if(!intendedUse) newErrors.intendedUse = 'Intended use required';
    if(!sourceLanguage) newErrors.sourceLanguage = 'Source language required';
    if(!targetLanguage) newErrors.targetLanguage = 'Target language required';
    if(files.length === 0) newErrors.files = 'At least one file required';

    for (const f of files) {
      // enforce allowed MIME types and max size
      if (!isAllowed(f)) {
        newErrors.files = 'Unsupported file type';
        break;
      }
      if (f.size > MAX_FILE_SIZE_BYTES) {
        newErrors.files = `File too large (max ${(MAX_FILE_SIZE_BYTES/1024/1024)|0}MB)`;
        break;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!validate()) return;
    if(files.length === 0) return;
    try{
      setScreen('waiting');
      setStatusText('Saving quote…');
      // DO NOT EDIT OUTSIDE THIS BLOCK
      const formData = new FormData();
      formData.append('name', customerName);
      formData.append('email', customerEmail);
      formData.append('phone', customerPhone);
      formData.append('intendedUse', intendedUse);
      formData.append('sourceLanguage', sourceLanguage);
      formData.append('targetLanguage', targetLanguage);
      files.forEach(f => formData.append('files[]', f, f.name)); // append raw File objects
      const saveJson = await saveQuote(formData);
      setQuoteId(saveJson.quote_id);
      // DO NOT EDIT OUTSIDE THIS BLOCK

      setStatusText('Analyzing with OCR…');
      const ocrResults: MockOcrResult[] = [];
      for (const file of files) {
        // NOTE: replace second arg if you later pass the storage path
        const ocr = await runOcr(file.name, file.name);
        ocrResults.push(ocr);
      }

      setStatusText('Analyzing with Gemini…');
      const geminiResults: GeminiAnalysis[] = [];
      for (const ocr of ocrResults) {
        const analysis = await analyzeWithGemini(
          ocr.fileName,
          ocr.pages.map(p => ({ pageNumber: p.pageNumber, text: p.text }))
        );
        geminiResults.push(analysis);
      }

      const combined: CombinedFile[] = geminiResults.map((g, idx) => ({
        fileName: g.fileName,
        pages: g.pages.map((p, i) => ({
          pageNumber: p.pageNumber,
          wordCount: ocrResults[idx].pages[i]?.wordCount ?? 0,
          complexity: p.complexity,
          complexityMultiplier: p.complexityMultiplier,
        }))
      }));
      setResults(combined);
      setScreen('review');
    } catch (err: any) {
      console.error('Submit error:', err?.message || err);
      const current = statusText.includes('OCR')
        ? 'OCR'
        : statusText.includes('Gemini')
        ? 'Gemini'
        : 'Upload';
      setErrorStep(current);
      setScreen('error');
    }
  }

  // DO NOT EDIT OUTSIDE THIS BLOCK
  const fileSummaries = results.map(file => ({
    fileName: file.fileName,
    pages: file.pages.reduce((s,p)=> s + Math.ceil(p.wordCount/250),0)
  }));
  const billablePagesTotal = fileSummaries.reduce((s,f)=> s + f.pages, 0);
  const selectedCertTypeName = certificationMap.find((m:any)=>m.intendedUse===intendedUse)?.certType;
  const selectedCertType = certTypes.find((c:any)=>c.certType===selectedCertTypeName);
  const sourceTierName = languagesData.find((l:any)=>l.name===sourceLanguage)?.tier;
  const targetTierName = languagesData.find((l:any)=>l.name===targetLanguage)?.tier;
  const sourceTier = tiers.find((t:any)=>t.tier===sourceTierName);
  const targetTier = tiers.find((t:any)=>t.tier===targetTierName);
  const selectedTier = sourceTier && targetTier ? (sourceTier.multiplier > targetTier.multiplier ? sourceTier : targetTier) : (sourceTier || targetTier);
  const base = selectedCertType?.price ?? 0;
  const mult = selectedTier?.multiplier ?? 1;
  const rate = +(base * mult).toFixed(2);
  const total = +(rate * billablePagesTotal).toFixed(2);
  // DO NOT EDIT OUTSIDE THIS BLOCK

  // DO NOT EDIT OUTSIDE THIS BLOCK
  const sendEmail = async () => {
    try {
      await sendQuote({
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        intendedUse,
        sourceLanguage,
        targetLanguage,
        rate,
        billablePages: billablePagesTotal,
        total,
        files: fileSummaries.map(f => ({ name: f.fileName, pages: f.pages }))
      });
      setScreen('result');
    } catch (err: any) {
      console.error('Send quote failed:', err?.message || err);
      setErrorStep('Email');
      setScreen('error');
    }
  };
  // DO NOT EDIT OUTSIDE THIS BLOCK

  const runOcrPreview = async () => {
    if (!quoteId) return;
    setOcrLoading(true);
    setOcrError(null);
    try {
      const filesPayload = await Promise.all(
        fileSummaries.map(async (f) => {
          const { data, error } = await supabase.storage
            .from('orders')
            .createSignedUrl(`${quoteId}/${f.fileName}`, 60);
          if (error || !data?.signedUrl) {
            throw new Error('Could not get file URL');
          }
          return { fileName: f.fileName, publicUrl: data.signedUrl };
        })
      );
      const res = await runVisionOcr({ quote_id: quoteId, files: filesPayload });
      setOcrPreview(res.results);
    } catch (err: any) {
      console.error('OCR failed:', err?.message || err);
      setOcrError(err?.message || 'OCR failed');
    } finally {
      setOcrLoading(false);
    }
  };

  const startGeminiPolling = (qid: string) => {
    let tries = 0;
    const max = 20;
    const iv = setInterval(async () => {
      tries++;
      try {
        const rows = await fetchQuoteFiles(qid);
        setGemResults(rows || []);
        const done = (rows || []).every((r: any) =>
          ['success', 'error'].includes(r?.gem_status || '')
        );
        if (done || tries >= max) {
          clearInterval(iv);
          setGemLoading(false);
        }
      } catch (err: any) {
        console.error('Gemini polling failed:', err?.message || err);
        if (tries >= max) {
          setGemError('Unable to retrieve Gemini status for this quote.');
          clearInterval(iv);
          setGemLoading(false);
        }
      }
    }, 1500);
  };

  const runGemini = async () => {
    if (!quoteId) return;
    setGemLoading(true);
    setGemError(null);
    try {
      await runGeminiAnalyze({ quote_id: quoteId });
      startGeminiPolling(quoteId);
    } catch (err: any) {
      console.error('Gemini analysis failed:', err?.message || err);
      console.error('Gemini analysis error object:', err);
      setGemError(err?.message || 'Gemini analysis failed');
      setGemLoading(false);
    }
  };

  useEffect(() => {
    if (screen === 'review' && quoteId && !ocrLoading && ocrPreview.length === 0) {
      runOcrPreview();
    }
  }, [screen, quoteId]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 bg-white dark:bg-[#0C1E40] shadow flex items-center justify-between px-4 py-2" role="navigation" aria-label="main">
        <a href="/" className="flex items-center">
          <Logo size={40} />
        </a>
        <div className="sm:hidden">
          <button aria-label="Menu" onClick={()=>setMenuOpen(o=>!o)}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
        <nav className="hidden sm:block" aria-label="Main Navigation">
          <a href="#" className="px-4 py-2 font-medium hover:underline">Login</a>
        </nav>
        {menuOpen && (
          <div className="sm:hidden absolute right-4 top-14 bg-white dark:bg-[#0C1E40] shadow rounded">
            <a href="#" className="block px-4 py-2" onClick={()=>setMenuOpen(false)}>Login</a>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 p-4" id="instant-quote">
        {screen === 'form' && (
          <section className="card max-w-2xl mx-auto" data-ui="quote-form">
            <h1 className="h1">Request a Certified Translation Quote</h1>
            <p className="subtle">Fast. Accurate. IRCC & Alberta Government accepted.</p>
            <form onSubmit={handleSubmit} aria-busy={loadingDropdowns ? 'true' : undefined}>
              {Object.keys(errors).length > 0 && (
                <div className="bg-red-100 text-red-700 p-2 rounded" role="alert">
                  Please correct the highlighted fields.
                </div>
              )}
              {dropdownError && (
                <div className="bg-red-100 text-red-700 p-2 rounded" role="alert">
                  {dropdownError}
                </div>
              )}
              <div className="form-grid">
                <div className="field full">
                  <label className="label" htmlFor="customerName">Name*</label>
                  <input id="customerName" type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} aria-invalid={errors.customerName ? 'true' : undefined} className="input" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="customerEmail">Email*</label>
                  <input id="customerEmail" type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} aria-invalid={errors.customerEmail ? 'true' : undefined} className="input" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="customerPhone">Phone</label>
                  <input id="customerPhone" type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="input" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="intendedUse">Intended Use*</label>
                  <select id="intendedUse" value={intendedUse} onChange={e=>setIntendedUse(e.target.value)} aria-invalid={errors.intendedUse ? 'true' : undefined} className="select" disabled={loadingDropdowns}>
                    <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                    {intendedUses.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="sourceLanguage">Source Language*</label>
                  <select id="sourceLanguage" value={sourceLanguage} onChange={e=>setSourceLanguage(e.target.value)} aria-invalid={errors.sourceLanguage ? 'true' : undefined} className="select" disabled={loadingDropdowns}>
                    <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="targetLanguage">Target Language*</label>
                  <select id="targetLanguage" value={targetLanguage} onChange={e=>setTargetLanguage(e.target.value)} aria-invalid={errors.targetLanguage ? 'true' : undefined} className="select" disabled={loadingDropdowns}>
                    <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="field full">
                  <label className="upload full" htmlFor="files" aria-label="Upload files" role="button">
                    <input
                      ref={fileInputRef}
                      id="files"
                      type="file"
                      multiple
                      accept=".pdf,image/*,.docx,.xlsx" // allow images, pdf, docx, xlsx
                      onChange={(e) => {
                        const selected = Array.from(e.target.files || []);
                        // de-dupe by name+size
                        const byKey = new Map(files.map(f => [f.name + ':' + f.size, f]));
                        for (const f of selected) byKey.set(f.name + ':' + f.size, f);
                        setFiles(Array.from(byKey.values()));
                      }}
                      aria-invalid={errors.files ? 'true' : undefined}
                    />
                    <div className="title">Drag & drop files here</div>
                    <div className="note">or click to browse — multiple files supported</div>
                  </label>
                  {files.length > 0 && (
                    <div className="file-list">
                      {files.map((f, idx) => (
                        <div key={f.name + ':' + f.size} className="file-item flex items-center justify-between rounded border p-2">
                          <span className="text-sm truncate">{f.name}</span>
                          <button
                            type="button"
                            className="remove text-xs underline"
                            onClick={() => {
                              const next = files.filter((_, i) => i !== idx);
                              setFiles(next);
                              if (next.length === 0 && fileInputRef.current) {
                                fileInputRef.current.value = '';
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="remove text-xs underline mt-1"
                        onClick={() => {
                          setFiles([]);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        Remove all
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loadingDropdowns}
                aria-disabled={loadingDropdowns ? 'true' : undefined}
              >
                {loadingDropdowns ? 'Loading options…' : 'Get Instant Quote'}
              </button>
            </form>
          </section>
        )}

        {screen === 'waiting' && (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Spinner />
            <p>{statusText}{quoteId ? ` (ID: ${quoteId})` : ''}</p>
          </div>
        )}

        {screen === 'error' && (
          <div className="max-w-md mx-auto text-center">
            <p className="text-red-600">Error during {errorStep} step.</p>
            <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded" onClick={()=>setScreen('form')}>Back</button>
          </div>
        )}

        {screen === 'review' && (
          <div className="space-y-6">
            <h1 className="h1">Review Your Translation Quote</h1>
            <p className="subtle">Transparent pricing. No hidden fees.</p>
            {quoteId && (
              <div aria-label="Quote ID" style={{ marginBottom: 8 }}>
                <strong>Quote ID:</strong> {quoteId}
              </div>
            )}
            <div className="table-card">
              <table className="table" role="table">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Billable Pages (total)</th>
                    <th>Rate</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {fileSummaries.map(f => (
                    <tr key={f.fileName}>
                      <td>{f.fileName}</td>
                      <td>{f.pages}</td>
                      <td>${rate.toFixed(2)}</td>
                      <td>${(f.pages * rate).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="total-row">
                    <td>Total Billable Pages</td>
                    <td>{billablePagesTotal}</td>
                    <td></td>
                    <td className="total-amount right">${total.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="row">
              <button className="btn btn-success" onClick={()=>setScreen('form')}>🔒 Accept & Pay Securely</button>
              <button className="btn btn-outline" onClick={sendEmail}>Email this Quote</button>
            </div>
            <div className="trust" aria-hidden="true">
              <span>✅ IRCC Accepted</span><span>✅ Alberta Govt Approved</span><span>✅ Secure Payments</span>
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer">OCR Results</summary>
              <div className="mt-2 space-y-2">
                {ocrError && <p className="help">{ocrError}</p>}
                <table className="table" aria-label="OCR results">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Pages</th>
                      <th>Words/Page</th>
                      <th>Language</th>
                      <th>Total Words</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocrPreview.length > 0 ? (
                      ocrPreview.map((r) => (
                        <tr key={r.fileName}>
                          <td>{r.fileName}</td>
                          <td>{r.pageCount}</td>
                          <td>{r.wordsPerPage.join(', ')}</td>
                          <td>{r.detectedLanguage}</td>
                          <td>{r.totalWordCount}</td>
                          <td>
                            <span title={r.ocrMessage || ''}>
                              {r.ocrStatus}
                              {r.ocrMessage ? ` — ${r.ocrMessage}` : ''}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td>sample.pdf</td>
                        <td>2</td>
                        <td>120, 130</td>
                        <td>en</td>
                        <td>250</td>
                        <td>success — Sample format only — awaiting OCR.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <button
                  className="btn btn-outline"
                  onClick={runGemini}
                  disabled={gemLoading}
                >
                  {gemLoading ? 'Running…' : 'Run Gemini Analysis'}
                </button>
                {gemError && <p className="help">{gemError}</p>}
                {gemResults.length > 0 && (
                  <div className="mt-2 space-y-4">
                    {gemResults.map((r: any) => {
                      const pages = Object.keys(r.gem_page_complexity || {});
                      return (
                        <div key={r.file_name}>
                          <p className="font-semibold">
                            {r.file_name}
                            {Array.isArray(r.gem_languages_all) && r.gem_languages_all.length > 0 && (
                              <span className="ml-2 text-sm text-gray-600">
                                Languages: {r.gem_languages_all.join(', ')}
                              </span>
                            )}
                          </p>
                          <table className="table mt-1" aria-label="Gemini page results">
                            <thead>
                              <tr>
                                <th>Page</th>
                                <th>Complexity</th>
                                <th>Doc Type</th>
                                <th>Names</th>
                                <th>Languages</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pages.map((p) => (
                                <tr key={`${r.file_name}-${p}`}>
                                  <td>{p}</td>
                                  <td>{r.gem_page_complexity?.[p]}</td>
                                  <td>{r.gem_page_doc_types?.[p] || ''}</td>
                                  <td>{Array.isArray(r.gem_page_names?.[p]) ? r.gem_page_names[p].join(', ') : ''}</td>
                                  <td>{Array.isArray(r.gem_page_languages?.[p]) ? r.gem_page_languages[p].join(', ') : ''}</td>
                                  <td>
                                    <span title={r.gem_message || ''}>
                                      {r.gem_status}
                                      {r.gem_message ? ` — ${r.gem_message}` : ''}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
        {screen === 'result' && (
          <div className="max-w-md mx-auto text-center space-y-4">
            <p className="text-green-700">Quote emailed successfully.</p>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={()=>setScreen('form')}>New Quote</button>
          </div>
        )}
      </main>

      <footer>
        <a href="/diagnostics" className="sr-only">Diagnostics</a>
      </footer>
    </div>
  );
};

export default LandingPage;

