/**
 * Genera el SQL que actualiza SOLO los textos (`item_description`) de las 13
 * fichas del Mercado Mayorista a la redacción v2 (preguntas reales).
 *
 * Por qué UPDATE y no DELETE+INSERT: el proyecto YA tiene ensayos creados
 * (protocols) con sus protocol_items enlazados por (protocol_id, partida_item).
 * Reinsertar rompería esos enlaces. Se actualiza en sitio y se propaga a las
 * instancias en DRAFT — las aprobadas nunca se tocan (registro firmado).
 *
 * NO toca `validation_method`: en las fichas numéricas (PCC, LIPMPP) esa columna
 * es el DSL de celdas; sobrescribirla destruiría las fórmulas.
 *
 * Ejecutar DESDE la raíz del repo:
 *   node "01 Proyecto_Mercado_Mayorista/_genUpdateTextos.js"
 */
const fs = require('fs');
const path = require('path');
const { ALL } = require('./_genMaestro.js');

const PROJECT_ID = 'mmhYnc2026Unica';
const TS = 1785900000000;   // fijo: reruns idempotentes (LWW por updated_at)

const q = s => "'" + String(s).replace(/'/g, "''") + "'";

// El cast ::text en la primera fila fija los tipos del VALUES (las demás quedan
// 'unknown' y Postgres las infiere de esa).
const values = ALL
  .map((r, i) => {
    const c = i === 0 ? '::text' : '';
    return `(${q(r.ID_Protocolo)}${c}, ${q(r.PartidaItem)}${c}, ${q(r['Actividad realizada'])}${c})`;
  })
  .join(',\n    ');

// UNA SOLA sentencia con CTEs que modifican datos: es atómica por definición
// (no depende de que el cliente respete BEGIN/COMMIT) y todos los CTEs leen el
// MISMO snapshot, así que el respaldo captura el estado PREVIO aunque se ejecute
// "después" en el texto. Devuelve conteos para verificar sin consultar de nuevo.
const sql = `-- Mercado Mayorista (${PROJECT_ID}) — redacción v2 de los ítems.
-- Generado por _genUpdateTextos.js. Solo item_description; validation_method intacto.
WITH nuevos (id_protocolo, partida_item, texto) AS (
  VALUES
    ${values}
),
-- Respaldo del estado ACTUAL de las 13 fichas antes de tocar nada.
respaldo AS (
  INSERT INTO ficha_edit_backups (template_id, project_id, label, operation, snapshot)
  SELECT pt.id, pt.project_id,
         'Redacción v2 — preguntas reales (' || pt.id_protocolo || ')',
         'update_item_description',
         jsonb_agg(jsonb_build_object(
           'id', i.id, 'partida_item', i.partida_item,
           'item_description', i.item_description,
           'validation_method', i.validation_method, 'section', i.section
         ) ORDER BY (i.partida_item)::int)
  FROM protocol_templates pt
  JOIN protocol_template_items i ON i.template_id = pt.id
  WHERE pt.project_id = ${q(PROJECT_ID)}
  GROUP BY pt.id, pt.project_id, pt.id_protocolo
  RETURNING 1
),
-- Plantillas.
upd_plantilla AS (
  UPDATE protocol_template_items t
  SET item_description = n.texto, updated_at = ${TS}
  FROM nuevos n, protocol_templates pt
  WHERE pt.project_id = ${q(PROJECT_ID)}
    AND pt.id_protocolo = n.id_protocolo
    AND t.template_id = pt.id
    AND t.partida_item = n.partida_item
    AND t.item_description IS DISTINCT FROM n.texto
  RETURNING 1
),
-- Instancias NO aprobadas (los ensayos ya creados siguen el texto nuevo).
-- Las aprobadas jamás se tocan: son registro firmado.
upd_instancia AS (
  UPDATE protocol_items pi
  SET item_description = n.texto, updated_at = ${TS}
  FROM nuevos n, protocol_templates pt, protocols p
  WHERE pt.project_id = ${q(PROJECT_ID)}
    AND pt.id_protocolo = n.id_protocolo
    AND p.template_id = pt.id
    AND p.status = 'DRAFT'
    AND pi.protocol_id = p.id
    AND pi.partida_item = n.partida_item
    AND pi.item_description IS DISTINCT FROM n.texto
  RETURNING 1
),
-- Tocar las fichas para que móvil y web se sincronicen (LWW por updated_at).
touch AS (
  UPDATE protocol_templates SET updated_at = ${TS}
  WHERE project_id = ${q(PROJECT_ID)}
  RETURNING 1
)
SELECT (SELECT count(*) FROM respaldo)      AS fichas_respaldadas,
       (SELECT count(*) FROM upd_plantilla) AS items_plantilla,
       (SELECT count(*) FROM upd_instancia) AS items_instancia,
       (SELECT count(*) FROM touch)         AS fichas_tocadas;
`;

const out = path.join(__dirname, '_update_textos_v2.sql');
fs.writeFileSync(out, sql, 'utf8');
console.log(`✓ ${out}\n  ${ALL.length} textos · proyecto ${PROJECT_ID}`);
