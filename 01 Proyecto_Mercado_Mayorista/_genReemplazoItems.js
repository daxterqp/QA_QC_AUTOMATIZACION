/**
 * Genera el SQL que REEMPLAZA los ítems de las fichas por la redacción v3
 * (criterio de evaluación real).
 *
 * Por qué DELETE + INSERT y no UPDATE como en v2: la v3 CAMBIA la cantidad de
 * partidas (se añaden los controles que faltaban y se separan preguntas con dos
 * criterios). Un UPDATE por partida dejaría huérfanas las partidas sobrantes.
 *
 * Es seguro AHORA porque el proyecto no tiene ensayos: los 13 de prueba fueron a
 * la papelera. Sobre un proyecto con ensayos vivos esto NO se hace — ver §7bis
 * de docs/FLUJO_EDICION_FICHAS.md.
 *
 * Ejecutar DESDE la raíz del repo:
 *   node "01 Proyecto_Mercado_Mayorista/_genReemplazoItems.js"
 */
const fs = require('fs');
const path = require('path');
const { ALL } = require('./_genMaestro.js');

const PROJECT_ID = 'mmhYnc2026Unica';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TS = 1786000000000;

const q = s => "'" + String(s).replace(/'/g, "''") + "'";

/** ID determinista de 16 chars (mismo generador que _genSQL.js).
 *  El `>>> 0` es OBLIGATORIO: el XOR de JS devuelve int32 CON SIGNO y un índice
 *  negativo daría `undefined` en vez de un carácter. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function genId(seed) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  let out = '';
  for (let i = 0; i < 16; i++) {
    h1 = Math.imul(h1 ^ (h1 >>> 15), 0x2545f491) >>> 0;
    h2 = Math.imul(h2 ^ (h2 >>> 13), 0x9e3779b1) >>> 0;
    out += ALPHABET[((h1 ^ h2 ^ i) >>> 0) % ALPHABET.length];
  }
  return out;
}

const values = ALL.map(r => {
  const id = genId(`v3|${PROJECT_ID}|${r.ID_Protocolo}|${r.PartidaItem}`);
  return `(${q(id)}, ${q(r.ID_Protocolo)}, ${q(r.PartidaItem)}, ${q(r['Actividad realizada'])}, ${q(r['Método de validación'])}, ${q(r['Sección'])})`;
}).join(',\n    ');

// Sanity: sin IDs repetidos (una colisión pisaría un ítem en silencio).
const ids = ALL.map(r => genId(`v3|${PROJECT_ID}|${r.ID_Protocolo}|${r.PartidaItem}`));
if (new Set(ids).size !== ids.length) {
  console.error('✗ COLISIÓN de IDs generados. No se escribe el archivo.');
  process.exit(1);
}

const sql = `-- Mercado Mayorista — redacción v3 (criterio de evaluación real).
-- Generado por _genReemplazoItems.js. UNA sola sentencia: atómica, y todos los
-- CTEs leen el mismo snapshot, así que el respaldo captura el estado PREVIO.
WITH nuevos (id, id_protocolo, partida_item, descripcion, metodo, seccion) AS (
  VALUES
    ${values}
),
-- 1) Respaldo del estado actual de las 13 fichas.
respaldo AS (
  INSERT INTO ficha_edit_backups (template_id, project_id, label, operation, snapshot)
  SELECT pt.id, pt.project_id,
         'Antes de v3 — criterio de evaluación real (' || pt.id_protocolo || ')',
         'replace_items_v3',
         jsonb_agg(jsonb_build_object(
           'partida_item', i.partida_item, 'item_description', i.item_description,
           'validation_method', i.validation_method, 'section', i.section
         ) ORDER BY (i.partida_item)::int)
  FROM protocol_templates pt
  JOIN protocol_template_items i ON i.template_id = pt.id
  WHERE pt.project_id = ${q(PROJECT_ID)}
  GROUP BY pt.id, pt.project_id, pt.id_protocolo
  RETURNING 1
),
-- 2) Fuera los ítems viejos (cambia la cantidad de partidas, no solo el texto).
borrados AS (
  DELETE FROM protocol_template_items i
  USING protocol_templates pt
  WHERE pt.project_id = ${q(PROJECT_ID)} AND i.template_id = pt.id
  RETURNING 1
),
-- 3) Ítems v3.
insertados AS (
  INSERT INTO protocol_template_items
    (id, template_id, partida_item, item_description, validation_method, section, created_at, updated_at, org_id)
  SELECT n.id, pt.id, n.partida_item, n.descripcion, n.metodo, n.seccion, ${TS}, ${TS}, ${q(ORG_ID)}
  FROM nuevos n
  JOIN protocol_templates pt
    ON pt.project_id = ${q(PROJECT_ID)} AND pt.id_protocolo = n.id_protocolo
  RETURNING 1
),
-- 4) Tocar las fichas para que móvil y web resincronicen (LWW por updated_at).
touch AS (
  UPDATE protocol_templates SET updated_at = ${TS}
  WHERE project_id = ${q(PROJECT_ID)}
  RETURNING 1
)
SELECT (SELECT count(*) FROM respaldo)    AS fichas_respaldadas,
       (SELECT count(*) FROM borrados)    AS items_borrados,
       (SELECT count(*) FROM insertados)  AS items_insertados,
       (SELECT count(*) FROM touch)       AS fichas_tocadas;
`;

const out = path.join(__dirname, '_reemplazo_items_v3.sql');
fs.writeFileSync(out, sql, 'utf8');
console.log(`\n✓ ${out}\n  ${ALL.length} ítems v3`);
