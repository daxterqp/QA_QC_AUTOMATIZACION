'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, Copy, Download, Printer, Check } from 'lucide-react';
import {
  LABEL_SIZES, toZPL, toTSPL, toLabelHtml,
  type LabelPayload, type LabelSize,
} from '@lib/labelPrint';
import { useI18n } from '@lib/i18n';

type Format = 'preview' | 'zpl' | 'tspl';

interface Props {
  payload: LabelPayload;
  onClose: () => void;
}

/** Modal de impresión de etiqueta. Permite elegir tamaño y formato, ver preview,
 *  copiar comando al portapapeles y descargar como archivo .zpl/.tspl/.html. */
export function LabelPrintModal({ payload, onClose }: Props) {
  const { t } = useI18n();
  const FORMAT_LABELS: Record<Format, string> = {
    preview: t('webCMisc.label.formatPreview'),
    zpl: t('webCMisc.label.formatZpl'),
    tspl: t('webCMisc.label.formatTspl'),
  };
  const FORMAT_DESCRIPTIONS: Record<Format, string> = {
    preview: t('webCMisc.label.descPreview'),
    zpl: t('webCMisc.label.descZpl'),
    tspl: t('webCMisc.label.descTspl'),
  };
  const [sizeKey, setSizeKey] = useState<keyof typeof LABEL_SIZES>('50x30');
  const [format, setFormat] = useState<Format>('preview');
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const size: LabelSize = LABEL_SIZES[sizeKey];

  // Genera el comando según formato seleccionado. Memoizado por (payload, size, format).
  const command = useMemo(() => {
    if (format === 'zpl') return toZPL(payload, size);
    if (format === 'tspl') return toTSPL(payload, size);
    return '';
  }, [payload, size, format]);

  // El preview HTML es async (genera SVG QR). Lo computamos en efecto y guardamos.
  useEffect(() => {
    let cancelled = false;
    toLabelHtml(payload, size).then(html => {
      if (!cancelled) setPreviewHtml(html);
    });
    return () => { cancelled = true; };
  }, [payload, size]);

  function handleCopy() {
    const text = format === 'preview' ? previewHtml : command;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleDownload() {
    const ext = format === 'preview' ? 'html' : format;
    const mime = format === 'preview' ? 'text/html' : 'text/plain';
    const text = format === 'preview' ? previewHtml : command;
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `etiqueta-${payload.sampleId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handlePrintHtml() {
    const w = window.open('', '_blank', 'width=600,height=400');
    if (!w) { alert(t('webCMisc.label.popupBlocked')); return; }
    w.document.write(previewHtml);
    w.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h3 className="text-base font-bold text-navy">{t('webCMisc.label.title')}</h3>
            <p className="text-xs text-textSecondary mt-0.5">{t('webCMisc.label.subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-textSecondary hover:text-textPrimary">
            <X size={20} />
          </button>
        </div>

        {/* Selectors */}
        <div className="px-5 py-3 border-b border-border grid grid-cols-2 gap-4 text-xs">
          <div className="flex flex-col gap-1">
            <label className="text-textSecondary font-bold uppercase tracking-wider">{t('webCMisc.label.size')}</label>
            <select
              value={sizeKey}
              onChange={e => setSizeKey(e.target.value as keyof typeof LABEL_SIZES)}
              className="border border-border rounded px-2 py-1.5 text-sm bg-white"
            >
              {Object.entries(LABEL_SIZES).map(([key, s]) => (
                <option key={key} value={key}>{s.widthMm} × {s.heightMm} mm</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-textSecondary font-bold uppercase tracking-wider">{t('webCMisc.label.format')}</label>
            <select
              value={format}
              onChange={e => setFormat(e.target.value as Format)}
              className="border border-border rounded px-2 py-1.5 text-sm bg-white"
            >
              {Object.entries(FORMAT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="px-5 py-2 bg-surface text-[11px] text-textSecondary leading-relaxed">
          {FORMAT_DESCRIPTIONS[format]}
        </div>

        {/* Content area: preview or code */}
        <div className="flex-1 overflow-auto p-5 bg-white">
          {format === 'preview' ? (
            <PreviewPane html={previewHtml} size={size} />
          ) : (
            <pre className="font-mono text-[11px] text-textPrimary bg-surface border border-border rounded p-3 whitespace-pre-wrap break-all min-h-[200px]">
              {command || t('webCMisc.label.generating')}
            </pre>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
          <p className="text-[10px] text-textSecondary flex-1">
            {t('webCMisc.label.identifier')} <code className="font-mono font-bold text-textPrimary">{payload.sampleId}</code>
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              disabled={format !== 'preview' && !command}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-border bg-white hover:bg-surface disabled:opacity-50"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              {copied ? t('webCMisc.label.copied') : t('webCMisc.label.copy')}
            </button>
            <button
              onClick={handleDownload}
              disabled={format !== 'preview' && !command}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border border-border bg-white hover:bg-surface disabled:opacity-50"
            >
              <Download size={12} />
              .{format === 'preview' ? 'html' : format}
            </button>
            {format === 'preview' && (
              <button
                onClick={handlePrintHtml}
                disabled={!previewHtml}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
              >
                <Printer size={12} />
                {t('webCMisc.label.print')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Preview WYSIWYG de la etiqueta. Renderizamos el HTML en un iframe scaled
 *  para que se vea a tamaño real (zoom 200% por defecto para que sea legible). */
function PreviewPane({ html, size }: { html: string; size: LabelSize }) {
  const { t } = useI18n();
  const ZOOM = 3; // 3x para que mm se vean cómodos en pantalla
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="border-2 border-dashed border-border rounded bg-white shadow-subtle"
        style={{
          width: `${size.widthMm * ZOOM}mm`,
          height: `${size.heightMm * ZOOM}mm`,
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <iframe
          srcDoc={html.replace(/window\.print\(\)/g, '/* preview */')}
          style={{
            width: `${size.widthMm}mm`,
            height: `${size.heightMm}mm`,
            border: 'none',
            transform: `scale(${ZOOM})`,
            transformOrigin: 'top left',
          }}
          sandbox="allow-same-origin"
          title={t('webCMisc.label.previewTitle')}
        />
      </div>
      <p className="text-[10px] text-textSecondary">{t('webCMisc.label.previewScaled', { w: size.widthMm, h: size.heightMm })}</p>
    </div>
  );
}
