/**
 * reportMailer.ts — Entrada del cron (GitHub Action). Barre los modelos de reporte vencidos y
 * envía cada uno. Corre con `npx tsx scripts/reportMailer.ts` desde flow-qaqc-web (node_modules
 * con @resvg/@aws-sdk). Secrets por env (ver .github/workflows/report-mailer.yml).
 */
import { dueTemplates, sendReport } from '../lib/reports/generate';

async function main() {
  const due = await dueTemplates();
  console.log(`[reportMailer] ${due.length} modelo(s) vencido(s).`);
  let ok = 0, err = 0;
  for (const t of due) {
    const r = await sendReport({ templateId: t.id });
    if (r.ok) { ok++; console.log(`  ✓ ${t.id} → ${r.recipients} dest.`); }
    else { err++; console.warn(`  ✗ ${t.id}: ${r.error}`); }
  }
  console.log(`[reportMailer] listo. OK=${ok} ERR=${err}`);
}

main().catch(e => { console.error('[reportMailer] fatal:', e); process.exit(1); });
