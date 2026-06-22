'use client';

/**
 * SectorCroquis — Mini-croquis SVG de un sector (sin librería de mapas).
 * Proyecta los vértices lat/lng a un viewBox normalizado con padding. Sirve
 * para una vista rápida de la FORMA del polígono dentro de la tarjeta; el mapa
 * GIS georreferenciado real lo da <SectorMap/>.
 */

type Pt = { lat: number; lng: number };

export function SectorCroquis({
  points,
  color = '#1976D2',
  width = 240,
  height = 150,
}: {
  points: Pt[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 3) {
    return (
      <div
        className="flex items-center justify-center rounded bg-surface text-[11px] text-muted"
        style={{ width, height }}
      >
        Sin geometría para dibujar
      </div>
    );
  }

  const pad = 14;
  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1e-6;
  const spanLng = maxLng - minLng || 1e-6;

  // Conserva proporción geográfica (corrige por coseno de la latitud media).
  const cosLat = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180) || 1;
  const geoW = spanLng * cosLat;
  const geoH = spanLat;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const scale = Math.min(innerW / geoW, innerH / geoH);
  const drawW = geoW * scale;
  const drawH = geoH * scale;
  const offX = pad + (innerW - drawW) / 2;
  const offY = pad + (innerH - drawH) / 2;

  const project = (p: Pt) => {
    const x = offX + ((p.lng - minLng) * cosLat) * scale;
    // lat mayor = arriba → invertir Y
    const y = offY + (maxLat - p.lat) * scale;
    return { x, y };
  };

  const proj = points.map(project);
  const poly = proj.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} className="rounded bg-surface border border-border">
      <polygon points={poly} fill={color + '33'} stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {proj.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={2.6} fill={color} />
          <text x={p.x + 4} y={p.y - 4} fontSize={8} fill="#445" fontWeight={700}>{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}
