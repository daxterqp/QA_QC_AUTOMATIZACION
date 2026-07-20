/**
 * linearProgress.ts (v100b) — Avance de OBRA LINEAL por subtramo.
 *
 * Modelo (juego de ensayos UNIFORME por subtramo):
 *  - total esperado = (Σ subtramos de todos los tramos) × (Σ cantidades del juego).
 *  - un subtramo está COMPLETO cuando, para cada tipo del juego, tiene ≥ cantidad
 *    de ensayos APROBADOS.
 *  - el avance cuenta, por (tramo, subtramo, tipo), min(aprobados, cantidad requerida)
 *    para no pasarse del 100% si se hacen ensayos de más.
 *
 * Función PURA. ESPEJO EXACTO de src/utils/linearProgress.ts — mantener sincronizado.
 */
import { subtramoCount } from './coordinateTopo';

export interface LinearTramoIn {
  id: string;
  stationStart: number | null;
  stationEnd: number | null;
}
export interface LinearProtocolIn {
  sectorId: string | null;      // = tramo
  subtramoIndex: number | null;
  idProtocolo: string | null;   // tipo de ensayo (ya resuelto desde templateId)
  status: string;               // 'APPROVED' cuenta como avance
}
export interface LinearSubtramoProgress {
  tramoId: string;
  subtramoIndex: number;
  done: number;
  total: number;
  complete: boolean;
}
export interface LinearProgressResult {
  totalExpected: number;
  approved: number;
  percent: number;
  totalSubtramos: number;
  juegoSize: number;
  bySubtramo: LinearSubtramoProgress[];
}

export function computeLinearProgress(
  subtramoLenM: number,
  testSet: { id_protocolo: string; count: number }[],
  tramos: LinearTramoIn[],
  protocols: LinearProtocolIn[],
): LinearProgressResult {
  const juego = (testSet ?? []).filter(x => x && x.id_protocolo && x.count > 0);
  const juegoSize = juego.reduce((s, x) => s + x.count, 0);

  const validTramos = tramos.filter(t =>
    typeof t.stationStart === 'number' && Number.isFinite(t.stationStart) &&
    typeof t.stationEnd === 'number' && Number.isFinite(t.stationEnd) &&
    (t.stationEnd as number) > (t.stationStart as number));
  const nSubOf = new Map<string, number>();
  let totalSubtramos = 0;
  for (const t of validTramos) {
    const n = subtramoCount(t.stationStart as number, t.stationEnd as number, subtramoLenM);
    nSubOf.set(t.id, n);
    totalSubtramos += n;
  }
  const totalExpected = totalSubtramos * juegoSize;

  const key = (tramoId: string, sub: number, tipo: string) => `${tramoId}::${sub}::${tipo}`;
  const approvedMap = new Map<string, number>();
  for (const p of protocols) {
    if (p.status !== 'APPROVED') continue;
    if (!p.sectorId || p.idProtocolo == null) continue;
    if (typeof p.subtramoIndex !== 'number' || !Number.isFinite(p.subtramoIndex)) continue;
    if (!nSubOf.has(p.sectorId)) continue;
    const k = key(p.sectorId, p.subtramoIndex, p.idProtocolo);
    approvedMap.set(k, (approvedMap.get(k) ?? 0) + 1);
  }

  let approved = 0;
  const bySubtramo: LinearSubtramoProgress[] = [];
  for (const t of validTramos) {
    const nSub = nSubOf.get(t.id) ?? 0;
    for (let sub = 0; sub < nSub; sub++) {
      let done = 0;
      let complete = true;
      for (const it of juego) {
        const got = approvedMap.get(key(t.id, sub, it.id_protocolo)) ?? 0;
        done += Math.min(got, it.count);
        if (got < it.count) complete = false;
      }
      approved += done;
      bySubtramo.push({ tramoId: t.id, subtramoIndex: sub, done, total: juegoSize, complete });
    }
  }

  const percent = totalExpected > 0 ? Math.round((approved / totalExpected) * 100) : 0;
  return { totalExpected, approved, percent, totalSubtramos, juegoSize, bySubtramo };
}
