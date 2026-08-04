/**
 * Genera el SQL de alta del proyecto Mercado Mayorista en Supabase:
 * proyecto + flags + sectores + ubicaciones + 13 plantillas + 201 ítems.
 * Lee el Excel maestro (fuente única de verdad de las fichas).
 *
 * Ejecutar DESDE la raíz del repo:
 *   node "01 Proyecto_Mercado_Mayorista/_genSQL.js" > salida.sql
 */
const XLSX = require('xlsx');
const path = require('path');

const ORG = '11111111-1111-4111-8111-111111111111';
const CREATOR = 'hgq9FRDzaVS8N1v5';
const PROJECT_ID = 'mmhYnc2026Unica';          // 15 chars, estable y legible
const NOW = Date.now();

// ID determinista de 16 chars (reproducible entre corridas)
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function idFrom(seed) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) * (i + 7), 0x85ebca6b) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 16; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 0x2545f491) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x9e3779b1) >>> 0;
    // `>>> 0` es OBLIGATORIO: el XOR de JS devuelve int32 CON SIGNO y un índice
    // negativo daría `undefined` en vez de un carácter.
    out += ALPHABET[((h1 ^ h2 ^ i) >>> 0) % ALPHABET.length];
  }
  return out;
}
const q = (s) => s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;

// ── Flags del proyecto (ver SETUP_PROYECTO.md) ───────────────────────────────
const FLAGS = {
  project_type: 'edificaciones',
  classic_protocols: true,
  numeric_protocols: true,
  parametric_templates: false,
  historical_import: false,
  multi_level_approval: true,
  approval_levels: 3,
  dossier_observe_inline: false,
  module_protocols_by_location: true,
  fill_by_sector: true,
  fill_by_type: true,
  fill_by_date: false,
  fill_by_sample: false,
  protocol_codes: true,
  coding_mask_default: '{TIPO}-{AA}{SEQ:4}',
  coding_seq_reset: 'year',
  deletion_mode: 'last_only',
  module_plans: true,
  module_contacts: true,
  module_summary_tables: true,
  module_email_reports: false,
  module_ai_assistant: true,
  ai_provider: 'claude',
  ai_model_tier: 'economico',
  ai_quick_button: true,
  ai_project_description:
    'Ampliación de la Zona de Bancos (segundo nivel) del mercado mayorista Plaza Unicachi Huancayo, ' +
    'ubicado en Av. Mariscal Castilla Sub Lote 2, distrito El Tambo, provincia de Huancayo, departamento de Junín. ' +
    'Cliente y supervisión: Plaza Unicachi Mayorista Huancayo S.A. Contratista: Grupo VRS S.A.C. ' +
    'Topografía a cargo de Abugattas Ingenieros S.A. La obra se organiza en bloques A, B y C con zonas Z1 a Z11, ' +
    'e incluye trabajos de topografía (trazo, replanteo y levantamiento del terreno), estructuras (acero, encofrado, ' +
    'colocación de concreto, perforación y anclaje de acero, planchas metálicas y pernos para pedestales) ' +
    'e instalaciones sanitarias y eléctricas. El control de calidad se ejecuta con protocolos de verificación ' +
    'firmados por Ingeniero de Calidad, Residente de Obra y Supervisión.',
  module_topo: false,
  topo_replace_gps: false,
  topo_keep_gps_fallback: false,
  topo_processing_enabled: false,
  map_enabled: true,
  gps_capture_numeric: true,
  gps_capture_subjective: true,
  coordinate_system: 'WGS84_LATLNG',
  normas: true,
  qr_codes: true,
  plans_pdf: true,
  phone_contacts: true,
  equipment_catalog: false,
  advanced_charts: true,
  protocol_linking: true,
  traceability_module: false,
  traceability_gps_polling: 'off',
  traceability_gps_interval_seconds: 3,
  anonymize_traceability: false,
  print_header_color: '#0e213d',
  sample_form_rows: { material: true, condition: true, depth: false, coords: true, layers: false },
  sample_materials: [],
};

const SECTORES = ['Bloque A', 'Bloque B', 'Bloque C'];
const COLORES = ['#7E57C2', '#00897B', '#C2185B'];
const UBICACIONES = [
  { name: 'Primer Nivel', plan: 'PLANO ESTRUCTURAS E-06', specialty: 'Estructuras' },
  { name: 'Segundo Nivel - Zona de Bancos', plan: 'PLANO ESTRUCTURAS E-08/E-12', specialty: 'Estructuras' },
];

// ── Fichas desde el Excel maestro ────────────────────────────────────────────
const wb = XLSX.readFile(path.join(__dirname, '02 Excel Maestro', 'MAESTRO_Mercado_Mayorista_v1.xlsx'));
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Actividades'], { defval: '' });

const byProto = new Map();
for (const r of rows) {
  const id = String(r.ID_Protocolo).trim();
  if (!byProto.has(id)) byProto.set(id, { name: String(r.Protocolo).trim(), items: [] });
  byProto.get(id).items.push({
    partida: String(r.PartidaItem).trim(),
    desc: String(r['Actividad realizada']).trim(),
    metodo: String(r['Método de validación']).trim(),
    seccion: String(r['Sección'] ?? '').trim(),
  });
}

const L = [];
L.push('-- Alta del proyecto Mercado Mayorista Plaza Unicachi Huancayo');
L.push(`-- Generado por _genSQL.js · ${new Date(NOW).toISOString()}`);
L.push('BEGIN;');
L.push('');

// Proyecto
L.push(`INSERT INTO projects (id, name, status, created_by_id, created_at, updated_at, feature_flags, org_id, stamp_enabled, stamp_gps, stamp_size, is_demo)
VALUES (${q(PROJECT_ID)}, ${q('Mercado Mayorista Huancayo')}, 'ACTIVE', ${q(CREATOR)}, ${NOW}, ${NOW},
        ${q(JSON.stringify(FLAGS))}::jsonb, ${q(ORG)}, true, true, 'normal', false);`);
L.push('');

// Sectores
L.push('-- Sectores');
SECTORES.forEach((name, i) => {
  L.push(`INSERT INTO project_sectors (id, project_id, name, display_color, sort_order, created_at, updated_at, org_id)
VALUES (${q(idFrom('sec|' + name))}, ${q(PROJECT_ID)}, ${q(name)}, ${q(COLORES[i])}, ${i + 1}, ${NOW}, ${NOW}, ${q(ORG)});`);
});
L.push('');

// Ubicaciones
L.push('-- Ubicaciones');
UBICACIONES.forEach(u => {
  L.push(`INSERT INTO locations (id, project_id, name, reference_plan, specialty, created_at, updated_at, org_id)
VALUES (${q(idFrom('loc|' + u.name))}, ${q(PROJECT_ID)}, ${q(u.name)}, ${q(u.plan)}, ${q(u.specialty)}, ${NOW}, ${NOW}, ${q(ORG)});`);
});
L.push('');

// Plantillas + ítems
L.push('-- Plantillas de ensayo (13) e ítems (201)');
for (const [idProto, data] of byProto) {
  const tplId = idFrom('tpl|' + idProto);
  L.push(`INSERT INTO protocol_templates (id, project_id, id_protocolo, name, created_at, updated_at, is_hidden, org_id)
VALUES (${q(tplId)}, ${q(PROJECT_ID)}, ${q(idProto)}, ${q(data.name)}, ${NOW}, ${NOW}, false, ${q(ORG)});`);
  const values = data.items.map(it =>
    `(${q(idFrom('itm|' + idProto + '|' + it.partida))}, ${q(tplId)}, ${q(it.partida)}, ${q(it.desc)}, ${q(it.metodo || null)}, ${q(it.seccion || null)}, ${NOW}, ${NOW}, ${q(ORG)})`
  );
  L.push(`INSERT INTO protocol_template_items (id, template_id, partida_item, item_description, validation_method, section, created_at, updated_at, org_id) VALUES\n${values.join(',\n')};`);
  L.push('');
}

L.push('COMMIT;');
console.log(L.join('\n'));
