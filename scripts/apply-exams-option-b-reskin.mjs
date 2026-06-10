#!/usr/bin/env node
/** One-off: Option B CSS-only reskin on squarespace-exams-page-LATEST.html */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../alanranger-modules/squarespace-exams-page-LATEST.html');
let html = fs.readFileSync(target, 'utf8');

html = html.replace(
  /<!-- AR Assessment v2\.58[^\n]*\n/,
  '<!-- AR Assessment v2.59 — Option B dark reskin (gold frame / champagne), CSS-only — 2026-06-10 -->\n'
);

const gridStyleStart = html.indexOf('    <style>\n      :root{ --ar-orange:#E57200;');
const gridStyleEnd = html.indexOf('    </style>\n    \n    <div class="top">');
if (gridStyleStart < 0 || gridStyleEnd < 0) throw new Error('Grid style block not found');

const gridStyle = `    <style>
      /* Option B tokens — CSS-only reskin v2.59 */
      :root{
        --ar-orange:#e57200; --ar-orange-hi:#f08a1f; --ar-gold:#d4a64a; --ar-champagne:#e8d9b8;
        --ar-green:#4caf50; --ar-red:#e5484d; --ar-grey:#8a93a3;
        --ar-bg:#0d1117; --ar-panel:#151a23; --ar-panel2:#1a2030; --ar-line:#2a3140;
        --ar-text:#e8ebf0; --ar-dim:#aab3c0; --ar-gray:#2a3140;
      }
      /* Page shell (skip in Squarespace edit mode) */
      html:not(.sqs-edit-mode-active):not(.sqs-edit-mode) body:has(#ar-modgrid){
        background:#0d1117!important;color:var(--ar-text);
      }
      html:not(.sqs-edit-mode-active):not(.sqs-edit-mode) .content-wrapper:has(#ar-modgrid),
      html:not(.sqs-edit-mode-active):not(.sqs-edit-mode) .page-section:has(#ar-modgrid){
        background:#0d1117!important;
      }
      #ar-modgrid{color:var(--ar-text)}
      #ar-modgrid #grid-container{background:transparent}
      #ar-modgrid a{color:var(--ar-gold)!important;text-decoration:none}
      #ar-modgrid a:hover{text-decoration:underline;color:var(--ar-champagne)!important}
      #ar-modgrid .top{display:flex;flex-direction:column;gap:16px;margin:8px 0 18px}
      #ar-modgrid h2{margin:0;font-size:28px;line-height:1.2;font-weight:800;color:var(--ar-champagne)!important}
      #ar-modgrid .summary{
        width:100%;border:1.5px solid var(--ar-gold);border-radius:12px;background:var(--ar-panel);
        padding:16px 18px;box-shadow:none;color:var(--ar-text);
      }
      #ar-modgrid .summary h3{margin:0 0 6px 0;font-size:17px;font-weight:800;color:var(--ar-champagne)}
      #ar-modgrid .progressline{display:flex;justify-content:space-between;align-items:center;margin:0 0 4px 0;color:var(--ar-text)}
      #ar-modgrid .progressline .stat{font-weight:800;font-size:16px;color:var(--ar-text)}
      #ar-modgrid .track{margin-top:4px;height:8px;border-radius:6px;background:#222a38;overflow:hidden}
      #ar-modgrid .bar{height:100%;width:0;background:var(--ar-orange);transition:width .4s ease;border-radius:6px}
      #ar-modgrid .auth{display:grid;grid-template-columns:auto auto auto auto auto;align-items:center;gap:8px;margin-top:8px;justify-content:start}
      #ar-modgrid .badge{padding:4px 10px;border:1px solid var(--ar-line);border-radius:999px;background:var(--ar-panel2);font-weight:600;font-size:12px;color:var(--ar-dim)}
      #ar-modgrid input[type="email"]{
        width:100%;min-width:120px;max-width:200px;padding:8px 10px;
        border:1px solid var(--ar-line);border-radius:8px;font-size:13px;
        background:var(--ar-panel2);color:var(--ar-text);
      }
      #ar-modgrid .btn{
        display:inline-flex;align-items:center;justify-content:center;gap:6px;
        padding:8px 14px;border-radius:8px;border:1.5px solid var(--ar-orange);
        background:var(--ar-orange)!important;color:#fff!important;
        font-weight:700;cursor:pointer;text-decoration:none!important;white-space:nowrap;font-size:13px;
      }
      #ar-modgrid .btn:hover{background:var(--ar-orange-hi)!important;border-color:var(--ar-orange-hi)!important;color:#fff!important}
      #ar-modgrid .btn.sm{padding:6px 11px;border-radius:7px;font-size:12px}
      #ar-modgrid .btn.secondary{
        background:transparent!important;color:var(--ar-gold)!important;
        border:1.5px solid var(--ar-gold)!important;
      }
      #ar-modgrid .btn.secondary:hover{
        color:var(--ar-champagne)!important;border-color:var(--ar-champagne)!important;
        background:rgba(212,166,74,.08)!important;
      }
      #ar-modgrid #btnMasterCertificate{
        background:var(--ar-orange)!important;border-color:var(--ar-orange)!important;color:#fff!important;
      }
      #ar-modgrid #btnMasterTranscript{
        background:transparent!important;color:var(--ar-gold)!important;border:1.5px solid var(--ar-gold)!important;
      }
      #ar-modgrid .hint{margin-top:6px;color:var(--ar-dim);font-size:12px}
      #ar-modgrid .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px}
      @media (max-width:1200px){#ar-modgrid .grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media (max-width:980px){#ar-modgrid .grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media (max-width:640px){#ar-modgrid .top{grid-template-columns:1fr}#ar-modgrid .grid{grid-template-columns:repeat(2,minmax(0,1fr))}#ar-modgrid .summary{max-width:none}}
      @media (max-width:480px){#ar-modgrid .grid{grid-template-columns:1fr}}
      #ar-modgrid .card{
        position:relative;background:var(--ar-panel);border:1px solid var(--ar-line);border-radius:12px;
        padding:14px;box-shadow:none;overflow:hidden;color:var(--ar-text);
      }
      #ar-modgrid .card::before{display:none}
      #ar-modgrid .head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
      #ar-modgrid .num{
        min-width:28px;height:28px;border-radius:7px;background:transparent;
        border:1.5px solid var(--ar-gold);color:var(--ar-gold);
        display:inline-flex;align-items:center;justify-content:center;font-weight:800;
      }
      #ar-modgrid .title{font-weight:800;font-size:16px;color:var(--ar-text)!important}
      #ar-modgrid .chips{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:4px 0 10px 0;text-align:center}
      #ar-modgrid .chip{
        display:inline-flex;align-items:center;justify-content:center;gap:6px;
        padding:4px 10px;border-radius:999px;border:1px solid var(--ar-line);
        background:#222a38;font-size:13px;color:var(--ar-grey);
      }
      #ar-modgrid .chip.pass{background:var(--ar-green)!important;border-color:var(--ar-green)!important;color:#fff!important;font-weight:700}
      #ar-modgrid .chip.fail{background:var(--ar-red)!important;border-color:var(--ar-red)!important;color:#fff!important;font-weight:700}
      #ar-modgrid .actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:4px}
      #ar-modgrid .card.passed{background:var(--ar-panel);border-color:#3a5a3d}
      #ar-modgrid .card.failed{background:var(--ar-panel);border-color:#5a3134}
      #ar-modgrid .tick{
        position:absolute;right:12px;top:12px;width:auto;height:auto;border-radius:0;
        background:transparent;border:none;color:var(--ar-green);font-weight:900;font-size:15px;
        display:flex;align-items:center;justify-content:center;padding:0;
      }
      #ar-modgrid .xmark{
        position:absolute;right:12px;top:12px;width:auto;height:auto;border-radius:0;
        background:transparent;border:none;color:var(--ar-red);font-weight:900;font-size:15px;
        display:flex;align-items:center;justify-content:center;padding:0;
      }
      #ar-modgrid .toast{
        position:fixed;left:50%;top:22px;transform:translateX(-50%);z-index:99999;
        background:#111;color:#fff;padding:10px 14px;border-radius:10px;
        box-shadow:0 8px 24px rgba(0,0,0,.35);display:none;
      }
      #ar-modgrid .toast.ok{background:var(--ar-green)}
      #ar-modgrid .toast.err{background:var(--ar-red)}
      #ar-modgrid #memberstackAuthMessage{
        background:var(--ar-panel2)!important;border:1px solid var(--ar-gold)!important;color:var(--ar-text)!important;
      }
      #ar-modgrid #memberstackAuthMessage a{color:var(--ar-orange)!important}
      #ar-modgrid #loadingSpinner{background:rgba(21,26,35,.98)!important;border:2px solid var(--ar-gold)!important}
      #ar-modgrid #loadingText{color:var(--ar-text)!important}
      #ar-modgrid #btn-modal-master-cert{
        background:var(--ar-orange)!important;border-color:var(--ar-orange)!important;color:#fff!important;
      }
      /* Debug panel styles - hidden by default */
      #debugPanel{
        position:fixed;top:10px;right:10px;width:450px;max-height:90vh;background:#1a1a1a;
        border:2px solid #8b5cf6;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5);
        z-index:99999;display:none;font-family:monospace;color:#fff;overflow:hidden;
      }
      #debugHeader{padding:12px 16px;background:#8b5cf6;color:#fff;font-weight:bold;font-size:14px;display:flex;justify-content:space-between;align-items:center;gap:8px}
      #debugToggle,#debugCopy{background:rgba(255,255,255,.2);border:none;color:#fff;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;transition:background .2s}
      #debugToggle:hover,#debugCopy:hover{background:rgba(255,255,255,.3)}
      #debugCopy.copied{background:#10b981}
      #debugContent{max-height:calc(90vh - 50px);overflow-y:auto;padding:16px;font-size:11px;line-height:1.6}
      .debug-section{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #333}
      .debug-section:last-child{border-bottom:none}
      .debug-section-title{color:#8b5cf6;font-weight:bold;margin-bottom:8px;font-size:12px;text-transform:uppercase}
      .debug-item{margin:4px 0;padding:4px 0}
      .debug-label{color:#aaa;display:inline-block;min-width:140px}
      .debug-value{color:#0f0;word-break:break-all}
      .debug-value.error{color:#f44}
      .debug-value.warning{color:#ffa500}
      .debug-value.info{color:#4af}
    </style>`;

html = html.slice(0, gridStyleStart) + gridStyle + html.slice(gridStyleEnd);

const quizStyleStart = html.indexOf('  <style>\n    #ar-quiz a { color:#2563eb');
const quizStyleEnd = html.indexOf('  </style>\n\n  <div id="ar-auth">');
if (quizStyleStart < 0 || quizStyleEnd < 0) throw new Error('Quiz style block not found');

const quizStyle = `  <style>
    /* Option B — quiz panel v2.59 */
    #ar-quiz{
      border:1.5px solid #d4a64a!important;border-left:1.5px solid #d4a64a!important;
      background:#151a23!important;padding:24px!important;border-radius:12px!important;
      color:#e8ebf0!important;
    }
    #ar-quiz a{color:#d4a64a!important;text-decoration:none!important}
    #ar-quiz a:hover{text-decoration:underline!important;color:#e8d9b8!important}
    #ar-quiz h2{color:#e8d9b8!important}
    #ar-quiz p{color:#aab3c0!important}
    #ar-quiz label{color:#e8ebf0!important}
    #ar-quiz input[type="text"],#ar-quiz input[type="email"]{
      background:#1a2030!important;border:1px solid #2a3140!important;color:#e8ebf0!important;
      border-radius:8px!important;
    }
    #ar-toast{position:fixed;z-index:99999;left:50%;top:22px;transform:translateX(-50%);background:#111;color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:none;max-width:90vw;font-size:14px;line-height:1.35;text-align:center}
    #ar-toast.success{background:#4caf50}#ar-toast.error{background:#e5484d}#ar-toast.info{background:#e57200}
    .ar-field{border:1px solid #2a3140;background:#1a2030;border-radius:10px;padding:14px;margin:12px 0;color:#e8ebf0}
    .ar-qtxt{font-weight:800;margin:0 0 8px;color:#e8d9b8!important}
    .ar-opt{
      display:flex;gap:10px;align-items:center;margin:8px 0;cursor:pointer;
      background:#1a2030;border:1px solid #2a3140;border-radius:9px;padding:10px 12px;color:#e8ebf0;
    }
    .ar-opt:has(input:checked){border-color:#d4a64a!important;box-shadow:0 0 0 1px #d4a64a inset}
    #results{background:#151a23!important;border:1px solid #2a3140!important;color:#e8ebf0!important}
    #results h3{color:#e8d9b8!important}
    #results .pill{display:inline-block;padding:6px 10px;border-radius:999px;font-weight:700}
    #results .pill-pass{background:rgba(76,175,80,.2);color:#4caf50;border:1px solid #4caf50}
    #results .pill-fail{background:rgba(229,72,77,.15);color:#e5484d;border:1px solid #e5484d}
    #ar-auth{display:flex;align-items:center;gap:10px;margin:0 0 8px;color:#aab3c0;font-size:14px;flex-wrap:wrap}
    #ar-auth .badge{padding:2px 8px;border-radius:999px;border:1px solid #2a3140;background:#1a2030;color:#aab3c0}
    #ar-auth .mini-btn{background:#1a2030;color:#e8ebf0;border:1px solid #2a3140;border-radius:999px;padding:6px 10px;cursor:pointer;font-size:12px}
    #ar-auth .mini-btn:disabled{opacity:.6;cursor:not-allowed}
    #ar-status{margin:6px 0 0;font-size:14px;color:#e8ebf0}
    .muted{color:#aab3c0!important}
    input[type="radio"]{accent-color:#d4a64a}
    input[type="radio"]:checked{accent-color:#d4a64a}
    #quizAuthMessage{background:#1a2030!important;border:1px solid #d4a64a!important;color:#e8ebf0!important}
    #quizAuthMessage a{color:#e57200!important}
    #btn-submit{background:#e57200!important;color:#fff!important;border:0!important;border-radius:8px!important;font-weight:700!important}
    #btn-retake{
      background:#e57200!important;color:#fff!important;border:0!important;border-radius:8px!important;
      padding:12px 16px!important;font-weight:700!important;cursor:pointer!important;
    }
    #btn-pdf{background:transparent!important;color:#d4a64a!important;border:1.5px solid #d4a64a!important;border-radius:8px!important;font-weight:700!important}
    #btn-certificate{background:#e57200!important;color:#fff!important;border:0!important;border-radius:8px!important;font-weight:700!important}
    #btn-save{background:#111827!important;color:#fff!important;border:0!important;border-radius:8px!important;font-weight:700!important}
    #btn-back-modules,#btn-exit-ghost.btn-back{
      background:transparent!important;color:#aab3c0!important;border:1.5px solid #2a3140!important;
    }
  </style>`;

html = html.slice(0, quizStyleStart) + quizStyle + html.slice(quizStyleEnd + '  </style>'.length);

// Sync LIVE copy header
html = html.replace(
  /<!-- EXPORT:[^\n]*\n<!-- Exported:[^\n]*\n<!-- Canonical[^\n]*\n<!-- Supersedes:[^\n]*\n/,
  `<!-- EXPORT: squarespace-exams-page-LATEST.html — Option B v2.59 reskin -->\n<!-- Updated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC -->\n<!-- Canonical paste for /academy/photography-exams-certification -->\n<!-- Pre-reskin backup: Exams Module/BACKUP-2026-06-10-pre-reskin/ -->\n`
);

fs.writeFileSync(target, html, 'utf8');
const live = path.join(__dirname, '../alanranger-modules/squarespace-exams-page-LIVE.html');
fs.writeFileSync(live, html, 'utf8');
console.log('Patched:', target);
console.log('Lines:', html.split('\n').length);
