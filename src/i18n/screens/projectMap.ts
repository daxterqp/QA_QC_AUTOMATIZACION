/**
 * i18n — Cadenas de la pantalla ProjectMapScreen (visor de mapa del proyecto).
 * Namespace: projectMap. Solo UI visible al usuario (NO toca enum/DSL/datos/AsyncStorage).
 */
const projectMap: Record<string, { es: string; en: string; pt: string }> = {
  // Estados de ensayo (etiquetas visibles; las claves DRAFT/… no cambian)
  'projectMap.status.draft': { es: 'Borrador', en: 'Draft', pt: 'Rascunho' },
  'projectMap.status.inProgress': { es: 'En proceso', en: 'In progress', pt: 'Em andamento' },
  'projectMap.status.submitted': { es: 'Enviado', en: 'Submitted', pt: 'Enviado' },
  'projectMap.status.approved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'projectMap.status.rejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },

  // Guard de módulo no habilitado (Alert)
  'projectMap.guard.title': { es: 'Módulo no disponible', en: 'Module not available', pt: 'Módulo não disponível' },
  'projectMap.guard.message': { es: 'El módulo de Geolocalización no está habilitado en este proyecto. Actívalo desde Configurar módulos.', en: 'The Geolocation module is not enabled in this project. Enable it from Configure modules.', pt: 'O módulo de Geolocalização não está habilitado neste projeto. Ative-o em Configurar módulos.' },
  'projectMap.guard.ok': { es: 'OK', en: 'OK', pt: 'OK' },

  // Opciones de filtro / fallbacks
  'projectMap.opt.type': { es: 'Tipo', en: 'Type', pt: 'Tipo' },
  'projectMap.opt.noSector': { es: 'Sin sector', en: 'No sector', pt: 'Sem setor' },
  'projectMap.opt.noType': { es: 'Sin tipo', en: 'No type', pt: 'Sem tipo' },
  'projectMap.opt.noDate': { es: 'Sin fecha', en: 'No date', pt: 'Sem data' },

  // Diagnóstico de ortofoto (Alert)
  'projectMap.diag.yes': { es: 'SÍ', en: 'YES', pt: 'SIM' },
  'projectMap.diag.no': { es: 'NO', en: 'NO', pt: 'NÃO' },
  'projectMap.diag.title': { es: 'Diagnóstico de ortofoto', en: 'Orthophoto diagnostics', pt: 'Diagnóstico de ortofoto' },
  'projectMap.diag.remoteHeader': { es: 'En Supabase (remoto):', en: 'In Supabase (remote):', pt: 'No Supabase (remoto):' },
  'projectMap.diag.remoteKey': { es: '· Referencia (s3_key): {v}', en: '· Reference (s3_key): {v}', pt: '· Referência (s3_key): {v}' },
  'projectMap.diag.remoteBounds': { es: '· Coordenadas (bounds): {v}', en: '· Coordinates (bounds): {v}', pt: '· Coordenadas (bounds): {v}' },
  'projectMap.diag.localHeader': { es: 'En este celular (local):', en: 'On this phone (local):', pt: 'Neste celular (local):' },
  'projectMap.diag.localExists': { es: '· Proyecto local: {v}', en: '· Local project: {v}', pt: '· Projeto local: {v}' },
  'projectMap.diag.localKey': { es: '· Referencia tras sincronizar: {v}', en: '· Reference after syncing: {v}', pt: '· Referência após sincronizar: {v}' },
  'projectMap.diag.v36': { es: 'Columnas de versiones (SQL v36): {v}', en: 'Version columns (SQL v36): {v}', pt: 'Colunas de versões (SQL v36): {v}' },
  'projectMap.diag.err': { es: '⚠ {error}', en: '⚠ {error}', pt: '⚠ {error}' },
  'projectMap.diag.fixV36': { es: '→ FALTA correr el SQL v36 en Supabase. Sin esas columnas, el guardado de la web falla entero. Córrelo, recarga la web y re-carga la ortofoto.', en: '→ The SQL v36 still needs to be run in Supabase. Without those columns, the web save fails entirely. Run it, reload the web and re-upload the orthophoto.', pt: '→ Falta executar o SQL v36 no Supabase. Sem essas colunas, o salvamento da web falha por completo. Execute-o, recarregue a web e reenvie a ortofoto.' },
  'projectMap.diag.fixWebSave': { es: '→ La web NO guardó la referencia. Recarga la web (para el fix) y re-carga la ortofoto en Sectores → Ortofoto.', en: '→ The web did NOT save the reference. Reload the web (for the fix) and re-upload the orthophoto in Sectors → Orthophoto.', pt: '→ A web NÃO salvou a referência. Recarregue a web (para a correção) e reenvie a ortofoto em Setores → Ortofoto.' },
  'projectMap.diag.fixLocalSave': { es: '→ Llegó al remoto pero NO se guardó local: cierra y reabre la app para migrar la base.', en: '→ It reached the remote but was NOT saved locally: close and reopen the app to migrate the database.', pt: '→ Chegou ao remoto mas NÃO foi salvo localmente: feche e reabra o app para migrar o banco.' },
  'projectMap.diag.ok': { es: '→ OK, ya debería verse al cerrar este aviso.', en: '→ OK, it should now be visible once you close this notice.', pt: '→ OK, já deve aparecer ao fechar este aviso.' },
  'projectMap.diag.failTitle': { es: 'Diagnóstico', en: 'Diagnostics', pt: 'Diagnóstico' },
  'projectMap.diag.failMessage': { es: 'No se pudo diagnosticar: {error}', en: 'Diagnostics failed: {error}', pt: 'Não foi possível diagnosticar: {error}' },

  // Ubicación (Alert)
  'projectMap.locate.permTitle': { es: 'Permiso requerido', en: 'Permission required', pt: 'Permissão necessária' },
  'projectMap.locate.permMessage': { es: 'Activa el permiso de ubicación para centrar el mapa en tu posición.', en: 'Enable the location permission to center the map on your position.', pt: 'Ative a permissão de localização para centralizar o mapa na sua posição.' },
  'projectMap.locate.errTitle': { es: 'Ubicación', en: 'Location', pt: 'Localização' },
  'projectMap.locate.errMessage': { es: 'No se pudo obtener tu ubicación. Verifica el GPS y el cielo despejado.', en: 'Your location could not be obtained. Check the GPS and a clear sky.', pt: 'Não foi possível obter sua localização. Verifique o GPS e o céu aberto.' },

  // Detalle de sector (Alert)
  'projectMap.sector.noTests': { es: 'sin ensayos', en: 'no tests', pt: 'sem ensaios' },
  'projectMap.sector.summaryItem': { es: '{count} {label}', en: '{count} {label}', pt: '{count} {label}' },
  'projectMap.sector.traceability': { es: '\n\n⏱ Trazabilidad: {hours}h · {equip} · {sessions}', en: '\n\n⏱ Traceability: {hours}h · {equip} · {sessions}', pt: '\n\n⏱ Rastreabilidade: {hours}h · {equip} · {sessions}' },
  'projectMap.sector.equipOne': { es: '{count} equipo', en: '{count} equipment', pt: '{count} equipamento' },
  'projectMap.sector.equipMany': { es: '{count} equipos', en: '{count} equipment', pt: '{count} equipamentos' },
  'projectMap.sector.sessionOne': { es: '{count} sesión', en: '{count} session', pt: '{count} sessão' },
  'projectMap.sector.sessionMany': { es: '{count} sesiones', en: '{count} sessions', pt: '{count} sessões' },
  'projectMap.sector.alertMessage': { es: '{count} ensayo(s) asignados.\n{summary}{traceability}', en: '{count} test(s) assigned.\n{summary}{traceability}', pt: '{count} ensaio(s) atribuídos.\n{summary}{traceability}' },

  // Cabecera
  'projectMap.header.title': { es: 'Mapa del proyecto', en: 'Project map', pt: 'Mapa do projeto' },

  // Barra de filtros
  'projectMap.filter.date': { es: 'Fecha', en: 'Date', pt: 'Data' },
  'projectMap.filter.status': { es: 'Estado', en: 'Status', pt: 'Status' },
  'projectMap.filter.type': { es: 'Tipo', en: 'Type', pt: 'Tipo' },
  'projectMap.filter.layer': { es: 'Capa', en: 'Layer', pt: 'Camada' },
  'projectMap.filter.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'projectMap.filter.hideLabels': { es: 'Quitar etiquetas', en: 'Hide labels', pt: 'Ocultar etiquetas' },
  'projectMap.filter.showLabels': { es: 'Mostrar etiquetas', en: 'Show labels', pt: 'Mostrar etiquetas' },

  // Barra de estado de ortofoto
  'projectMap.ortho.syncing': { es: 'Sincronizando…', en: 'Syncing…', pt: 'Sincronizando…' },
  'projectMap.ortho.downloadingTiles': { es: '1 ortofoto · descargando {count} teselas…', en: '1 orthophoto · downloading {count} tiles…', pt: '1 ortofoto · baixando {count} blocos…' },
  'projectMap.ortho.downloadingImage': { es: '1 ortofoto · descargando imagen…', en: '1 orthophoto · downloading image…', pt: '1 ortofoto · baixando imagem…' },
  'projectMap.ortho.readyVisible': { es: '1 ortofoto cargada ✓ — visible', en: '1 orthophoto loaded ✓ — visible', pt: '1 ortofoto carregada ✓ — visível' },
  'projectMap.ortho.readyVisibleTiles': { es: '1 ortofoto cargada ✓ — visible ({count} teselas)', en: '1 orthophoto loaded ✓ — visible ({count} tiles)', pt: '1 ortofoto carregada ✓ — visível ({count} blocos)' },
  'projectMap.ortho.readyHidden': { es: '1 ortofoto cargada ✓ — oculta (actívala en “Capa”)', en: '1 orthophoto loaded ✓ — hidden (enable it under “Layer”)', pt: '1 ortofoto carregada ✓ — oculta (ative em “Camada”)' },
  'projectMap.ortho.error': { es: '1 ortofoto cargada · ⚠ no se pudo descargar — toca para reintentar', en: '1 orthophoto loaded · ⚠ could not be downloaded — tap to retry', pt: '1 ortofoto carregada · ⚠ não foi possível baixar — toque para tentar novamente' },
  'projectMap.ortho.noBounds': { es: 'Ortofoto recibida pero SIN coordenadas válidas (bounds)', en: 'Orthophoto received but WITHOUT valid coordinates (bounds)', pt: 'Ortofoto recebida mas SEM coordenadas válidas (bounds)' },
  'projectMap.ortho.none': { es: '0 ortofotos cargadas — toca para sincronizar', en: '0 orthophotos loaded — tap to sync', pt: '0 ortofotos carregadas — toque para sincronizar' },

  // Marcador (fallback de código)
  'projectMap.pin.protocol': { es: 'Protocolo', en: 'Protocol', pt: 'Protocolo' },

  // Estado vacío
  'projectMap.empty.title': { es: 'Nada que mostrar todavía', en: 'Nothing to show yet', pt: 'Nada para mostrar ainda' },
  'projectMap.empty.text': { es: 'Aún no hay protocolos con coordenadas ni sectores con geometría definida.\nCaptura GPS en un ensayo o importa sectores con polígonos para verlos aquí.', en: 'There are no protocols with coordinates or sectors with defined geometry yet.\nCapture GPS in a test or import sectors with polygons to see them here.', pt: 'Ainda não há protocolos com coordenadas nem setores com geometria definida.\nCapture GPS em um ensaio ou importe setores com polígonos para vê-los aqui.' },

  // Panel — capa / mapa base
  'projectMap.panel.baseMap': { es: 'Mapa base', en: 'Base map', pt: 'Mapa base' },
  'projectMap.panel.baseStandard': { es: 'Estándar', en: 'Standard', pt: 'Padrão' },
  'projectMap.panel.baseSatellite': { es: 'Satélite', en: 'Satellite', pt: 'Satélite' },
  'projectMap.panel.baseHybrid': { es: 'Híbrido', en: 'Hybrid', pt: 'Híbrido' },
  'projectMap.panel.baseTerrain': { es: 'Terreno', en: 'Terrain', pt: 'Terreno' },
  'projectMap.panel.orthoXyz': { es: 'Ortofoto (teselas XYZ)', en: 'Orthophoto (XYZ tiles)', pt: 'Ortofoto (blocos XYZ)' },
  'projectMap.panel.orthoImage': { es: 'Ortofoto (imagen)', en: 'Orthophoto (image)', pt: 'Ortofoto (imagem)' },

  // Panel — estado / sector / tipo / fecha
  'projectMap.panel.statusTitle': { es: 'Estado de ensayo', en: 'Test status', pt: 'Status do ensaio' },
  'projectMap.panel.sectorTitle': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'projectMap.panel.typeTitle': { es: 'Tipo de ensayo', en: 'Test type', pt: 'Tipo de ensaio' },
  'projectMap.panel.noTypesYet': { es: 'Sin tipos aún', en: 'No types yet', pt: 'Sem tipos ainda' },
  'projectMap.panel.noDatesYet': { es: 'Sin fechas aún', en: 'No dates yet', pt: 'Sem datas ainda' },
  'projectMap.panel.dateRange': { es: 'Rango de fechas', en: 'Date range', pt: 'Intervalo de datas' },
  'projectMap.panel.clear': { es: 'Limpiar', en: 'Clear', pt: 'Limpar' },
  'projectMap.panel.dateFrom': { es: 'Fecha inicial', en: 'Start date', pt: 'Data inicial' },
  'projectMap.panel.dateFromValue': { es: 'Fecha inicial · {date}', en: 'Start date · {date}', pt: 'Data inicial · {date}' },
  'projectMap.panel.dateTo': { es: 'Fecha final', en: 'End date', pt: 'Data final' },
  'projectMap.panel.dateToValue': { es: 'Fecha final · {date}', en: 'End date · {date}', pt: 'Data final · {date}' },
  'projectMap.panel.anyDate': { es: 'Cualquiera', en: 'Any', pt: 'Qualquer' },

  // Leyenda
  'projectMap.legend.close': { es: 'Cerrar', en: 'Close', pt: 'Fechar' },
  'projectMap.legend.open': { es: 'Leyenda', en: 'Legend', pt: 'Legenda' },
  'projectMap.legend.statusTitle': { es: 'Estado de ensayos', en: 'Test status', pt: 'Status dos ensaios' },
  'projectMap.legend.sectorsTitle': { es: 'Sectores', en: 'Sectors', pt: 'Setores' },
};

export default projectMap;
