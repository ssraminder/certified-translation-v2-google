import React, { useState, useEffect } from 'react';
import Spinner from './components/Spinner';
import Logo from './components/Logo';
import { createClient } from '@supabase/supabase-js';
import { runOcr, OcrResult } from './integrations/googleVision';
import { analyzeWithGemini, GeminiAnalysis } from './integrations/gemini';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

const allowedExtensions = ['jpg','jpeg','png','tiff','doc','docx','pdf','xls','xlsx'];

const LandingPage: React.FC = () => {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);

  const [intendedUseOptions, setIntendedUseOptions] = useState<string[]>([]);
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
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

  useEffect(() => {
    async function fetchOptions() {
      // DO NOT EDIT OUTSIDE THIS BLOCK
      const { data: uses } = await supabase.from('CertificationMap').select('intendedUse, certType');
      setCertificationMap(uses ?? []);
      const uniqueUses = Array.from(new Set((uses ?? []).map((u: any) => u.intendedUse).filter(Boolean)));
      setIntendedUseOptions(uniqueUses);
      const { data: langs } = await supabase.from('Languages').select('name, tier');
      setLanguagesData(langs ?? []);
      setLanguageOptions((langs ?? []).map((l: any) => l.name));
      const { data: t } = await supabase.from('Tiers').select('tier, multiplier');
      setTiers(t ?? []);
      const { data: ct } = await supabase.from('CertificationTypes').select('certType, price');
      setCertTypes(ct ?? []);
      // DO NOT EDIT OUTSIDE THIS BLOCK
    }
    fetchOptions();
  }, []);

  const validate = (): boolean => {
    const newErrors: Record<string,string> = {};
    if(!customerName.trim()) newErrors.customerName = 'Name is required';
    if(!customerEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) newErrors.customerEmail = 'Valid email required';
    if(!intendedUse) newErrors.intendedUse = 'Intended use required';
    if(!sourceLanguage) newErrors.sourceLanguage = 'Source language required';
    if(!targetLanguage) newErrors.targetLanguage = 'Target language required';
    if(!files || files.length === 0) newErrors.files = 'At least one file required';
    if(files){
      Array.from(files).forEach(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        if(!ext || !allowedExtensions.includes(ext)){
          newErrors.files = 'Unsupported file type';
        }
      });
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!validate()) return;
    if(!files) return;
    try{
      setScreen('waiting');
      setStatusText('Uploading…');
      // Mock upload delay
      await new Promise(r => setTimeout(r, 300));

      setStatusText('Analyzing with OCR…');
      const ocrResults: OcrResult[] = [];
      for (const file of Array.from(files)) {
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
    } catch(err){
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
              <select id="intendedUse" value={intendedUse} onChange={e=>setIntendedUse(e.target.value)} aria-invalid={errors.intendedUse ? 'true' : undefined} className="w-full border p-2 rounded">
                <option value="">Select...</option>
                {intendedUseOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium" htmlFor="sourceLanguage">Source Language*</label>
                <select id="sourceLanguage" value={sourceLanguage} onChange={e=>setSourceLanguage(e.target.value)} aria-invalid={errors.sourceLanguage ? 'true' : undefined} className="w-full border p-2 rounded">
                  <option value="">Select...</option>
                  {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-medium" htmlFor="targetLanguage">Target Language*</label>
                <select id="targetLanguage" value={targetLanguage} onChange={e=>setTargetLanguage(e.target.value)} aria-invalid={errors.targetLanguage ? 'true' : undefined} className="w-full border p-2 rounded">
                  <option value="">Select...</option>
                  {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block font-medium" htmlFor="files">Upload Files*</label>
              <input id="files" type="file" multiple accept=".jpg,.jpeg,.png,.tiff,.doc,.docx,.pdf,.xls,.xlsx" onChange={e=>setFiles(e.target.files)} aria-invalid={errors.files ? 'true' : undefined} className="w-full border p-2 rounded" />
            </div>
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Submit</button>
          </form>
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
