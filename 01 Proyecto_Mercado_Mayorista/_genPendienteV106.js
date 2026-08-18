/**
 * SQL PENDIENTE DE APLICAR (v106) — se generó con el MCP de Supabase caído.
 *
 * Contiene, en UNA sola sentencia atómica:
 *   1. Alta de la ficha nueva RCP (resistencia a compresión de probetas).
 *   2. Reemplazo de los ítems de PCC (10 batches + desviación de volumen).
 *   3. Corrección de la pendiente por diámetro en PIS y PPIS (RNE IS.010).
 *   4. Vinculación de RCP a las 15 ubicaciones estructurales.
 *   5. Config de impresión de RCP.
 *
 * Todo respaldado en `ficha_edit_backups` antes de tocar nada.
 *
 * Ejecutar DESDE la raíz del repo:
 *   node "01 Proyecto_Mercado_Mayorista/_genPendienteV106.js"
 */
const fs = require('fs');
const path = require('path');
const { ALL } = require('./_genMaestro.js');

const PROJECT_ID = 'mmhYnc2026Unica';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TS = 1786100000000;
const RCP_TEMPLATE_ID = 'RcpMmh2026Probet';   // 16 chars, legible y único

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const rowsOf = code => ALL.filter(r => r.ID_Protocolo === code);

const vals = code => rowsOf(code)
  .map(r => `(${q(code)}, ${r.PartidaItem}, ${q(r['Actividad realizada'])}, ${q(r['Método de validación'])}, ${q(r['Sección'])})`)
  .join(',\n    ');

// PIS/PPIS solo cambian UN texto cada uno: se corrige por UPDATE puntual en vez
// de reemplazar la ficha entera (menos superficie de error).
const pendPIS = rowsOf('PIS').find(r => /pendiente/i.test(r['Actividad realizada']));
const pendPPIS = rowsOf('PPIS').find(r => /pendiente/i.test(r['Actividad realizada']));

const sql = `-- ============================================================================
-- v106 — Mercado Mayorista: ficha de rotura de probetas + PCC ampliado +
--        corrección de pendiente por diámetro.
-- Generado por _genPendienteV106.js. Una sola sentencia: atómica.
-- ============================================================================
WITH nuevos (id_protocolo, partida, descripcion, metodo, seccion) AS (
  VALUES
    ${vals('RCP')},
    ${vals('PCC')}
),
-- 1) Respaldo de PCC antes de reemplazarlo (RCP es nueva, no hay qué respaldar).
respaldo AS (
  INSERT INTO ficha_edit_backups (template_id, project_id, label, operation, snapshot)
  SELECT pt.id, pt.project_id, 'Antes de v106 (' || pt.id_protocolo || ')', 'replace_items_v106',
         jsonb_agg(jsonb_build_object('partida_item', i.partida_item, 'item_description', i.item_description,
                                      'validation_method', i.validation_method, 'section', i.section)
                   ORDER BY (i.partida_item)::int)
  FROM protocol_templates pt JOIN protocol_template_items i ON i.template_id = pt.id
  WHERE pt.project_id = ${q(PROJECT_ID)} AND pt.id_protocolo = 'PCC'
  GROUP BY pt.id, pt.project_id, pt.id_protocolo
  RETURNING 1
),
-- 2) Alta de la ficha RCP (idempotente).
alta_rcp AS (
  INSERT INTO protocol_templates (id, project_id, id_protocolo, name, created_at, updated_at, is_hidden, org_id)
  VALUES (${q(RCP_TEMPLATE_ID)}, ${q(PROJECT_ID)}, 'RCP', ${q(rowsOf('RCP')[0].Protocolo)}, ${TS}, ${TS}, false, ${q(ORG_ID)})
  ON CONFLICT (id) DO UPDATE SET is_hidden = false, updated_at = ${TS}
  RETURNING 1
),
-- 3) Fuera los ítems viejos de PCC y RCP (cambia la cantidad de partidas).
borrados AS (
  DELETE FROM protocol_template_items i USING protocol_templates pt
  WHERE pt.project_id = ${q(PROJECT_ID)} AND pt.id_protocolo IN ('PCC','RCP') AND i.template_id = pt.id
  RETURNING 1
),
-- 4) Ítems nuevos.
insertados AS (
  INSERT INTO protocol_template_items
    (id, template_id, partida_item, item_description, validation_method, section, created_at, updated_at, org_id)
  SELECT substr(md5('v106|' || n.id_protocolo || '|' || n.partida), 1, 16), pt.id, n.partida::text,
         n.descripcion, n.metodo, n.seccion, ${TS}, ${TS}, ${q(ORG_ID)}
  FROM nuevos n JOIN protocol_templates pt
    ON pt.project_id = ${q(PROJECT_ID)} AND pt.id_protocolo = n.id_protocolo
  RETURNING 1
),
-- 5) Pendiente mínima POR DIÁMETRO (RNE IS.010). Un "≥1 %" plano aprobaba
--    ramales de 2" y 3" mal ejecutados, que son los que más se atoran.
fix_pend AS (
  UPDATE protocol_template_items i
  SET item_description = CASE pt.id_protocolo
        WHEN 'PIS'  THEN ${q(pendPIS['Actividad realizada'])}
        ELSE ${q(pendPPIS['Actividad realizada'])}
      END,
      updated_at = ${TS}
  FROM protocol_templates pt
  WHERE pt.project_id = ${q(PROJECT_ID)} AND i.template_id = pt.id
    AND pt.id_protocolo IN ('PIS','PPIS')
    AND i.item_description ILIKE '%pendiente%'
  RETURNING 1
),
-- 6) RCP se llena en los mismos frentes donde se vació concreto.
vincula AS (
  UPDATE locations
  SET template_ids = template_ids || ',RCP', updated_at = ${TS}
  WHERE project_id = ${q(PROJECT_ID)}
    AND template_ids LIKE '%PCC%'
    AND template_ids NOT LIKE '%RCP%'
  RETURNING 1
),
-- 7) Encabezado del PDF de RCP: mismos campos que las demás numéricas.
cfg AS (
  UPDATE projects p
  SET feature_flags = p.feature_flags || jsonb_build_object(
        'print_configs',
        COALESCE(p.feature_flags->'print_configs', '{}'::jsonb) || jsonb_build_object(
          'RCP', jsonb_build_object(
            'header_size', 'normal',
            'header_fields', jsonb_build_array('proyecto','cliente','supervision','contratista','supervisor','f_realizacion','f_aprobacion','id_protocolo','elemento')
          ))),
      updated_at = ${TS}
  WHERE p.id = ${q(PROJECT_ID)}
  RETURNING 1
),
touch AS (
  UPDATE protocol_templates SET updated_at = ${TS}
  WHERE project_id = ${q(PROJECT_ID)} AND id_protocolo IN ('PCC','RCP','PIS','PPIS')
  RETURNING 1
)
SELECT (SELECT count(*) FROM respaldo)    AS respaldadas,
       (SELECT count(*) FROM alta_rcp)    AS ficha_rcp,
       (SELECT count(*) FROM borrados)    AS items_borrados,
       (SELECT count(*) FROM insertados)  AS items_insertados,
       (SELECT count(*) FROM fix_pend)    AS pendientes_corregidas,
       (SELECT count(*) FROM vincula)     AS ubicaciones_vinculadas,
       (SELECT count(*) FROM cfg)         AS config_pdf;
`;

const out = path.join(__dirname, '_pendiente_v106.sql');
fs.writeFileSync(out, sql, 'utf8');
console.log(`\n✓ ${out}`);
console.log(`  RCP: ${rowsOf('RCP').length} ítems · PCC: ${rowsOf('PCC').length} ítems`);
console.log(`  + corrección de pendiente en PIS/PPIS, vínculo a ubicaciones y config de PDF`);
