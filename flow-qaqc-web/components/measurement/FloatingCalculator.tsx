'use client';

import { useState } from 'react';
import { Calculator, X, Delete } from 'lucide-react';
import { safeEval } from '@lib/MetradosService';
import { useI18n } from '@lib/i18n';

const KEYS = [
  ['C', '⌫', '(', ')'],
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['0', '.', '=', '+'],
];

export function FloatingCalculator() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState<string>('');

  const handleKey = (k: string) => {
    if (k === 'C') { setExpr(''); setResult(''); return; }
    if (k === '⌫') { setExpr(e => e.slice(0, -1)); return; }
    if (k === '=') {
      const v = safeEval(expr);
      setResult(v != null ? String(Number(v.toFixed(6))) : t('webCMeasure.calc.error'));
      return;
    }
    setExpr(e => e + k);
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-navy text-white shadow-xl flex items-center justify-center hover:bg-navy/90 transition"
        title={t('webCMeasure.calc.title')}
      >
        {open ? <X size={22} /> : <Calculator size={22} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-border p-3 flex flex-col gap-2">
          <div className="bg-surface rounded-lg p-3 text-right flex flex-col gap-0.5 min-h-[68px]">
            <p className="text-xs text-muted font-mono break-all">{expr || ' '}</p>
            <p className="text-2xl font-black text-navy font-mono">{result || ' '}</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {KEYS.flat().map(k => {
              const isOp = ['÷', '×', '−', '+', '='].includes(k);
              const isFn = ['C', '⌫', '(', ')'].includes(k);
              return (
                <button
                  key={k}
                  onClick={() => handleKey(k)}
                  className={`py-3 rounded-lg text-base font-bold transition ${
                    k === '=' ? 'bg-success text-white hover:bg-success/90' :
                    isOp ? 'bg-primary/10 text-primary hover:bg-primary/20' :
                    isFn ? 'bg-border text-muted hover:bg-muted/20' :
                    'bg-surface text-navy hover:bg-border'
                  }`}
                >
                  {k === '⌫' ? <Delete size={14} className="mx-auto" /> : k}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
