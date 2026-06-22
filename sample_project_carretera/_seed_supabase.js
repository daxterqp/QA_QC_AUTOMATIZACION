/**
 * Seed Supabase con catálogos de Trazabilidad directamente desde el xlsx.
 * Bypassea el flujo de import del móvil — útil cuando el sync local→remoto
 * tiene problemas y queremos verificar que los pickers funcionan.
 *
 * Uso: node sample_project_carretera/_seed_supabase.js <project_id>
 */
const XLSX = require('xlsx');
const crypto = require('crypto');
const path = require('path');

const BASE = 'https://uimlobhczjctoytejkgh.supabase.co/rest/v1';
const KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbWxvYmhjempjdG95dGVqa2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODYzODQsImV4cCI6MjA4OTM2MjM4NH0.LawnHHTjCQMYgYw7fXX_tvz-wBTps-M1W4bsz_2eXZI';
const H    = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const PID = process.argv[2];
if (!PID) { console.error('Falta project_id'); process.exit(1); }

const KIND_MAP = {
  productiva: 'productive', productivas: 'productive', productive: 'productive',
  mantenimiento: 'maintenance', maintenance: 'maintenance',
  transporte: 'transport', transport: 'transport',
  otro: 'other', otros: 'other', other: 'other',
};

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const newId = p => `${p}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

async function req(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { ...H, Prefer: 'return=representation' }, body: body && JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`${method} ${path} → ${r.status}: ${t}`); }
  return r.json();
}

(async () => {
  const wb = XLSX.readFile(path.join(__dirname, '5_trazabilidad.xlsx'));

  // 1. Leer equipos de Supabase (asumimos ya subidos por el cel)
  const equipR = await fetch(BASE + '/equipment?project_id=eq.' + PID + '&select=id,code', { headers: H });
  const equip = await equipR.json();
  console.log(`[seed] Equipos en Supabase: ${equip.length}`);
  if (equip.length === 0) { console.error('No hay equipos en Supabase — sincroniza primero'); process.exit(1); }
  const equipByCode = new Map(equip.map(e => [norm(e.code), e]));

  // 2. Actividades — leer existentes y crear faltantes
  const existActsR = await fetch(BASE + '/activities?project_id=eq.' + PID + '&select=*', { headers: H });
  const existActs = await existActsR.json();
  const actsByName = new Map(existActs.map(a => [norm(a.name), a]));

  const actsRows = XLSX.utils.sheet_to_json(wb.Sheets['Actividades'], { header: 1, defval: '' });
  const aHeaders = actsRows[0].map(h => String(h).trim().toLowerCase());
  const iAName = aHeaders.findIndex(h => ['nombre','name','actividad'].includes(h));
  const iAKind = aHeaders.findIndex(h => ['tipo','kind','categoria'].includes(h));
  const newActs = [];
  for (let i = 1; i < actsRows.length; i++) {
    const name = String(actsRows[i][iAName] ?? '').trim();
    if (!name || actsByName.has(norm(name))) continue;
    const kindRaw = iAKind !== -1 ? norm(String(actsRows[i][iAKind] ?? '')) : 'productive';
    const kind = KIND_MAP[kindRaw] ?? 'other';
    const now = Date.now();
    newActs.push({ id: newId('act'), project_id: PID, name, kind, created_at: now, updated_at: now });
  }
  if (newActs.length > 0) {
    const inserted = await req('POST', '/activities', newActs);
    for (const a of inserted) actsByName.set(norm(a.name), a);
    console.log(`[seed] Actividades insertadas: ${inserted.length}`);
  } else { console.log('[seed] Actividades ya existían'); }

  // 3. Turnos
  const existShR = await fetch(BASE + '/work_shifts?project_id=eq.' + PID + '&select=*', { headers: H });
  const existSh = await existShR.json();
  const shByName = new Map(existSh.map(s => [norm(s.name), s]));
  const shRows = XLSX.utils.sheet_to_json(wb.Sheets['Turnos'], { header: 1, defval: '' });
  const shHead = shRows[0].map(h => String(h).trim().toLowerCase());
  const iSName = shHead.findIndex(h => h === 'nombre' || h === 'name');
  const iSStart = shHead.findIndex(h => h.includes('inicio') || h.includes('start'));
  const iSEnd = shHead.findIndex(h => h.includes('fin') || h.includes('end'));
  const newSh = [];
  for (let i = 1; i < shRows.length; i++) {
    const name = String(shRows[i][iSName] ?? '').trim();
    if (!name || shByName.has(norm(name))) continue;
    const startH = parseInt(String(shRows[i][iSStart])); const endH = parseInt(String(shRows[i][iSEnd]));
    const now = Date.now();
    newSh.push({ id: newId('shift'), project_id: PID, name, start_hour: startH, end_hour: endH, created_at: now, updated_at: now });
  }
  if (newSh.length > 0) {
    const inserted = await req('POST', '/work_shifts', newSh);
    console.log(`[seed] Turnos insertados: ${inserted.length}`);
  } else { console.log('[seed] Turnos ya existían'); }

  // 4. Plantillas + items
  const existTmplR = await fetch(BASE + '/session_form_templates?project_id=eq.' + PID + '&select=*', { headers: H });
  const existTmpl = await existTmplR.json();
  const tmplByName = new Map(existTmpl.map(t => [norm(t.name), t]));
  const tmplRows = XLSX.utils.sheet_to_json(wb.Sheets['Plantillas Formulario'], { header: 1, defval: '' });
  const tHead = tmplRows[0].map(h => String(h).trim());
  const iTTmpl = tHead.findIndex(h => /plantilla|template/i.test(h));
  const iTPart = tHead.findIndex(h => /partida/i.test(h) && !/item/i.test(h));
  const iTItem = tHead.findIndex(h => /^item$|actividad realizada/i.test(h.trim()));
  const iTVal  = tHead.findIndex(h => /m[eé]todo|validaci[oó]n/i.test(h));
  const iTSec  = tHead.findIndex(h => /secci[oó]n|section/i.test(h));
  const tmplNames = [...new Set(tmplRows.slice(1).map(r => String(r[iTTmpl] ?? '').trim()).filter(Boolean))];
  const newTmpls = [];
  for (const name of tmplNames) {
    if (tmplByName.has(norm(name))) continue;
    const now = Date.now();
    newTmpls.push({ id: newId('tmpl'), project_id: PID, name, created_at: now, updated_at: now });
  }
  if (newTmpls.length > 0) {
    const inserted = await req('POST', '/session_form_templates', newTmpls);
    for (const t of inserted) tmplByName.set(norm(t.name), t);
    console.log(`[seed] Plantillas insertadas: ${inserted.length}`);
  } else { console.log('[seed] Plantillas ya existían'); }

  // Items
  const newItems = [];
  for (let i = 1; i < tmplRows.length; i++) {
    const tName = String(tmplRows[i][iTTmpl] ?? '').trim();
    const item  = String(tmplRows[i][iTItem] ?? '').trim();
    if (!tName || !item) continue;
    const tmpl = tmplByName.get(norm(tName));
    if (!tmpl) continue;
    const now = Date.now();
    newItems.push({
      id: newId('tmplitem'), template_id: tmpl.id,
      partida_item: iTPart !== -1 ? (String(tmplRows[i][iTPart] ?? '').trim() || null) : null,
      item_description: item,
      validation_method: iTVal !== -1 ? (String(tmplRows[i][iTVal] ?? '').trim() || null) : null,
      section: iTSec !== -1 ? (String(tmplRows[i][iTSec] ?? '').trim() || null) : null,
      created_at: now, updated_at: now,
    });
  }
  if (newItems.length > 0) {
    // Borra items previos por template antes de re-insertar (idempotente)
    for (const t of tmplByName.values()) {
      await fetch(BASE + '/session_form_template_items?template_id=eq.' + t.id, { method: 'DELETE', headers: H });
    }
    const inserted = await req('POST', '/session_form_template_items', newItems);
    console.log(`[seed] Items de plantillas insertados: ${inserted.length}`);
  }

  // 5. Equipo-Actividad
  const eaRows = XLSX.utils.sheet_to_json(wb.Sheets['Equipo-Actividad'], { header: 1, defval: '' });
  const eaHead = eaRows[0].map(h => String(h).trim().toLowerCase());
  const iEACode = eaHead.findIndex(h => h.includes('codigo') || h.includes('código') || h === 'code');
  const iEAAct  = eaHead.findIndex(h => h === 'actividad' || h === 'activity');
  const iEATmpl = eaHead.findIndex(h => h.includes('plantilla') || h.includes('template') || h.includes('formulario'));
  const eqIds = equip.map(e => e.id);
  const existLinksR = await fetch(BASE + `/equipment_activities?equipment_id=in.(${eqIds.map(i => `"${i}"`).join(',')})&select=*`, { headers: H });
  const existLinks = await existLinksR.json();
  const linkKey = (e, a) => `${e}::${a}`;
  const linkSet = new Set(existLinks.map(l => linkKey(l.equipment_id, l.activity_id)));
  const newLinks = [];
  let skipped = 0;
  for (let i = 1; i < eaRows.length; i++) {
    const code = String(eaRows[i][iEACode] ?? '').trim();
    const act  = String(eaRows[i][iEAAct] ?? '').trim();
    if (!code || !act) continue;
    const eq = equipByCode.get(norm(code));
    const a  = actsByName.get(norm(act));
    if (!eq || !a) { skipped++; continue; }
    if (linkSet.has(linkKey(eq.id, a.id))) continue;
    const tmplName = iEATmpl !== -1 ? (String(eaRows[i][iEATmpl] ?? '').trim() || null) : null;
    const tmpl = tmplName ? tmplByName.get(norm(tmplName)) : null;
    const now = Date.now();
    newLinks.push({
      id: newId('eqact'), equipment_id: eq.id, activity_id: a.id,
      form_template_id: tmpl?.id ?? null,
      created_at: now, updated_at: now,
    });
  }
  if (newLinks.length > 0) {
    const inserted = await req('POST', '/equipment_activities', newLinks);
    console.log(`[seed] Vínculos equipo-actividad insertados: ${inserted.length} (omitidos por FK no resuelta: ${skipped})`);
  } else { console.log(`[seed] Vínculos ya existían (omitidos por FK: ${skipped})`); }

  console.log('\n✓ Seed completo. Verifica en el cel: tira-down de actividad debería mostrar opciones.');
})().catch(e => { console.error('[seed] ERROR:', e.message); process.exit(1); });
