'use client';

import { useEffect, useState } from 'react';
import { Printer, QrCode, Tag } from 'lucide-react';
import { generateProtocolQr } from '@lib/qrCodeGenerator';
import { LabelPrintModal } from './LabelPrintModal';
import { buildLabelPayload } from '@lib/labelPrint';
import { useI18n } from '@lib/i18n';

interface Props {
  idProtocolo: string | null;
  externalId: string | null;
  protocolUuid: string;
  protocolName?: string | null;
  /** Nombre del proyecto — opcional, se incluye en la etiqueta. */
  projectName?: string | null;
  /** Ubicación legible — opcional, se incluye en la etiqueta. */
  locationName?: string | null;
  /** Especialidad — opcional, se incluye en la etiqueta. */
  specialty?: string | null;
  /** Campos extra para la etiqueta (ej. partida, lote). */
  labelExtras?: { label: string; value: string }[];
  /** Compact = solo el QR sin botón de imprimir (para inline en cards). */
  compact?: boolean;
}

/** Badge con el QR del protocolo + identificador legible + botón "Imprimir".
 *  La impresión abre una ventana nueva con CSS print-friendly.
 *  Adicionalmente: botón "Etiqueta" abre LabelPrintModal con preview + comandos
 *  ZPL/TSPL para impresoras térmicas (Zebra, TSC, Phomemo, NIIMBOT, etc.). */
export function QRCodeBadge({ idProtocolo, externalId, protocolUuid, protocolName, projectName, locationName, specialty, labelExtras, compact }: Props) {
  const { t } = useI18n();
  const [data, setData] = useState<{ identifier: string; deepLink: string; svg: string } | null>(null);
  const [showLabelModal, setShowLabelModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    generateProtocolQr({ idProtocolo, externalId, protocolUuid, size: compact ? 90 : 140 })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => console.warn('[QR] generación falló:', e));
    return () => { cancelled = true; };
  }, [idProtocolo, externalId, protocolUuid, compact]);

  if (!data) {
    return (
      <div className="inline-flex items-center justify-center bg-surface border border-border rounded p-3 text-muted text-xs">
        <QrCode size={16} className="opacity-50" />
      </div>
    );
  }

  function handlePrint() {
    if (!data) return;
    const w = window.open('', '_blank', 'width=400,height=520');
    if (!w) { alert(t('webCMisc.qr.popupBlocked')); return; }
    w.document.write(`<!doctype html><html><head><title>QR ${data.identifier}</title>
      <style>
        @page { margin: 12mm; }
        body { font-family: -apple-system, system-ui, sans-serif; text-align: center; padding: 20px; }
        .qr  { display: inline-block; padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
        .id  { font-weight: 800; font-size: 14px; color: #1a1a2e; margin-top: 12px; letter-spacing: 0.5px; }
        .name { font-size: 11px; color: #555; margin-top: 2px; max-width: 260px; }
        .link { font-family: ui-monospace, Menlo, monospace; font-size: 9px; color: #888; margin-top: 8px; word-break: break-all; }
      </style></head><body>
      <div class="qr">${data.svg}</div>
      <div class="id">${escape(data.identifier)}</div>
      ${protocolName ? `<div class="name">${escape(protocolName)}</div>` : ''}
      <div class="link">${escape(data.deepLink)}</div>
      <script>window.onload = () => window.print();</script>
    </body></html>`);
    w.document.close();
  }

  if (compact) {
    return (
      <div className="inline-flex flex-col items-center gap-1 p-2 bg-white border border-border rounded">
        <div className="leading-none" dangerouslySetInnerHTML={{ __html: data.svg }} />
        <p className="text-[9px] font-bold text-textPrimary tracking-tight">{data.identifier}</p>
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-2 p-3 bg-white border border-border rounded-lg shadow-subtle">
      <div className="leading-none" dangerouslySetInnerHTML={{ __html: data.svg }} />
      <div className="flex flex-col items-center gap-0.5">
        <p className="text-xs font-extrabold text-navy tracking-wide">{data.identifier}</p>
        {protocolName && <p className="text-[10px] text-textSecondary truncate max-w-[180px]">{protocolName}</p>}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={handlePrint}
          title={t('webCMisc.qr.printTitle')}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold bg-primary text-white hover:bg-primary/90 transition"
        >
          <Printer size={11} /> {t('webCMisc.qr.print')}
        </button>
        <button
          onClick={() => setShowLabelModal(true)}
          title={t('webCMisc.qr.labelTitle')}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[11px] font-bold border border-border bg-white text-textPrimary hover:bg-surface transition"
        >
          <Tag size={11} /> {t('webCMisc.qr.label')}
        </button>
      </div>

      {showLabelModal && (
        <LabelPrintModal
          payload={buildLabelPayload({
            qrIdentifier: data.identifier,
            qrDeepLink: data.deepLink,
            protocolName: protocolName ?? data.identifier,
            projectName: projectName ?? '',
            locationName: locationName ?? null,
            specialty: specialty ?? null,
            customFields: labelExtras,
          })}
          onClose={() => setShowLabelModal(false)}
        />
      )}
    </div>
  );
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
