'use client';

import { useMemo } from 'react';
import type { Scope } from '@lib/formulaEval';
import { renderChartSvg, type ChartMode, type ChartFit } from '@lib/chartRenderer';

interface Props {
  mode: ChartMode;
  xRefs: string[];
  yRefs: string[];
  scope: Scope;
  width?: number;
  height?: number;
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  // v32 — extensiones opcionales del gráfico
  y2Refs?: string[];
  y3Refs?: string[];
  seriesLabels?: (string | undefined)[];
  bandLoRefs?: string[];
  bandHiRefs?: string[];
  fit?: ChartFit;
  /** Proporción alto/ancho en % (DSL `alto:`). Default: height explícito o 260. */
  aspectPct?: number;
}

/** SVG inline para protocolos numéricos.
 *  Delega el rendering al módulo puro `chartRenderer` para que web y PDF
 *  produzcan idéntico output. El SVG se inyecta vía `dangerouslySetInnerHTML`. */
export function NumericChart({
  mode, xRefs, yRefs, scope, width = 480, height = 260, title, xAxisTitle, yAxisTitle,
  y2Refs, y3Refs, seriesLabels, bandLoRefs, bandHiRefs, fit, aspectPct,
}: Props) {
  const effHeight = aspectPct ? Math.round(width * (aspectPct / 100)) : height;
  const svg = useMemo(
    () => renderChartSvg(
      { mode, xRefs, yRefs, title, xAxisTitle, yAxisTitle, y2Refs, y3Refs, seriesLabels, bandLoRefs, bandHiRefs, fit },
      scope,
      { width, height: effHeight },
    ),
    [mode, xRefs, yRefs, scope, title, xAxisTitle, yAxisTitle, y2Refs, y3Refs, seriesLabels, bandLoRefs, bandHiRefs, fit, width, effHeight],
  );
  return (
    <div
      className="flex justify-center py-2 [&>svg]:max-w-full [&>svg]:h-auto"
      style={{ width: '100%' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
