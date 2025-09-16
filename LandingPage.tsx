import React, { useState, useEffect, useRef } from 'react';
import Spinner from './components/Spinner';
import Logo from './components/Logo';
import { runOcr, OcrResult as MockOcrResult } from './integrations/googleVision';
import { analyzeWithGemini, GeminiAnalysis } from './integrations/gemini';
import supabase from './src/lib/supabaseClient';
import { saveQuote, sendQuote, runVisionOcr, runGeminiAnalyze, fetchQuoteFiles } from 'api';
import { saveQuoteDetails } from "./src/lib/quoteForm";
import AnalysisOverlay from "./src/components/AnalysisOverlay";
import { ensureQuoteId } from "./src/lib/ensureQuoteId";
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

const isAllowed = (file: File) =>
  ALLOWED_TYPES.has(file.type) ||
  (!file.type && /\.(pdf|docx|xlsx)$/i.test(file.name));

const guessContentType = (file: File) =>
  file.type ||
  (file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : 'application/octet-stream');

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB

// Feature flag: keep auto-analysis OFF
const AUTO_ANALYZE_ON_UPLOAD = false;

// Dedup helper for multi-file selection
function mergeSelectedFiles(prev: File[], selected: File[]) {
  const byKey = new Map(prev.map(f => [f.name + ':' + f.size, f]));
  for (const f of selected) byKey.set(f.name + ':' + f.size, f);
  return Array.from(byKey.values());
}

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
  const formRef = useRef<HTMLFormElement | null>(null);

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [results, setResults] = useState<CombinedFile[]>([]);
  const [errorStep, setErrorStep] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [quoteId, setQuoteId] = useState<string>('');
  const [ocrPreview, setOcrPreview] = useState<VisionOcrResult[]>([]);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [gemResults, setGemResults] = useState<any[]>([]);
  const [gemLoading, setGemLoading] = useState(false);
  const [gemError, setGemError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [percent, setPercent] = useState(0);
  const [eta, setEta] = useState<number | undefined>(undefined);

  // Initialize quoteId once
  useEffect(() => {
    try {
      setQuoteId(ensureQuoteId());
    } catch {
      // noop
    }
  }, []);

  // Helpful init log
  useEffect(() => {
    console.debug('quote-form:init', { quoteId, filesCount: files.length });
  }, [quoteId, files]);

  // Keep multi-file selection in sync
  useEffect(() => {
    const input = fileInputRef.current;
    if (!input) return;
    const updateFiles = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      const list = target?.files ?? input.files;
      const selected = Array.from(list ?? []);
      if (selected.length === 0) return;
      setFiles(prev => mergeSelectedFiles(prev, selected));
    };
    input.addEventListener('change', updateFiles);
    return () => {
      input.removeEventListener('change', updateFiles);
    };
  }, [screen]);

  // Only merge files on selection — no uploads/overlay here
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    setFiles(prev => mergeSelectedFiles(prev, selected));
    if (!AUTO_ANALYZE_ON_UPLOAD) return;
    // (If you ever enable auto analysis again, reintroduce the pipeline here.)
  }

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
    return () => { mounted = false; };
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
      if (!isAllowed(f)) { newErrors.files = 'Unsupported file type'; break; }
      if (f.size > MAX_FILE_SIZE_BYTES) { newErrors.files = `File too large (max ${(MAX_FILE_SIZE_BYTES/1024/1024)|0}MB)`; break; }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if(!validate()) return;
    if(files.length === 0) return;
    try{
      setScreen('waiting');
      setStatusText('Saving quote…');
      // DO NOT EDIT OUTSIDE THIS BLOCK
      const saveJson = await saveQuote({
        quote_id: quoteId,
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        intended_use: intendedUse,
        source_language: sourceLanguage,
        target_language: targetLanguage,
      });

      // Robust fallback if API doesn't echo quote_id
      const assignedQuoteId = saveJson?.quote_id || quoteId || ensureQuoteId();
      if (!assignedQuoteId) throw new Error('Could not determine quote ID');
      setQuoteId(assignedQuoteId);

      setStatusText('Uploading files…');

      for (const file of files) {
        const storagePath = `${assignedQuoteId}/${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('orders')
          .upload(storagePath, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: guessContentType(file),
          });
        if (uploadErr) throw new Error(`Upload failed for ${file.name} at orders/${storagePath}: ${uploadErr.message}`);

        const { data: publicData } = supabase.storage.from('orders').getPublicUrl(storagePath);

        await saveQuote({
          quote_id: assignedQuoteId,
          file_name: file.name,
          storage_path: `orders/${storagePath}`,
          public_url: publicData?.publicUrl ?? null,
        });
      }
      // DO NOT EDIT OUTSIDE THIS BLOCK

      setStatusText('Analyzing with OCR…');
      const ocrResults: MockOcrResult[] = [];
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
      setScreen('review');
    } catch (err: any) {
      console.error('Submit error:', err?.message || err);
      const current = statusText.includes('OCR') ? 'OCR'
        : statusText.includes('Gemini') ? 'Gemini'
        : 'Upload';
      setErrorStep(current);
      setScreen('error');
    }
  }

  async function submitQuoteForm(form: HTMLFormElement | null, providedId?: string) {
    if (!form) return;
    const quote_id = providedId || quoteId || ensureQuoteId();
    if (!providedId) setQuoteId(quote_id);

    const fd = new FormData(form);
    const name            = String(fd.get("name") || "");
    const email           = String(fd.get("email") || "");
    const phone           = String(fd.get("phone") || "");
    const intended_use    = String(fd.get("intended_use") || "");
    const source_language = String(fd.get("source_language") || "");
    const target_language = String(fd.get("target_language") || "");

    setIsSubmitting(true);
    try {
      await saveQuoteDetails({ quote_id, name, email, phone, intended_use, source_language, target_language });
      await handleSubmit();
    } finally {
      setIsSubmitting(false);
    }
  }

  const fileCount = files.length;
  const isGetQuoteDisabled =
    !customerName.trim() ||
    !customerEmail.trim() ||
    !intendedUse ||
    !sourceLanguage ||
    !targetLanguage ||
    fileCount === 0 ||
    isSubmitting;

  useEffect(() => {
    if (isGetQuoteDisabled) {
      console.debug('get-quote: disabled', {
        name: !!customerName.trim(),
        email: !!customerEmail.trim(),
        intendedUse: !!intendedUse,
        sourceLang: !!sourceLanguage,
        targetLang: !!targetLanguage,
        filesCount: fileCount,
        isSubmitting,
      });
    }
  }, [
    isGetQuoteDisabled,
    customerName,
    customerEmail,
    intendedUse,
    sourceLanguage,
    targetLanguage,
    fileCount,
    isSubmitting,
  ]);

  const handleGetInstantQuote = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const id = quoteId || ensureQuoteId();
    setQuoteId(id);

    console.debug('get-quote: start', {
      id,
      hasFiles: fileCount > 0,
      intendedUse,
      sourceLang: sourceLanguage,
      targetLang: targetLanguage,
    });

    if (isGetQuoteDisabled) return;

    // Overlay now starts ONLY when button is clicked
    setOpen(true);
    setMessage("Preparing your quote…");
    setPercent(10);
    setEta(undefined);

    try {
      await submitQuoteForm(formRef.current, id);
      setMessage("All set ✅");
      setPercent(100);
      setEta(0);
    } finally {
      setTimeout(() => setOpen(false), 900);
    }
  };

  async function onQuoteFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isGetQuoteDisabled) return;
    await submitQuoteForm(e.currentTarget);
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
          if (error || !data?.signedUrl) throw new Error('Could not get file URL');
          return { fileName: f.fileName, publicUrl: data.signedUrl };
        })
      );

      const res = await runVisionOcr({ quote_id: quoteId, files: filesPayload });
// Normalize snake_case/camelCase variants and compute totals if missing
const normalized = (Array.isArray(res?.results) ? res.results : []).map((r: any) => {
  const wordsPerPageRaw =
    r.wordsPerPage ?? r.words_per_page ?? r.word_counts_per_page ??
    r.page_word_counts ?? r.wordsByPage ?? r.words_by_page ??
    r.page_words ?? r.page_text_word_counts ?? r.pageWords ?? [];

  const wordsPerPage: number[] = Array.isArray(wordsPerPageRaw)
    ? wordsPerPageRaw.map((n: any) => Number(n) || 0)
    : [];

  const pageCountRaw =
    r.pageCount ?? r.page_count ?? r.pages ?? r.num_pages ??
    (Array.isArray(wordsPerPage) ? wordsPerPage.length : 0);
  const pageCount = Number(pageCountRaw) || 0;

  const totalFromArray = wordsPerPage.reduce((s: number, n: number) => s + (Number(n) || 0), 0);

  const totalWordCountRaw =
    r.totalWordCount ?? r.total_words ?? r.word_count ?? r.total ?? totalFromArray;
  const totalWordCount = Number(totalWordCountRaw) || totalFromArray || 0;

  return {
    fileName: r.fileName ?? r.file_name ?? "unknown",
    pageCount,
    wordsPerPage,
    detectedLanguage:
      r.detectedLanguage ?? r.detected_language ?? r.language ?? r.lang ?? "undetermined",
    totalWordCount,
    ocrStatus: r.ocrStatus ?? r.status ?? "",
    ocrMessage: r.ocrMessage ?? r.message ?? "",
  };
}) as VisionOcrResult[];


      setOcrPreview(normalized);

      const processedFileNames = normalized.map(n => n.fileName).filter(Boolean);
      if (processedFileNames.length) {
        setGemLoading(true);
        setGemError(null);
        try {
          await runGeminiAnalyze({ quote_id: quoteId, fileNames: processedFileNames });
          startGeminiPolling(quoteId);
        } catch (err: any) {
          console.error('Gemini analysis failed:', err?.message || err);
          setGemError(err?.message || 'Gemini analysis failed');
          setGemLoading(false);
        }
      }
    } catch (err: any) {
      console.error('OCR failed:', err?.message || err);
      setOcrError(err?.message || 'OCR failed');
    } finally {
      setOcrLoading(false);
    }
  };

 function normalizeGemRow(r: any) {
  // 1) Build a page map from several possible shapes (map, array-of-objects, parallel arrays)
  const complexityAny =
    r.gem_page_complexity ?? r.page_complexity ?? r.per_page_complexity;

  let pageMap: Record<string, any> = {};
  if (complexityAny && typeof complexityAny === "object" && !Array.isArray(complexityAny)) {
    // Already a map like { "1": { complexity: "medium" }, ... } or { "1": "medium", ... }
    pageMap = complexityAny as Record<string, any>;
  } else if (Array.isArray(complexityAny)) {
    // Array of complexity values -> index-keyed map
    pageMap = Object.fromEntries(
      (complexityAny as any[]).map((v, i) => [String(i + 1), { complexity: v }])
    );
  } else if (Array.isArray(r.gem_pages)) {
    // Array of page objects -> keyed by page/pageNumber/index
    pageMap = Object.fromEntries(
      r.gem_pages.map((p: any) => [String(p.page ?? p.pageNumber ?? p.index ?? ""), p])
    );
  }

  // 2) Per-page auxiliary maps (doc types, names, languages), accepting either maps or arrays
  const coerceArrayToMap = (arr: any[]) =>
    Object.fromEntries(arr.map((v, i) => [String(i + 1), v]));

  const docTypesAny = r.gem_page_doc_types ?? r.page_doc_types ?? {};
  const namesAny = r.gem_page_names ?? r.page_names ?? {};
  const langsAny = r.gem_page_languages ?? r.page_languages ?? {};

  const docTypesMap = Array.isArray(docTypesAny) ? coerceArrayToMap(docTypesAny) : docTypesAny;
  const namesMap = Array.isArray(namesAny) ? coerceArrayToMap(namesAny) : namesAny;
  const langsMap = Array.isArray(langsAny) ? coerceArrayToMap(langsAny) : langsAny;

  // 3) Pages = union of keys from all sources to avoid dropping info when one map is empty
  const keyUnion = new Set<string>([
    ...Object.keys(pageMap || {}),
    ...Object.keys(docTypesMap || {}),
    ...Object.keys(namesMap || {}),
    ...Object.keys(langsMap || {}),
  ].filter(Boolean));

  const ensureArray = (x: any) =>
    Array.isArray(x) ? x : (x == null ? [] : [x]);

  const per_page = Array.from(keyUnion).map((k) => {
    const v = (pageMap && pageMap[k]) || {};
    const complexityVal =
      (typeof v === "string" ? v : (v?.complexity ?? v?.score)) ??
      (typeof complexityAny === "object" && !Array.isArray(complexityAny) ? complexityAny?.[k] : "") ??
      "";

    const docType = (docTypesMap && docTypesMap[k]) ?? v?.docType ?? v?.doc_type ?? "";
    const names = Array.isArray(namesMap?.[k]) ? namesMap[k] : ensureArray(v?.names);
    const languages = Array.isArray(langsMap?.[k]) ? langsMap[k] : ensureArray(v?.languages);

    return { page: k, complexity: complexityVal, docType, names, languages };
  });

  // 4) Doc-level fields with broad fallbacks
  const langsAllAny = r.gem_languages_all ?? r.languages_all ?? r.languages ?? [];
  const gem_languages_all = Array.isArray(langsAllAny) ? langsAllAny : ensureArray(langsAllAny);

  return {
    file_name: r.file_name ?? r.fileName ?? "unknown",
    gem_status: r.gem_status ?? r.status ?? "",
    gem_message: r.gem_message ?? r.message ?? "",
    gem_languages_all,
    per_page,
  };
}

      per_page,
    };
  }

  const startGeminiPolling = (qid: string) => {
    let tries = 0;
    const max = 20;
    const iv = setInterval(async () => {
      tries++;
      try {
        const rows = await fetchQuoteFiles(qid);
        const normalized = (rows || []).map(normalizeGemRow);
        setGemResults(normalized);

// Consider a row "done" if it has a terminal status or an explicit done flag
const terminalStatuses = new Set(["success", "error", "done", "completed"]);

const done = normalized.every((r: any) => {
  // honor explicit boolean flags if present
  const boolish =
    r.isDone ?? r.done ?? r.completed ?? r.complete ?? r.finished;
  if (typeof boolish === "boolean") return boolish;

  // otherwise, fall back to string status (with broad key aliasing)
  const s = String(r.gem_status ?? r.status ?? "")
    .trim()
    .toLowerCase();
  return terminalStatuses.has(s);
});

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
      await runGeminiAnalyze({
        quote_id: quoteId,
        fileNames: fileSummaries.map((f) => f.fileName),
      });
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
      <AnalysisOverlay open={open} message={message} percent={percent} etaSeconds={eta} />
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
            <form ref={formRef} onSubmit={onQuoteFormSubmit} aria-busy={loadingDropdowns ? 'true' : undefined}>
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
                  <input id="customerName" name="name" type="text" value={customerName} onChange={e=>setCustomerName(e.target.value)} aria-invalid={errors.customerName ? 'true' : undefined} className="input" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="customerEmail">Email*</label>
                  <input id="customerEmail" name="email" type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} aria-invalid={errors.customerEmail ? 'true' : undefined} className="input" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="customerPhone">Phone</label>
                  <input id="customerPhone" name="phone" type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} className="input" />
                </div>
                <div className="field full">
                  <label className="label" htmlFor="intendedUse">Intended Use*</label>
                  <select id="intendedUse" name="intended_use" value={intendedUse} onChange={e=>setIntendedUse(e.target.value)} aria-invalid={errors.intendedUse ? 'true' : undefined} className="select" disabled={loadingDropdowns}>
                    <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                    {intendedUses.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="sourceLanguage">Source Language*</label>
                  <select id="sourceLanguage" name="source_language" value={sourceLanguage} onChange={e=>setSourceLanguage(e.target.value)} aria-invalid={errors.sourceLanguage ? 'true' : undefined} className="select" disabled={loadingDropdowns}>
                    <option value="">{loadingDropdowns ? 'Loading…' : 'Select...'}</option>
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="targetLanguage">Target Language*</label>
                  <select id="targetLanguage" name="target_language" value={targetLanguage} onChange={e=>setTargetLanguage(e.target.value)} aria-invalid={errors.targetLanguage ? 'true' : undefined} className="select" disabled={loadingDropdowns}>
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
                      accept=".pdf,image/*,.docx,.xlsx"
                      onChange={handleFileChange}
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
                id="get-instant-quote"
                data-testid="get-instant-quote"
                type="button"
                onClick={handleGetInstantQuote}
                className="btn btn-primary btn-block relative z-10"
                disabled={isGetQuoteDisabled}
                aria-disabled={isGetQuoteDisabled ? 'true' : undefined}
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
                    {gemResults.map((r: any) => (
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
                            {Array.isArray(r.per_page) && r.per_page.length > 0 ? (
                              r.per_page.map((p: any) => (
                                <tr key={`${r.file_name}-${p.page}`}>
                                  <td>{p.page}</td>
                                  <td>{p.complexity || ''}</td>
                                  <td>{p.docType || ''}</td>
                                  <td>{Array.isArray(p.names) ? p.names.join(', ') : ''}</td>
                                  <td>{Array.isArray(p.languages) ? p.languages.join(', ') : ''}</td>
                                  <td>
                                    <span title={r.gem_message || ''}>
                                      {r.gem_status || ''}
                                      {r.gem_message ? ` — ${r.gem_message}` : ''}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr><td colSpan={6}>Per-page details not available yet.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ))}
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
