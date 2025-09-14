import React, { useState, useEffect, useRef } from 'react';
import Spinner from './components/Spinner';
import Logo from './components/Logo';
import { runOcr, OcrResult } from './integrations/googleVision';
import { analyzeWithGemini, GeminiAnalysis } from './integrations/gemini';
import supabase from './src/lib/supabaseClient';

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

const allowedExtensions = ['jpg','jpeg','png','tiff','doc','docx','pdf','xls','xlsx'] as const;
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
      const ext = f.name.split('.').pop()?.toLowerCase();
      if(!ext || !allowedExtensions.includes(ext as any)){
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
      files.forEach(f => formData.append('files[]', f));
      const saveRes = await fetch('/api/save-quote', { method: 'POST', body: formData });
      if(!saveRes.ok) {
        let msg = 'Save failed';
        try {
          const err = await saveRes.json();
          if (err?.error) msg = err.error;
        } catch {}
        throw new Error(msg);
      }
      const saveJson = await saveRes.json();
      setQuoteId(saveJson.quote_id);
      // DO NOT EDIT OUTSIDE THIS BLOCK

      setStatusText('Analyzing with OCR…');
      const ocrResults: OcrResult[] = [];
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
    } catch(err:any){
      console.error('Submit error:', err?.message || err);
      const current = statusText.includes('OCR') ? 'OCR' : statusText.includes('Gemini') ? 'Gemini' : 'Upload';
      setErrorStep(current);
      setScreen('error');
    }
  };

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
      const res = await fetch('/api/send-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });
      if (res.ok) {
        setScreen('result');
      } else {
        setErrorStep('Email');
        setScreen('error');
      }
    } catch {
      setErrorStep('Email');
      setScreen('error');
    }
  };
  // DO NOT EDIT OUTSIDE THIS BLOCK

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
      <main className="flex-1 p-4">
        {screen === 'form' && (
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4" aria-busy={loadingDropdowns ? 'true' : undefined}>
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
            <div>
              <label className="block font-medium" htmlFor="customerName">Name*</label>
              <input id="customerName" type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} aria-invalid={errors.customerName ? 'true' : undefined} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block font-medium" htmlFor="customerEmail">Email*</label>
              <input id="customerEmail" type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} aria-invalid={errors.customerEmail ? 'true' : undefined} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block font-medium" htmlFor="customerPhone">Phone</label>
              <input id="customerPhone" type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="w-full border p-2 rounded" />
            </div>
            <div>
              <label className="block font-medium" htmlFor="intendedUse">Intended Use*</label>
              <select id="intendedUse" value={intendedUse} onChange={e=>setIntendedUse(e.target.value)} aria-invalid={errors.intendedUse ? 'true' : undefined} className="w-full border p-2 rounded" disabled={loadingDropdowns}>
                <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                {intendedUses.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium" htmlFor="sourceLanguage">Source Language*</label>
                <select id="sourceLanguage" value={sourceLanguage} onChange={e=>setSourceLanguage(e.target.value)} aria-invalid={errors.sourceLanguage ? 'true' : undefined} className="w-full border p-2 rounded" disabled={loadingDropdowns}>
                  <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium" htmlFor="targetLanguage">Target Language*</label>
                <select id="targetLanguage" value={targetLanguage} onChange={e=>setTargetLanguage(e.target.value)} aria-invalid={errors.targetLanguage ? 'true' : undefined} className="w-full border p-2 rounded" disabled={loadingDropdowns}>
                  <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block font-medium" htmlFor="files">Upload Files*</label>
              <input
                ref={fileInputRef}
                id="files"
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.tiff,.doc,.docx,.pdf,.xls,.xlsx"
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  // de-dupe by name+size
                  const byKey = new Map(files.map(f => [f.name + ':' + f.size, f]));
                  for (const f of selected) byKey.set(f.name + ':' + f.size, f);
                  setFiles(Array.from(byKey.values()));
                }}
                aria-invalid={errors.files ? 'true' : undefined}
                className="w-full border p-2 rounded mt-1"
              />
              {files.length > 0 && (
                <div className="mt-2 space-y-2">
                  {files.map((f, idx) => (
                    <div key={f.name + ':' + f.size} className="flex items-center justify-between rounded border p-2">
                      <span className="text-sm truncate">{f.name}</span>
                      <button
                        type="button"
                        className="text-xs underline"
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
                    className="text-xs underline mt-1"
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
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-60"
              disabled={loadingDropdowns}
              aria-disabled={loadingDropdowns ? 'true' : undefined}
            >
              {loadingDropdowns ? 'Loading options…' : 'Submit'}
            </button>
          </form>
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
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-700">
                  <th className="p-2 border">Filename</th>
                  <th className="p-2 border">Billable Pages (total)</th>
                  <th className="p-2 border">Rate</th>
                  <th className="p-2 border">Total</th>
                </tr>
              </thead>
              <tbody>
                {fileSummaries.map(f => (
                  <tr key={f.fileName} className="border-t">
                    <td className="p-2 border">{f.fileName}</td>
                    <td className="p-2 border">{f.pages}</td>
                    <td className="p-2 border">${rate.toFixed(2)}</td>
                    <td className="p-2 border">${(f.pages * rate).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="p-2 border">Total Billable Pages</td>
                  <td className="p-2 border">{billablePagesTotal}</td>
                  <td className="p-2 border"></td>
                  <td className="p-2 border">${total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="flex space-x-2">
              <button className="px-4 py-2 bg-gray-300 rounded" onClick={()=>setScreen('form')}>Back</button>
              <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={sendEmail}>Email your quote</button>
            </div>
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
