import type { Handler } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import vision from "@google-cloud/vision";
import pdfParse from "pdf-parse";
import crypto from "crypto";
import type { OcrResult } from "../../types";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  "";
const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  "";

const credsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
let visionClient: vision.ImageAnnotatorClient;
try {
  visionClient = credsJson
    ? new vision.ImageAnnotatorClient({ credentials: JSON.parse(credsJson) })
    : new vision.ImageAnnotatorClient();
} catch (err) {
  console.error("[vision] Failed to initialize ImageAnnotatorClient:", err);
  visionClient = new vision.ImageAnnotatorClient();
}

function json(statusCode: number, body: Record<string, unknown>) {
  return { statusCode, body: JSON.stringify(body) };
}

function countWords(text: string) {
  return (text.match(/\b\w+\b/gu) || []).length;
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { status: "error", message: "Method POST required" });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      return json(500, {
        status: "error",
        message: "Server configuration missing Supabase credentials.",
      });
    }

    let payload: any;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { status: "error", message: "Invalid JSON body" });
    }

    const { quote_id, files } = payload || {};
    if (!quote_id || !Array.isArray(files) || files.length === 0) {
      return json(400, {
        status: "error",
        message: "Missing quote_id or files array",
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
    const results: OcrResult[] = [];
    const logs: string[] = [];

    for (const file of files) {
      const { fileName, publicUrl, mimeType } = file as {
        fileName: string;
        publicUrl: string;
        mimeType?: string;
      };

      const response: OcrResult = {
        fileName,
        pageCount: 0,
        wordsPerPage: [],
        detectedLanguage: "undetermined",
        totalWordCount: 0,
        complexity: "medium",
        ocrStatus: "error",
        ocrMessage: "Unknown error",
      };

      const fileExt = fileName.split(".").pop()?.toLowerCase() || "";
      const fileToken = crypto
        .createHash("sha1")
        .update(`${quote_id}:${fileName}`)
        .digest("hex");
      const routeBase = (mimeType || fileName).toLowerCase().includes("pdf")
        ? "pdf-digital"
        : "image-ocr";

      let buffer: Buffer | null = null;

      try {
        const download = await fetch(publicUrl);
        if (!download.ok) {
          throw new Error(`Download failed with status ${download.status}`);
        }
        buffer = Buffer.from(await download.arrayBuffer());
        const lower = (mimeType || fileName).toLowerCase();

        if (lower.includes("pdf")) {
          const parsed = await pdfParse(buffer);
          const pages: string[] = parsed.text.split(/\f/g);
          const wordsPerPage = pages.map((page) => countWords(page));
          const totalWords = wordsPerPage.reduce((sum, value) => sum + value, 0);

          response.pageCount = parsed.numpages || pages.length;
          response.wordsPerPage = wordsPerPage;
          response.totalWordCount = totalWords;
          response.detectedLanguage = "undetermined";
          response.ocrStatus = "success";
          response.ocrMessage = "OCR via PDF text extraction (fallback)";

          const rows = wordsPerPage.map((count, index) => ({
            quote_id,
            file_token: fileToken,
            file_name: fileName,
            file_ext: fileExt,
            storage_url: publicUrl,
            file_bytes: buffer!.length,
            route: "pdf-digital",
            page_number: index + 1,
            page_count: response.pageCount,
            method: "digital",
            word_count: count,
            language: response.detectedLanguage,
            status: "ok",
            processed_at: new Date().toISOString(),
          }));

          try {
            await supabase
              .from("quote_pages")
              .upsert(rows, { onConflict: "file_token,page_number" });
          } catch (dbErr) {
            console.error("[vision] quote_pages upsert failed:", dbErr);
          }

          logs.push(
            `Inserted ${rows.length} pages (${rows.length} digital, 0 OCR) for file ${fileName}`,
          );
        } else {
          const [visionResult] = await visionClient.documentTextDetection({
            image: { content: buffer },
          });
          const annotation = visionResult?.fullTextAnnotation;
          const text = annotation?.text || "";
          const words = countWords(text);

          response.pageCount = 1;
          response.wordsPerPage = [words];
          response.totalWordCount = words;
          const language =
            annotation?.pages?.[0]?.property?.detectedLanguages?.[0]?.languageCode ||
            visionResult?.textAnnotations?.[0]?.locale ||
            "undetermined";
          response.detectedLanguage = language;
          response.ocrStatus = "success";
          response.ocrMessage = "OCR successful";

          const confidence = annotation?.pages?.[0]?.confidence;
          const rows = [
            {
              quote_id,
              file_token: fileToken,
              file_name: fileName,
              file_ext: fileExt,
              storage_url: publicUrl,
              file_bytes: buffer!.length,
              route: "image-ocr",
              page_number: 1,
              page_count: 1,
              method: "ocr",
              word_count: words,
              language,
              ocr_confidence: typeof confidence === "number" ? confidence * 100 : undefined,
              status: "ok",
              processed_at: new Date().toISOString(),
            },
          ];

          try {
            await supabase
              .from("quote_pages")
              .upsert(rows, { onConflict: "file_token,page_number" });
          } catch (dbErr) {
            console.error("[vision] quote_pages upsert failed:", dbErr);
          }

          logs.push("Inserted 1 pages (0 digital, 1 OCR) for file " + fileName);
        }
      } catch (err: any) {
        response.ocrMessage = err?.message || "Processing failed";
        const errorCode = err?.code || "PROCESSING_FAILED";
        try {
          await supabase.from("quote_pages").upsert(
            [
              {
                quote_id,
                file_token: fileToken,
                file_name: fileName,
                file_ext: fileExt,
                storage_url: publicUrl,
                file_bytes: buffer?.length || 0,
                route: routeBase,
                page_number: 0,
                page_count: 0,
                method: "error",
                word_count: 0,
                language: "undetermined",
                status: "error",
                error_code: errorCode,
                error_message: response.ocrMessage,
                processed_at: new Date().toISOString(),
              },
            ],
            { onConflict: "file_token,page_number" },
          );
        } catch (dbErr) {
          console.error("[vision] quote_pages error upsert failed:", dbErr);
        }

        logs.push(`Error: ${errorCode} for file ${fileName}`);
      }

      results.push(response);

      try {
        await supabase.from("quote_ocr_results").insert({
          quote_id,
          file_name: response.fileName,
          page_count: response.pageCount,
          words_per_page: response.wordsPerPage,
          detected_language: response.detectedLanguage,
          total_word_count: response.totalWordCount,
          complexity: response.complexity,
          ocr_status: response.ocrStatus,
          ocr_message: response.ocrMessage,
        });
      } catch (dbErr) {
        console.error("[vision] quote_ocr_results insert failed:", dbErr);
      }
    }

    const hasSuccess = results.some((result) => result.ocrStatus === "success");
    if (!hasSuccess) {
      return json(500, {
        status: "error",
        message: "All OCR attempts failed",
        quote_id,
        results,
      });
    }

    return json(200, {
      status: "ok",
      message: "OCR completed",
      quote_id,
      results,
      logs,
    });
  } catch (err: any) {
    console.error("[vision] run-vision-ocr error:", err);
    return json(500, { status: "error", message: err?.message || String(err) });
  }
};

export default handler;
