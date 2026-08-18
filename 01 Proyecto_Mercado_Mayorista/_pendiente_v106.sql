-- ============================================================================
-- v106 — Mercado Mayorista: ficha de rotura de probetas + PCC ampliado +
--        corrección de pendiente por diámetro.
-- Generado por _genPendienteV106.js. Una sola sentencia: atómica.
-- ============================================================================
WITH nuevos (id_protocolo, partida, descripcion, metodo, seccion) AS (
  VALUES
    ('RCP', 1, 'Elemento vaciado', 'texto-[]', 'DATOS DEL VACIADO Y DISEÑO'),
    ('RCP', 2, 'f''c de diseño (kg/cm²)', 'numerico-[100:700]:dec[0]:ej[210]', 'DATOS DEL VACIADO Y DISEÑO'),
    ('RCP', 3, 'Fecha de vaciado', 'fecha-[]', 'DATOS DEL VACIADO Y DISEÑO'),
    ('RCP', 4, 'Guía / batch de origen', 'texto-[]', 'DATOS DEL VACIADO Y DISEÑO'),
    ('RCP', 5, 'Laboratorio que ejecutó el ensayo', 'texto-[]', 'DATOS DEL VACIADO Y DISEÑO'),
    ('RCP', 6, 'col-[A][Código de testigo] // col-[B][Fecha de rotura] // col-[C][Edad (días)] // col-[D][Diámetro (cm)] // col-[E][Altura (cm)] // col-[F][Carga máxima (kN)] // col-[G][Área (cm²)] // col-[H][f''c obtenido (kg/cm²)] // col-[I][% del diseño] // col-[J][Cumple individual (1=Sí)]', '', 'RESULTADOS DE ROTURA'),
    ('RCP', 7, 'Testigo 1', 'texto-[] // fecha-[] // numerico-[1:90]:dec[0]:ej[28] // numerico-[5:30]:dec[1]:ej[15.0] // numerico-[10:60]:dec[1]:ej[30.0] // numerico-[0:3000]:dec[1]:ej[371.0] // numerico-fx[3.14159265*POTENCIA(#7D/2, 2)]:dec[2] // numerico-fx[SI(#7G>0, #7F*101.9716/#7G, 0)]:dec[1] // numerico-fx[SI(#2A>0, #7H/#2A*100, 0)]:dec[1] // numerico-fx[SI(#7H >= #2A - SI(#2A<=350, 35, #2A*0.10), 1, 0)]:dec[0]', 'RESULTADOS DE ROTURA'),
    ('RCP', 8, 'Testigo 2', 'texto-[] // fecha-[] // numerico-[1:90]:dec[0]:ej[28] // numerico-[5:30]:dec[1]:ej[15.0] // numerico-[10:60]:dec[1]:ej[30.0] // numerico-[0:3000]:dec[1]:ej[371.0] // numerico-fx[3.14159265*POTENCIA(#8D/2, 2)]:dec[2] // numerico-fx[SI(#8G>0, #8F*101.9716/#8G, 0)]:dec[1] // numerico-fx[SI(#2A>0, #8H/#2A*100, 0)]:dec[1] // numerico-fx[SI(#8H >= #2A - SI(#2A<=350, 35, #2A*0.10), 1, 0)]:dec[0]', 'RESULTADOS DE ROTURA'),
    ('RCP', 9, 'Testigo 3', 'texto-[] // fecha-[] // numerico-[1:90]:dec[0]:ej[28] // numerico-[5:30]:dec[1]:ej[15.0] // numerico-[10:60]:dec[1]:ej[30.0] // numerico-[0:3000]:dec[1]:ej[371.0] // numerico-fx[3.14159265*POTENCIA(#9D/2, 2)]:dec[2] // numerico-fx[SI(#9G>0, #9F*101.9716/#9G, 0)]:dec[1] // numerico-fx[SI(#2A>0, #9H/#2A*100, 0)]:dec[1] // numerico-fx[SI(#9H >= #2A - SI(#2A<=350, 35, #2A*0.10), 1, 0)]:dec[0]', 'RESULTADOS DE ROTURA'),
    ('RCP', 10, 'Testigo 4', 'texto-[] // fecha-[] // numerico-[1:90]:dec[0]:ej[28] // numerico-[5:30]:dec[1]:ej[15.0] // numerico-[10:60]:dec[1]:ej[30.0] // numerico-[0:3000]:dec[1]:ej[371.0] // numerico-fx[3.14159265*POTENCIA(#10D/2, 2)]:dec[2] // numerico-fx[SI(#10G>0, #10F*101.9716/#10G, 0)]:dec[1] // numerico-fx[SI(#2A>0, #10H/#2A*100, 0)]:dec[1] // numerico-fx[SI(#10H >= #2A - SI(#2A<=350, 35, #2A*0.10), 1, 0)]:dec[0]', 'RESULTADOS DE ROTURA'),
    ('RCP', 11, 'Testigo 5', 'texto-[] // fecha-[] // numerico-[1:90]:dec[0]:ej[28] // numerico-[5:30]:dec[1]:ej[15.0] // numerico-[10:60]:dec[1]:ej[30.0] // numerico-[0:3000]:dec[1]:ej[371.0] // numerico-fx[3.14159265*POTENCIA(#11D/2, 2)]:dec[2] // numerico-fx[SI(#11G>0, #11F*101.9716/#11G, 0)]:dec[1] // numerico-fx[SI(#2A>0, #11H/#2A*100, 0)]:dec[1] // numerico-fx[SI(#11H >= #2A - SI(#2A<=350, 35, #2A*0.10), 1, 0)]:dec[0]', 'RESULTADOS DE ROTURA'),
    ('RCP', 12, 'Testigo 6', 'texto-[] // fecha-[] // numerico-[1:90]:dec[0]:ej[28] // numerico-[5:30]:dec[1]:ej[15.0] // numerico-[10:60]:dec[1]:ej[30.0] // numerico-[0:3000]:dec[1]:ej[371.0] // numerico-fx[3.14159265*POTENCIA(#12D/2, 2)]:dec[2] // numerico-fx[SI(#12G>0, #12F*101.9716/#12G, 0)]:dec[1] // numerico-fx[SI(#2A>0, #12H/#2A*100, 0)]:dec[1] // numerico-fx[SI(#12H >= #2A - SI(#2A<=350, 35, #2A*0.10), 1, 0)]:dec[0]', 'RESULTADOS DE ROTURA'),
    ('RCP', 13, 'f''c promedio de los testigos (kg/cm²)', 'numerico-fx[PROMEDIO(#7H:#12H)]:dec[1]', 'RESULTADOS DE ROTURA'),
    ('RCP', 14, 'f''c mínimo individual (kg/cm²)', 'numerico-fx[MIN(#7H:#12H)]:dec[1]', 'RESULTADOS DE ROTURA'),
    ('RCP', 15, '¿El f''c PROMEDIO alcanza o supera el f''c de diseño? (RNE E.060 — es el criterio principal de aceptación)', 'list-[SI, NO, NA]', 'EVALUACIÓN DEL RESULTADO'),
    ('RCP', 16, '¿NINGÚN testigo individual quedó por debajo del margen admitido? (35 kg/cm² si f''c ≤ 350; 10 % si es mayor)', 'list-[SI, NO, NA]', 'EVALUACIÓN DEL RESULTADO'),
    ('RCP', 17, '¿Las probetas se moldearon, curaron y transportaron según norma hasta el ensayo? (NTP 339.033 — un mal curado da resistencias bajas que NO son culpa del concreto)', 'list-[SI, NO, NA]', 'EVALUACIÓN DEL RESULTADO'),
    ('RCP', 18, '¿El tipo de falla observado es el normal, sin indicios de mal moldeo o refrentado defectuoso?', 'list-[SI, NO, NA]', 'EVALUACIÓN DEL RESULTADO'),
    ('RCP', 19, '¿El laboratorio está acreditado y su certificado quedó adjunto al expediente?', 'list-[SI, NO, NA]', 'EVALUACIÓN DEL RESULTADO'),
    ('RCP', 20, '¿El resultado se comunicó al residente y a la supervisión, y de ser NO CONFORME se abrió la no conformidad correspondiente?', 'list-[SI, NO, NA]', 'EVALUACIÓN DEL RESULTADO'),
    ('PCC', 1, '¿El procedimiento de vaciado está definido para este elemento, incluyendo qué hacer ante lluvia, falla de bomba o junta fría no prevista?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 2, '¿Los niveles de vaciado están marcados en el elemento y verificados topográficamente?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 3, '¿Las juntas de construcción están en la ubicación prevista, con la superficie rugosa, limpia y saturada pero sin agua libre?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 4, '¿El acero de refuerzo está LIBERADO con su protocolo aprobado?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 5, '¿El encofrado está LIBERADO con su protocolo aprobado?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 6, '¿Las instalaciones sanitarias embebidas están liberadas, tapadas y aseguradas para que no se desplacen durante el vaciado?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 7, '¿Las instalaciones eléctricas embebidas están liberadas, con guía y tapadas para que no se llenen de concreto?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 8, '¿Las instalaciones mecánicas embebidas están liberadas y aseguradas?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 9, '¿Los anclajes para estructuras metálicas están en posición, con plantilla y nivel verificados?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 10, '¿El equipo de vaciado está operativo y se cuenta con vibrador de RESERVA en el frente? (una falla a media losa deja cangrejeras)', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 11, '¿Las condiciones de clima y temperatura permiten vaciar según especificación, y se previó el manejo si cambian?', 'list-[SI, NO, NA]', 'INSPECCIÓN PREVIA AL VACIADO'),
    ('PCC', 12, 'N° de batch', 'texto-[]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 13, 'Tipo de concreto', 'list-[HECHO EN OBRA, PREMEZCLADO]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 14, 'f''c de diseño (kg/cm²)', 'numerico-[100:700]:dec[0]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 15, 'Slump de diseño (pulg)', 'numerico-[1:10]:dec[1]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 16, 'Volumen total (m³)', 'numerico-[0:500]:dec[2]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 17, 'Tipo de colocación', 'list-[DIRECTO, CON BOMBA, OTROS]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 18, 'Tipo de acabado', 'list-[CARAVISTA, FROTACHADO, OTROS]', 'DATOS DE LA COLOCACIÓN'),
    ('PCC', 19, 'col-[A][Guía / Batch] // col-[B][Hora mezclado] // col-[C][Hora colocación] // col-[D][Slump (pulg)] // col-[E][Temp. (°C)] // col-[F][Volumen (m³)] // col-[G][Código de testigos]', '', 'REGISTRO DE BATCHES'),
    ('PCC', 20, 'Batch 1', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 21, 'Batch 2', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 22, 'Batch 3', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 23, 'Batch 4', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 24, 'Batch 5', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 25, 'Batch 6', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 26, 'Batch 7', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 27, 'Batch 8', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 28, 'Batch 9', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 29, 'Batch 10', 'texto-[] // hora-[] // hora-[] // numerico-[1:10]:dec[1] // numerico-[5:40]:dec[1] // numerico-[0:100]:dec[2] // texto-[]', 'REGISTRO DE BATCHES'),
    ('PCC', 30, 'Volumen total colocado (m³)', 'numerico-fx[SUMA(#20F:#29F)]:dec[2]', 'REGISTRO DE BATCHES'),
    ('PCC', 31, 'Desviación de volumen (%)', 'numerico-fx[SI(#16A>0, (#30A-#16A)/#16A*100, 0)]:dec[1]', 'REGISTRO DE BATCHES'),
    ('PCC', 32, '¿Se tomaron las probetas según norma (un juego por cada 50 m³ o fracción, mínimo uno por día de vaciado), identificadas y protegidas en obra? (NTP 339.033)', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO'),
    ('PCC', 33, '¿El slump de cada batch se mantuvo dentro de la tolerancia del diseño y se rechazó el que no cumplía? (registrar rechazos en observaciones)', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO'),
    ('PCC', 34, '¿El acabado superficial corresponde al especificado y está libre de cangrejeras, segregación o juntas frías? (describir y ubicar cualquier defecto en observaciones)', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO'),
    ('PCC', 35, '¿El desplome del elemento terminado es menor a 6 mm por cada 3 m de altura y los niveles cumplen ±10 mm?', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO'),
    ('PCC', 36, '¿Los elementos embebidos quedaron en su posición final, sin desplazamiento respecto al plano?', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO'),
    ('PCC', 37, '¿El curado se inició apenas el acabado lo permitió y se mantendrá al menos 7 días? (RNE E.060 — sin curado no se alcanza el f''c)', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO'),
    ('PCC', 38, '¿El área quedó ordenada y los residuos de concreto se retiraron antes de fraguar?', 'list-[SI, NO, NA]', 'INSPECCIÓN POSTERIOR AL VACIADO')
),
-- 1) Respaldo de PCC antes de reemplazarlo (RCP es nueva, no hay qué respaldar).
respaldo AS (
  INSERT INTO ficha_edit_backups (template_id, project_id, label, operation, snapshot)
  SELECT pt.id, pt.project_id, 'Antes de v106 (' || pt.id_protocolo || ')', 'replace_items_v106',
         jsonb_agg(jsonb_build_object('partida_item', i.partida_item, 'item_description', i.item_description,
                                      'validation_method', i.validation_method, 'section', i.section)
                   ORDER BY (i.partida_item)::int)
  FROM protocol_templates pt JOIN protocol_template_items i ON i.template_id = pt.id
  WHERE pt.project_id = 'mmhYnc2026Unica' AND pt.id_protocolo = 'PCC'
  GROUP BY pt.id, pt.project_id, pt.id_protocolo
  RETURNING 1
),
-- 2) Alta de la ficha RCP (idempotente).
alta_rcp AS (
  INSERT INTO protocol_templates (id, project_id, id_protocolo, name, created_at, updated_at, is_hidden, org_id)
  VALUES ('RcpMmh2026Probet', 'mmhYnc2026Unica', 'RCP', 'RESISTENCIA A COMPRESIÓN DE PROBETAS', 1786100000000, 1786100000000, false, '11111111-1111-4111-8111-111111111111')
  ON CONFLICT (id) DO UPDATE SET is_hidden = false, updated_at = 1786100000000
  RETURNING 1
),
-- 3) Fuera los ítems viejos de PCC y RCP (cambia la cantidad de partidas).
borrados AS (
  DELETE FROM protocol_template_items i USING protocol_templates pt
  WHERE pt.project_id = 'mmhYnc2026Unica' AND pt.id_protocolo IN ('PCC','RCP') AND i.template_id = pt.id
  RETURNING 1
),
-- 4) Ítems nuevos.
insertados AS (
  INSERT INTO protocol_template_items
    (id, template_id, partida_item, item_description, validation_method, section, created_at, updated_at, org_id)
  SELECT substr(md5('v106|' || n.id_protocolo || '|' || n.partida), 1, 16), pt.id, n.partida::text,
         n.descripcion, n.metodo, n.seccion, 1786100000000, 1786100000000, '11111111-1111-4111-8111-111111111111'
  FROM nuevos n JOIN protocol_templates pt
    ON pt.project_id = 'mmhYnc2026Unica' AND pt.id_protocolo = n.id_protocolo
  RETURNING 1
),
-- 5) Pendiente mínima POR DIÁMETRO (RNE IS.010). Un "≥1 %" plano aprobaba
--    ramales de 2" y 3" mal ejecutados, que son los que más se atoran.
fix_pend AS (
  UPDATE protocol_template_items i
  SET item_description = CASE pt.id_protocolo
        WHEN 'PIS'  THEN '¿La pendiente de cada tramo cumple el mínimo POR DIÁMETRO, verificada con nivel? (2": 2 % · 3": 1,5 % · 4" o mayor: 1 % — RNE IS.010)'
        ELSE '¿La pendiente de cada ramal cumple el mínimo POR DIÁMETRO, verificada con nivel? (2": 2 % · 3": 1,5 % · 4" o mayor: 1 % — RNE IS.010)'
      END,
      updated_at = 1786100000000
  FROM protocol_templates pt
  WHERE pt.project_id = 'mmhYnc2026Unica' AND i.template_id = pt.id
    AND pt.id_protocolo IN ('PIS','PPIS')
    AND i.item_description ILIKE '%pendiente%'
  RETURNING 1
),
-- 6) RCP se llena en los mismos frentes donde se vació concreto.
vincula AS (
  UPDATE locations
  SET template_ids = template_ids || ',RCP', updated_at = 1786100000000
  WHERE project_id = 'mmhYnc2026Unica'
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
      updated_at = 1786100000000
  WHERE p.id = 'mmhYnc2026Unica'
  RETURNING 1
),
touch AS (
  UPDATE protocol_templates SET updated_at = 1786100000000
  WHERE project_id = 'mmhYnc2026Unica' AND id_protocolo IN ('PCC','RCP','PIS','PPIS')
  RETURNING 1
)
SELECT (SELECT count(*) FROM respaldo)    AS respaldadas,
       (SELECT count(*) FROM alta_rcp)    AS ficha_rcp,
       (SELECT count(*) FROM borrados)    AS items_borrados,
       (SELECT count(*) FROM insertados)  AS items_insertados,
       (SELECT count(*) FROM fix_pend)    AS pendientes_corregidas,
       (SELECT count(*) FROM vincula)     AS ubicaciones_vinculadas,
       (SELECT count(*) FROM cfg)         AS config_pdf;
