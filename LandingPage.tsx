import React, { useState, useEffect, useRef } from 'react';
import Spinner from './components/Spinner';
import Logo from './components/Logo';
import { runOcr, OcrResult } from './integrations/googleVision';
import { analyzeWithGemini, GeminiAnalysis } from './integrations/gemini';
import supabaseBrowser from './lib/supabase-browser';

async function loadDropdownData() {
  const sb = supabaseBrowser;
  if (!sb) {
    return {
      intendedUses: [] as string[],
      languages: [] as string[],
      tiers: [] as string[],
      certTypes: [] as string[],
      error: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    };
  }
  try {
    const { data: langRows, error: langError } = await sb
      .from('languages')
      .select('languagename');
    const { data: tierRows, error: tierError } = await sb
      .from('tiers')
      .select('tier');
    const { data: certRows, error: certError } = await sb
      .from('certificationtypes')
      .select('certtype');
    const { data: useRows, error: useError } = await sb
      .from('certificationmap')
      .select('intendeduse');

    const languages = Array.from(
      new Set((langRows ?? []).map((l: any) => l.languagename).filter(Boolean))
    ).sort();
    const tiers = Array.from(
      new Set((tierRows ?? []).map((t: any) => t.tier).filter(Boolean))
    ).sort();
    const certTypes = Array.from(
      new Set((certRows ?? []).map((c: any) => c.certtype).filter(Boolean))
    ).sort();
    const intendedUses = Array.from(
      new Set((useRows ?? []).map((u: any) => u.intendeduse).filter(Boolean))
    ).sort();

    const error =
      langError?.message ||
      tierError?.message ||
      certError?.message ||
      useError?.message;

    return { languages, tiers, certTypes, intendedUses, error };
  } catch (err) {
    return {
      languages: [] as string[],
      tiers: [] as string[],
      certTypes: [] as string[],
      intendedUses: [] as string[],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

type Screen = 'form' | 'waiting' | 'result' | 'error';

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

const allowedExtensions = ['jpg','jpeg','png','tiff','doc','docx','pdf','xls','xlsx'];

const LandingPage: React.FC = () => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [certificationType, setCertificationType] = useState('');
  const [tier, setTier] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [intendedUseOptions, setIntendedUseOptions] = useState<string[]>([]);
  const [certTypeOptions, setCertTypeOptions] = useState<string[]>([]);
  const [tierOptions, setTierOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [errors, setErrors] = useState<Record<string,string>>({});
  const [screen, setScreen] = useState<Screen>('form');
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<CombinedFile[]>([]);
  const [errorStep, setErrorStep] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoadingDropdowns(true);
    loadDropdownData().then(
      ({ languages, tiers, certTypes, intendedUses, error }) => {
        if (!isMounted) return;
        setLanguageOptions(languages);
        setTierOptions(tiers);
        setCertTypeOptions(certTypes);
        setIntendedUseOptions(intendedUses);
        if (error) setLoadError(error);
        setLoadingDropdowns(false);
      }
    );
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const target = menuRef.current;
    if (!(target instanceof Node)) return;
    const mo = new MutationObserver(() => {});
    mo.observe(target, { childList: true, attributes: true });
    return () => mo.disconnect();
  }, [menuOpen]);

  const validate = (): boolean => {
    const newErrors: Record<string,string> = {};
    if(!customerName.trim()) newErrors.customerName = 'Name is required';
    if(!customerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.customerEmail = 'Valid email required';
    if(!intendedUse) newErrors.intendedUse = 'Intended use required';
    if(!certificationType) newErrors.certificationType = 'Certification type required';
    if(!tier) newErrors.tier = 'Tier required';
    if(!sourceLanguage) newErrors.sourceLanguage = 'Source language required';
    if(!targetLanguage) newErrors.targetLanguage = 'Target language required';
    if(files.length === 0) newErrors.files = 'At least one file required';
    files.forEach(f => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if(!ext || !allowedExtensions.includes(ext)){
        newErrors.files = 'Unsupported file type';
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files ? Array.from(e.target.files) : []);
  };

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAllFiles = () => {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!validate()) return;
    if(files.length === 0) return;
    try{
      setScreen('waiting');
      setStatusText('Uploading…');
      // Mock upload delay
      await new Promise(r => setTimeout(r, 300));

      setStatusText('Analyzing with OCR…');
      const ocrResults: OcrResult[] = [];
      for (const file of files) {
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
      setScreen('result');
    } catch(err){
      const current = statusText.includes('OCR') ? 'OCR' : statusText.includes('Gemini') ? 'Gemini' : 'Upload';
      setErrorStep(current);
      setScreen('error');
    }
  };

  const totalBillablePages = results.reduce((sum, file) => {
    return sum + file.pages.reduce((s,p)=> s + Math.ceil(p.wordCount/250),0);
  },0);
  const perPageRate = 20;
  const displayCertType = certificationType || 'Standard';
  const certPrice = 50;
  const finalTotal = perPageRate * totalBillablePages + certPrice;

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
          <div ref={menuRef} className="sm:hidden absolute right-4 top-14 bg-white dark:bg-[#0C1E40] shadow rounded">
            <a href="#" className="block px-4 py-2" onClick={()=>setMenuOpen(false)}>Login</a>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 p-4">
        {screen === 'form' && !loadError && (
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
            {Object.keys(errors).length > 0 && (
              <div className="bg-red-100 text-red-700 p-2 rounded" role="alert">
                Please correct the highlighted fields.
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
              <select
                id="intendedUse"
                value={intendedUse}
                onChange={e=>setIntendedUse(e.target.value)}
                aria-invalid={errors.intendedUse ? 'true' : undefined}
                disabled={loadingDropdowns}
                className="w-full border p-2 rounded"
              >
                <option value="">Select...</option>
                {intendedUseOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium" htmlFor="certificationType">Certification Type*</label>
              <select
                id="certificationType"
                value={certificationType}
                onChange={e=>setCertificationType(e.target.value)}
                aria-invalid={errors.certificationType ? 'true' : undefined}
                disabled={loadingDropdowns}
                className="w-full border p-2 rounded"
              >
                <option value="">Select...</option>
                {certTypeOptions.map(ct => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium" htmlFor="tier">Tier*</label>
              <select
                id="tier"
                value={tier}
                onChange={e=>setTier(e.target.value)}
                aria-invalid={errors.tier ? 'true' : undefined}
                disabled={loadingDropdowns}
                className="w-full border p-2 rounded"
              >
                <option value="">Select...</option>
                {tierOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium" htmlFor="sourceLanguage">Source Language*</label>
                <select
                  id="sourceLanguage"
                  value={sourceLanguage}
                  onChange={e=>setSourceLanguage(e.target.value)}
                  aria-invalid={errors.sourceLanguage ? 'true' : undefined}
                  disabled={loadingDropdowns}
                  className="w-full border p-2 rounded"
                >
                  <option value="">Select...</option>
                  {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium" htmlFor="targetLanguage">Target Language*</label>
                <select
                  id="targetLanguage"
                  value={targetLanguage}
                  onChange={e=>setTargetLanguage(e.target.value)}
                  aria-invalid={errors.targetLanguage ? 'true' : undefined}
                  disabled={loadingDropdowns}
                  className="w-full border p-2 rounded"
                >
                  <option value="">Select...</option>
                  {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
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
                onChange={handleFilesChange}
                aria-invalid={errors.files ? 'true' : undefined}
                className="w-full border p-2 rounded"
              />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map(f => (
                    <li key={f.name} className="flex items-center justify-between">
                      <span>{f.name}</span>
                      <button type="button" className="text-sm text-red-600" onClick={() => removeFile(f.name)}>Remove</button>
                    </li>
                  ))}
                  <li>
                    <button type="button" className="text-sm text-red-600" onClick={removeAllFiles}>Remove all</button>
                  </li>
                </ul>
              )}
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Submit</button>
          </form>
        )}
        {screen === 'form' && loadError && (
          <div className="max-w-md mx-auto p-4 bg-yellow-100 text-yellow-800 rounded" role="alert">
            {loadError}
          </div>
        )}

        {screen === 'waiting' && (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Spinner />
            <p>{statusText}</p>
          </div>
        )}

        {screen === 'error' && (
          <div className="max-w-md mx-auto text-center">
            <p className="text-red-600">Error during {errorStep} step.</p>
            <button className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded" onClick={()=>setScreen('form')}>Back</button>
          </div>
        )}

        {screen === 'result' && (
          <div className="space-y-6">
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-gray-200 dark:bg-gray-700">
                  <th className="p-2 border">File</th>
                  <th className="p-2 border">Page</th>
                  <th className="p-2 border">Wordcount</th>
                  <th className="p-2 border">Complexity</th>
                  <th className="p-2 border">Multiplier</th>
                  <th className="p-2 border">PPWC</th>
                  <th className="p-2 border">Billable Pages</th>
                </tr>
              </thead>
              <tbody>
                {results.map(file => (
                  <React.Fragment key={file.fileName}>
                    {file.pages.map((p, idx) => {
                      const ppwc = (p.wordCount * p.complexityMultiplier).toFixed(2);
                      const billable = Math.ceil(p.wordCount/250);
                      return (
                        <tr key={idx} className="border-t">
                          <td className="p-2 border">{idx===0 ? file.fileName : ''}</td>
                          <td className="p-2 border">{p.pageNumber}</td>
                          <td className="p-2 border">{p.wordCount}</td>
                          <td className="p-2 border">{p.complexity}</td>
                          <td className="p-2 border">{p.complexityMultiplier}</td>
                          <td className="p-2 border">{ppwc}</td>
                          <td className="p-2 border">{billable}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="max-w-md p-4 border rounded">
              <p>Per Page Rate: ${perPageRate}</p>
              <p>Total Billable Pages: {totalBillablePages}</p>
              <p>Certification Type: {displayCertType}</p>
              <p>Certification Price: ${certPrice}</p>
              <p className="font-semibold">Final Total: ${finalTotal.toFixed(2)}</p>
            </div>
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
