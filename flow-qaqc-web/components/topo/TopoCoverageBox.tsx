'use client';

/**
 * TopoCoverageBox — recuadro (siempre visible) con la cobertura de coordenadas del
 * proyecto: cuántos ensayos no tienen topo, cuántos usan GPS de respaldo y cuántos
 * quedan sin ninguna coordenada. Incluye "Ver detalle" → lista filtrable.
 */
import Link from 'next/link';
import { MapPinned, ChevronRight } from 'lucide-react';
import type { TopoCoverageSummary } from '@lib/topoVisibility';

export function TopoCoverageBox({ summary, detailHref }: { summary: TopoCoverageSummary; detailHref: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex gap-2.5">
      <MapPinned size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="text-[12px] text-amber-900 leading-snug">
          <b>{summary.withoutTopo.length}</b> de <b>{summary.total}</b> ensayos no tienen coordenadas topográficas.
        </p>
        <p className="text-[12px] text-amber-900 leading-snug">
          <b>{summary.usingGps.length}</b> usarán las coordenadas GPS como respaldo.
        </p>
        <p className="text-[12px] text-amber-900 leading-snug">
          <b>{summary.noCoords.length}</b> quedan sin ninguna coordenada.
        </p>
        <Link href={detailHref} className="mt-1 self-start flex items-center gap-1 text-[12px] font-bold text-amber-800 hover:text-amber-900 transition">
          Ver detalle <ChevronRight size={13} />
        </Link>
      </div>
    </div>
  );
}
