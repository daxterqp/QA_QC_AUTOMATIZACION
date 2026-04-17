'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Download, ExternalLink, Loader2 } from 'lucide-react';
import { getPreviewData, clearPreviewData } from '@lib/pdfGenerator';

export default function PdfPreview() {
  const [visible, setVisible] = useState(false);
  const [html, setHtml] = useState('');
  const [filename, setFilename] = useState('');
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onReady() {
      const data = getPreviewData();
      if (data) {
        setHtml(data.html);
        setFilename(data.filename);
        setVisible(true);
      }
    }
    window.addEventListener('pdf-preview-ready', onReady);
    return () => window.removeEventListener('pdf-preview-ready', onReady);
  }, []);

  useEffect(() => {
    if (visible && iframeRef.current && html) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
    }
  }, [visible, html]);

  function handleClose() {
    setVisible(false);
    setHtml('');
    setFilename('');
    clearPreviewData();
  }

  async function handleSavePdf() {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.printToPdf) {
      setSaving(true);
      try {
        await electronAPI.printToPdf(html, filename);
      } catch (e) {
        console.error('Error saving PDF:', e);
      } finally {
        setSaving(false);
      }
    } else {
      iframeRef.current?.contentWindow?.print();
    }
  }

  async function handleOpenInBrowser() {
    setOpening(true);
    try {
      const electronAPI = (window as any).electronAPI;
      if (electronAPI?.openHtmlInBrowser) {
        // Abre el HTML como archivo temporal en el navegador del sistema
        await electronAPI.openHtmlInBrowser(html, filename);
      } else if (electronAPI?.sharePdf) {
        // Fallback: usar sharePdf que genera PDF y lo abre con la app del SO
        await electronAPI.sharePdf(html, filename);
      } else {
        // Fallback navegador web: abrir en nueva pestaña
        const w = window.open('', '_blank');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      }
    } catch (e) {
      console.error('Error opening in browser:', e);
    } finally {
      setOpening(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex flex-col">
      {/* Toolbar */}
      <div className="bg-navy flex items-center gap-3 px-5 py-3 shadow-lg flex-shrink-0">
        <span className="text-white font-bold text-sm flex-1 truncate">
          {filename.replace('.pdf', '').replace(/-/g, ' ')}
        </span>

        <button
          onClick={handleSavePdf}
          disabled={saving}
          className="flex items-center gap-1.5 bg-primary hover:bg-primary/80 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {saving ? 'Guardando...' : 'Guardar PDF'}
        </button>

        <button
          onClick={handleOpenInBrowser}
          disabled={opening}
          className="flex items-center gap-1.5 bg-secondary hover:bg-secondary/80 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-50"
        >
          {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
          Abrir en Navegador
        </button>

        <button
          onClick={handleClose}
          className="text-white/60 hover:text-white transition p-1.5 rounded-lg hover:bg-white/10"
          title="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 bg-gray-300 p-4 flex justify-center overflow-hidden">
        <iframe
          ref={iframeRef}
          className="bg-white shadow-2xl rounded-lg"
          style={{ width: '210mm', height: '100%', border: 'none' }}
          title="Vista previa PDF"
        />
      </div>
    </div>
  );
}
