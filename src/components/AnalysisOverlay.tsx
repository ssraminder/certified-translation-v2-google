// src/components/AnalysisOverlay.tsx
import React from "react";

type Props = {
  open: boolean;
  message: string;
  percent: number;        // 0..100
  etaSeconds?: number;
  onCancel?: () => void;  // optional
};

export default function AnalysisOverlay({ open, message, percent, etaSeconds, onCancel }: Props) {
  if (!open) return null;
  const eta = (etaSeconds ?? 0) > 0 ? `~${etaSeconds}s remaining` : "";

  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true" aria-label="Document analysis progress">
      <div className="analysis-card">
        <div className="spinner" aria-hidden />
        <div className="title">Running OCR & Gemini</div>
        <div className="message">{message}</div>
        {eta && <div className="eta">{eta}</div>}
        <div className="bar" aria-hidden>
          <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
        {onCancel && <button className="cancel" onClick={onCancel}>Cancel</button>}
      </div>

      <style>{`
        .analysis-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; z-index: 9999; }
        .analysis-card { width: 360px; max-width: calc(100vw - 32px); background: #fff; border-radius: 12px; padding: 20px 18px; box-shadow: 0 10px 30px rgba(0,0,0,.25); text-align: center; }
        .spinner { width: 36px; height: 36px; margin: 0 auto 10px; border-radius: 50%; border: 4px solid #eee; border-top-color: #111; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg);} }
        .title { font-weight: 600; margin-bottom: 6px; }
        .message { font-size: 14px; color: #333; }
        .eta { font-size: 12px; color: #666; margin-top: 4px;}
        .bar { margin-top: 12px; height: 8px; background: #eee; border-radius: 99px; overflow: hidden;}
        .bar-fill { height: 100%; background: #111; transition: width .4s ease; }
        .cancel { margin-top: 14px; background: transparent; border: 1px solid #bbb; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
      `}</style>
    </div>
  );
}
