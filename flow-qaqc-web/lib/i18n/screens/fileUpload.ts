/**
 * i18n — Cadenas de la pantalla FileUploadScreen (hub de carga de archivos).
 * Namespace: fileUpload. Solo UI visible al usuario (NO toca enum/DSL/datos/AsyncStorage).
 */
const fileUpload: Record<string, { es: string; en: string; pt: string }> = {
  // ── Cabecera / Tabs ────────────────────────────────────────────────────────
  'fileUpload.header.title': { es: 'Cargar Archivos', en: 'Upload Files', pt: 'Carregar Arquivos' },
  'fileUpload.tab.actividades': { es: 'Activ.', en: 'Activ.', pt: 'Ativ.' },
  'fileUpload.tab.ubicaciones': { es: 'Ubic.', en: 'Loc.', pt: 'Local.' },
  'fileUpload.tab.equipos_lab': { es: 'Lab.', en: 'Lab.', pt: 'Lab.' },
  'fileUpload.tab.equipos': { es: 'Maquinaria', en: 'Machinery', pt: 'Maquinário' },
  'fileUpload.tab.sectores': { es: 'Sectores', en: 'Sectors', pt: 'Setores' },
  'fileUpload.tab.planos_pdf': { es: 'PDF', en: 'PDF', pt: 'PDF' },
  'fileUpload.tab.planos_dwg': { es: 'DWG', en: 'DWG', pt: 'DWG' },
  'fileUpload.tab.personalizar': { es: 'Config.', en: 'Config.', pt: 'Config.' },

  // ── Genérico ───────────────────────────────────────────────────────────────
  'fileUpload.error.title': { es: 'Error', en: 'Error', pt: 'Erro' },
  'fileUpload.common.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'fileUpload.common.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
  'fileUpload.common.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },
  'fileUpload.saved.title': { es: 'Guardado', en: 'Saved', pt: 'Salvo' },

  // ── Equipo de calibración (badge) ────────────────────────────────────────────
  'fileUpload.calib.overdueOne': { es: 'Vencida hace {days} día', en: 'Overdue by {days} day', pt: 'Vencida há {days} dia' },
  'fileUpload.calib.overdueOther': { es: 'Vencida hace {days} días', en: 'Overdue by {days} days', pt: 'Vencida há {days} dias' },
  'fileUpload.calib.today': { es: 'Vence hoy', en: 'Due today', pt: 'Vence hoje' },
  'fileUpload.calib.remainingOne': { es: 'Falta {days} día', en: '{days} day left', pt: 'Falta {days} dia' },
  'fileUpload.calib.remainingOther': { es: 'Faltan {days} días', en: '{days} days left', pt: 'Faltam {days} dias' },

  // ── Actividades (PDF / planos) — subida y resumen ────────────────────────────
  'fileUpload.pdf.uploadError': { es: 'No se pudo cargar el plano.', en: 'The drawing could not be loaded.', pt: 'Não foi possível carregar a planta.' },
  'fileUpload.pdf.addedTitle': { es: 'Plano agregado', en: 'Drawing added', pt: 'Planta adicionada' },
  'fileUpload.pdf.addedMsg': { es: 'Total: {count}. ¿Agregar otro?', en: 'Total: {count}. Add another?', pt: 'Total: {count}. Adicionar outra?' },
  'fileUpload.pdf.finish': { es: 'Terminar', en: 'Finish', pt: 'Concluir' },
  'fileUpload.pdf.addAnother': { es: 'Agregar otro', en: 'Add another', pt: 'Adicionar outra' },
  'fileUpload.pdf.summaryTitle': { es: 'Resumen', en: 'Summary', pt: 'Resumo' },
  'fileUpload.pdf.summaryLinked': { es: 'Vinculados ({count}): {names}', en: 'Linked ({count}): {names}', pt: 'Vinculados ({count}): {names}' },
  'fileUpload.pdf.summaryUnlinked': { es: 'Sin ubicación ({count}): {names}', en: 'No location ({count}): {names}', pt: 'Sem localização ({count}): {names}' },
  'fileUpload.pdf.summarySkipped': { es: 'Ya existían ({count})', en: 'Already existed ({count})', pt: 'Já existiam ({count})' },

  // ── Recargar PDF (Alert) ─────────────────────────────────────────────────────
  'fileUpload.pdf.reloadTitle': { es: 'Recargar PDF', en: 'Reload PDF', pt: 'Recarregar PDF' },
  'fileUpload.pdf.reloadDownloaded': { es: 'Descargados: {count}', en: 'Downloaded: {count}', pt: 'Baixados: {count}' },
  'fileUpload.pdf.reloadSkipped': { es: 'Ya existían: {count}', en: 'Already existed: {count}', pt: 'Já existiam: {count}' },
  'fileUpload.pdf.reloadError': { es: 'Error: {error}', en: 'Error: {error}', pt: 'Erro: {error}' },
  'fileUpload.pdf.reloadNone': { es: 'No se encontraron planos nuevos.', en: 'No new drawings found.', pt: 'Nenhuma planta nova encontrada.' },

  // ── Revincular plano (Alert) ─────────────────────────────────────────────────
  'fileUpload.relink.noMatchTitle': { es: 'Sin coincidencias', en: 'No matches', pt: 'Sem correspondências' },
  'fileUpload.relink.noMatchMsg': { es: 'No se encontraron ubicaciones que referencien "{name}".', en: 'No locations referencing "{name}" were found.', pt: 'Nenhuma localização que referencie "{name}" foi encontrada.' },
  'fileUpload.relink.doneTitle': { es: 'Revínculo completado', en: 'Relink completed', pt: 'Revínculo concluído' },
  'fileUpload.relink.doneLinked': { es: '{count} ubicación(es) vinculadas.', en: '{count} location(s) linked.', pt: '{count} localização(ões) vinculadas.' },
  'fileUpload.relink.alreadyLinked': { es: 'Ya estaba completamente vinculado.', en: 'It was already fully linked.', pt: 'Já estava totalmente vinculado.' },

  // ── Eliminar plano (Alert) ───────────────────────────────────────────────────
  'fileUpload.pdf.deleteTitle': { es: 'Eliminar plano', en: 'Delete drawing', pt: 'Excluir planta' },
  'fileUpload.pdf.deleteMsg': { es: '¿Eliminar "{name}"?', en: 'Delete "{name}"?', pt: 'Excluir "{name}"?' },

  // ── DWG ──────────────────────────────────────────────────────────────────────
  'fileUpload.dwg.loadedTitle': { es: 'Cargado', en: 'Loaded', pt: 'Carregado' },
  'fileUpload.dwg.loadedMsg': { es: '{count} archivo(s) DWG guardado(s).', en: '{count} DWG file(s) saved.', pt: '{count} arquivo(s) DWG salvo(s).' },
  'fileUpload.dwg.loadError': { es: 'No se pudo cargar el archivo DWG.', en: 'The DWG file could not be loaded.', pt: 'Não foi possível carregar o arquivo DWG.' },
  'fileUpload.dwg.openErrorTitle': { es: 'No se pudo abrir el archivo DWG', en: 'The DWG file could not be opened', pt: 'Não foi possível abrir o arquivo DWG' },
  'fileUpload.dwg.openErrorMsg': { es: 'Asegúrate de tener una app compatible instalada.', en: 'Make sure you have a compatible app installed.', pt: 'Certifique-se de ter um aplicativo compatível instalado.' },
  'fileUpload.dwg.deleteTitle': { es: 'Eliminar DWG', en: 'Delete DWG', pt: 'Excluir DWG' },
  'fileUpload.dwg.deleteMsg': { es: '¿Eliminar "{name}.dwg"?', en: 'Delete "{name}.dwg"?', pt: 'Excluir "{name}.dwg"?' },
  'fileUpload.dwg.reloadTitle': { es: 'Recargar DWG', en: 'Reload DWG', pt: 'Recarregar DWG' },
  'fileUpload.dwg.reloadDownloaded': { es: 'Descargados: {count}', en: 'Downloaded: {count}', pt: 'Baixados: {count}' },
  'fileUpload.dwg.reloadSkipped': { es: 'Ya existían: {count}', en: 'Already existed: {count}', pt: 'Já existiam: {count}' },
  'fileUpload.dwg.reloadError': { es: 'Error: {error}', en: 'Error: {error}', pt: 'Erro: {error}' },
  'fileUpload.dwg.reloadNone': { es: 'No se encontraron archivos nuevos.', en: 'No new files found.', pt: 'Nenhum arquivo novo encontrado.' },

  // ── Plantillas / protocolos (Alert) ──────────────────────────────────────────
  'fileUpload.template.visibilityError': { es: 'No se pudo cambiar la visibilidad del tipo de ensayo.', en: 'The test type visibility could not be changed.', pt: 'Não foi possível alterar a visibilidade do tipo de ensaio.' },

  // ── Personalizar (estampado) ─────────────────────────────────────────────────
  'fileUpload.stamp.commentSavedMsg': { es: 'El comentario se estampará en las fotos de todos los usuarios.', en: 'The comment will be stamped on every user\'s photos.', pt: 'O comentário será estampado nas fotos de todos os usuários.' },
  'fileUpload.stamp.logoSavedTitle': { es: 'Logo guardado', en: 'Logo saved', pt: 'Logotipo salvo' },
  'fileUpload.stamp.logoSavedMsg': { es: 'El logo del proyecto está disponible para todos los usuarios.', en: 'The project logo is available to all users.', pt: 'O logotipo do projeto está disponível para todos os usuários.' },
  'fileUpload.stamp.logoError': { es: 'No se pudo cargar el logo.', en: 'The logo could not be loaded.', pt: 'Não foi possível carregar o logotipo.' },
  'fileUpload.signature.savedTitle': { es: 'Firma guardada', en: 'Signature saved', pt: 'Assinatura salva' },
  'fileUpload.signature.savedMsg': { es: 'La firma se incluirá en los reportes PDF exportados.', en: 'The signature will be included in exported PDF reports.', pt: 'A assinatura será incluída nos relatórios PDF exportados.' },
  'fileUpload.signature.error': { es: 'No se pudo cargar la firma.', en: 'The signature could not be loaded.', pt: 'Não foi possível carregar a assinatura.' },

  // ── Render: Actividades ──────────────────────────────────────────────────────
  'fileUpload.act.importBtn': { es: 'Importar Excel de Actividades', en: 'Import Activities Excel', pt: 'Importar Excel de Atividades' },
  'fileUpload.act.importedOne': { es: '{count} protocolo importado', en: '{count} protocol imported', pt: '{count} protocolo importado' },
  'fileUpload.act.importedOther': { es: '{count} protocolos importados', en: '{count} protocols imported', pt: '{count} protocolos importados' },
  'fileUpload.act.modifiedSuffixOne': { es: ' · {count} modificado', en: ' · {count} modified', pt: ' · {count} modificado' },
  'fileUpload.act.modifiedSuffixOther': { es: ' · {count} modificados', en: ' · {count} modified', pt: ' · {count} modificados' },
  'fileUpload.act.modifiedOnlyOne': { es: '{count} protocolo modificado', en: '{count} protocol modified', pt: '{count} protocolo modificado' },
  'fileUpload.act.modifiedOnlyOther': { es: '{count} protocolos modificados', en: '{count} protocols modified', pt: '{count} protocolos modificados' },
  'fileUpload.common.noChanges': { es: 'Sin cambios', en: 'No changes', pt: 'Sem alterações' },
  'fileUpload.act.loadedTitle': { es: 'Protocolos cargados ({count})', en: 'Loaded protocols ({count})', pt: 'Protocolos carregados ({count})' },
  'fileUpload.act.hiddenBadge': { es: 'Oculto', en: 'Hidden', pt: 'Oculto' },

  // ── Render: Ubicaciones ──────────────────────────────────────────────────────
  'fileUpload.loc.importBtn': { es: 'Importar Excel de Ubicaciones', en: 'Import Locations Excel', pt: 'Importar Excel de Localizações' },
  'fileUpload.loc.importedOne': { es: '{count} ubicación importada', en: '{count} location imported', pt: '{count} localização importada' },
  'fileUpload.loc.importedOther': { es: '{count} ubicaciones importadas', en: '{count} locations imported', pt: '{count} localizações importadas' },
  'fileUpload.loc.modifiedSuffixOne': { es: ' · {count} modificada', en: ' · {count} modified', pt: ' · {count} modificada' },
  'fileUpload.loc.modifiedSuffixOther': { es: ' · {count} modificadas', en: ' · {count} modified', pt: ' · {count} modificadas' },
  'fileUpload.loc.modifiedOnlyOne': { es: '{count} ubicación modificada', en: '{count} location modified', pt: '{count} localização modificada' },
  'fileUpload.loc.modifiedOnlyOther': { es: '{count} ubicaciones modificadas', en: '{count} locations modified', pt: '{count} localizações modificadas' },
  'fileUpload.loc.loadedTitle': { es: 'Ubicaciones cargadas ({count})', en: 'Loaded locations ({count})', pt: 'Localizações carregadas ({count})' },

  // ── Render: Equipos (títulos de tabs) ────────────────────────────────────────
  'fileUpload.equipos.titleLab': { es: 'Catálogo de equipos de laboratorio', en: 'Laboratory equipment catalog', pt: 'Catálogo de equipamentos de laboratório' },
  'fileUpload.equipos.titleMaq': { es: 'Catálogo de maquinaria pesada', en: 'Heavy machinery catalog', pt: 'Catálogo de maquinário pesado' },

  // ── Render: Planos PDF ───────────────────────────────────────────────────────
  'fileUpload.pdf.uploadBtn': { es: 'Subir PDF', en: 'Upload PDF', pt: 'Enviar PDF' },
  'fileUpload.pdf.reloadBtn': { es: 'Recargar PDF', en: 'Reload PDF', pt: 'Recarregar PDF' },
  'fileUpload.pdf.emptyTitle': { es: 'Sin planos PDF cargados', en: 'No PDF drawings loaded', pt: 'Nenhuma planta PDF carregada' },
  'fileUpload.pdf.emptySub': { es: 'El nombre del PDF debe coincidir con el "Plano de referencia" de la ubicación.', en: 'The PDF name must match the location\'s "Reference drawing".', pt: 'O nome do PDF deve coincidir com a "Planta de referência" da localização.' },
  'fileUpload.pdf.cardLocations': { es: '{count} ubicación(es)', en: '{count} location(s)', pt: '{count} localização(ões)' },
  'fileUpload.pdf.cardNoLoc': { es: 'Sin ubicación vinculada', en: 'No location linked', pt: 'Sem localização vinculada' },
  'fileUpload.pdf.locRowNone': { es: 'Sin ubicación', en: 'No location', pt: 'Sem localização' },

  // ── Render: Planos DWG ───────────────────────────────────────────────────────
  'fileUpload.dwg.uploadBtn': { es: 'Cargar DWG', en: 'Upload DWG', pt: 'Carregar DWG' },
  'fileUpload.dwg.reloadBtn': { es: 'Recargar DWG', en: 'Reload DWG', pt: 'Recarregar DWG' },
  'fileUpload.dwg.emptyTitle': { es: 'Sin archivos DWG cargados.', en: 'No DWG files loaded.', pt: 'Nenhum arquivo DWG carregado.' },
  'fileUpload.dwg.emptySub': { es: 'Carga archivos .dwg para verlos en DWG FastView.', en: 'Load .dwg files to view them in DWG FastView.', pt: 'Carregue arquivos .dwg para vê-los no DWG FastView.' },
  'fileUpload.dwg.openBtn': { es: 'Ver DWG', en: 'View DWG', pt: 'Ver DWG' },

  // ── Render: Personalizar ─────────────────────────────────────────────────────
  'fileUpload.stamp.title': { es: 'Estampado de fotos', en: 'Photo stamping', pt: 'Estampagem de fotos' },
  'fileUpload.stamp.desc': { es: 'Agrega timestamp y logo del proyecto en cada foto capturada.', en: 'Adds a timestamp and project logo to each captured photo.', pt: 'Adiciona carimbo de data/hora e logotipo do projeto em cada foto capturada.' },
  'fileUpload.stamp.noLogo': { es: 'Sin logo', en: 'No logo', pt: 'Sem logotipo' },
  'fileUpload.stamp.logoTitle': { es: 'Logo del proyecto', en: 'Project logo', pt: 'Logotipo do projeto' },
  'fileUpload.stamp.logoSub': { es: 'Se muestra en la esquina superior derecha con 25% de opacidad.', en: 'Shown in the top-right corner at 25% opacity.', pt: 'Exibido no canto superior direito com 25% de opacidade.' },
  'fileUpload.stamp.changePhoto': { es: 'Cambiar foto', en: 'Change photo', pt: 'Alterar foto' },
  'fileUpload.stamp.uploadPhoto': { es: 'Subir foto', en: 'Upload photo', pt: 'Enviar foto' },
  'fileUpload.stamp.commentLabel': { es: 'Comentario en fotos', en: 'Photo comment', pt: 'Comentário nas fotos' },
  'fileUpload.stamp.commentDesc': { es: 'Texto que aparece bajo el timestamp en cada foto.', en: 'Text shown below the timestamp on each photo.', pt: 'Texto exibido abaixo do carimbo de data/hora em cada foto.' },
  'fileUpload.stamp.commentPlaceholder': { es: 'Ej: Proyecto Edificio Norte — Fase 2', en: 'E.g.: North Building Project — Phase 2', pt: 'Ex.: Projeto Edifício Norte — Fase 2' },
  'fileUpload.signature.title': { es: 'Firma del usuario', en: 'User signature', pt: 'Assinatura do usuário' },
  'fileUpload.signature.desc': { es: 'La firma ahora es personal de cada usuario. Configúrala desde el menú (☰) → "Ingresar firma". Aparece al pie de los protocolos que tú apruebes.', en: 'The signature is now personal to each user. Set it up from the menu (☰) → "Enter signature". It appears at the bottom of the protocols you approve.', pt: 'A assinatura agora é pessoal de cada usuário. Configure-a no menu (☰) → "Inserir assinatura". Aparece no rodapé dos protocolos que você aprovar.' },

  // ── EquiposTab ───────────────────────────────────────────────────────────────
  'fileUpload.equipos.subtitleMaq': { es: 'Sube un archivo {csv} o {excel} de maquinaria pesada.\n• Si tiene solo equipos → se importa el catálogo.\n• Si tiene varias hojas (Equipos, Actividades, Turnos, Plantillas, Equipo-Actividad) → se importa todo el bundle de Trazabilidad.\nLo importado aquí se marca como maquinaria pesada.', en: 'Upload a {csv} or {excel} file of heavy machinery.\n• If it has only equipment → the catalog is imported.\n• If it has several sheets (Equipment, Activities, Shifts, Templates, Equipment-Activity) → the entire Traceability bundle is imported.\nWhat is imported here is marked as heavy machinery.', pt: 'Envie um arquivo {csv} ou {excel} de maquinário pesado.\n• Se tiver apenas equipamentos → o catálogo é importado.\n• Se tiver várias planilhas (Equipamentos, Atividades, Turnos, Modelos, Equipamento-Atividade) → todo o pacote de Rastreabilidade é importado.\nO que é importado aqui é marcado como maquinário pesado.' },
  'fileUpload.equipos.subtitleLab': { es: 'Sube un {csv} o {excel} con los equipos de laboratorio (balanzas, fiolas, taras, moldes…).\nLo importado aquí se marca como laboratorio (calibrables).', en: 'Upload a {csv} or {excel} with the laboratory equipment (scales, flasks, tares, molds…).\nWhat is imported here is marked as laboratory (calibratable).', pt: 'Envie um {csv} ou {excel} com os equipamentos de laboratório (balanças, frascos, taras, moldes…).\nO que é importado aqui é marcado como laboratório (calibráveis).' },
  'fileUpload.equipos.uploadBtn': { es: 'Subir Excel / CSV', en: 'Upload Excel / CSV', pt: 'Enviar Excel / CSV' },

  // Preview de importación
  'fileUpload.equipos.detectedBundle': { es: 'Detectado: bundle de Trazabilidad', en: 'Detected: Traceability bundle', pt: 'Detectado: pacote de Rastreabilidade' },
  'fileUpload.equipos.detectedSimple': { es: 'Detectado: catálogo simple de equipos', en: 'Detected: simple equipment catalog', pt: 'Detectado: catálogo simples de equipamentos' },
  'fileUpload.equipos.lineEquipos': { es: '• Equipos: ', en: '• Equipment: ', pt: '• Equipamentos: ' },
  'fileUpload.equipos.lineActividades': { es: '• Actividades: ', en: '• Activities: ', pt: '• Atividades: ' },
  'fileUpload.equipos.lineLinks': { es: '• Vínculos Equipo-Actividad: ', en: '• Equipment-Activity links: ', pt: '• Vínculos Equipamento-Atividade: ' },
  'fileUpload.equipos.lineTurnos': { es: '• Turnos: ', en: '• Shifts: ', pt: '• Turnos: ' },
  'fileUpload.equipos.lineTemplateItems': { es: '• Items plantillas: ', en: '• Template items: ', pt: '• Itens de modelos: ' },
  'fileUpload.equipos.templatesFrom': { es: ' (de {count} plantillas)', en: ' (from {count} templates)', pt: ' (de {count} modelos)' },
  'fileUpload.equipos.moreWarnings': { es: '…y {count} más', en: '…and {count} more', pt: '…e mais {count}' },
  'fileUpload.equipos.confirmImport': { es: 'Confirmar importación', en: 'Confirm import', pt: 'Confirmar importação' },

  // Summary
  'fileUpload.equipos.importDoneTitle': { es: 'Importación completada', en: 'Import completed', pt: 'Importação concluída' },
  'fileUpload.equipos.summaryEquipos': { es: 'Equipos: +{added} nuevos · {modified} actualizados{deduped}', en: 'Equipment: +{added} new · {modified} updated{deduped}', pt: 'Equipamentos: +{added} novos · {modified} atualizados{deduped}' },
  'fileUpload.equipos.summaryEquiposDeduped': { es: ' · {count} duplicados eliminados', en: ' · {count} duplicates removed', pt: ' · {count} duplicados removidos' },
  'fileUpload.equipos.summaryActividades': { es: 'Actividades: +{added} nuevas · {modified} actualizadas', en: 'Activities: +{added} new · {modified} updated', pt: 'Atividades: +{added} novas · {modified} atualizadas' },
  'fileUpload.equipos.summaryLinks': { es: 'Vínculos: +{added} · {modified} actualizados · {skipped} omitidos', en: 'Links: +{added} · {modified} updated · {skipped} skipped', pt: 'Vínculos: +{added} · {modified} atualizados · {skipped} omitidos' },
  'fileUpload.equipos.summaryTurnos': { es: 'Turnos: +{added} · {modified} actualizados', en: 'Shifts: +{added} · {modified} updated', pt: 'Turnos: +{added} · {modified} atualizados' },
  'fileUpload.equipos.summaryTemplates': { es: 'Plantillas: +{added} · {modified} re-importadas · {items} items', en: 'Templates: +{added} · {modified} re-imported · {items} items', pt: 'Modelos: +{added} · {modified} reimportados · {items} itens' },

  // Reporte de calibración
  'fileUpload.equipos.reportBtn': { es: 'Reporte de calibración', en: 'Calibration report', pt: 'Relatório de calibração' },
  'fileUpload.equipos.reportError': { es: 'No se pudo generar el reporte de calibración.', en: 'The calibration report could not be generated.', pt: 'Não foi possível gerar o relatório de calibração.' },

  // Tablas auxiliares
  'fileUpload.equipos.auxTablesTitle': { es: 'Tablas auxiliares ({count})', en: 'Auxiliary tables ({count})', pt: 'Tabelas auxiliares ({count})' },
  'fileUpload.equipos.auxRowsMeta': { es: '{cols} — {rows} filas', en: '{cols} — {rows} rows', pt: '{cols} — {rows} linhas' },
  'fileUpload.equipos.nextCalibration': { es: 'Próx. calibración: {date}', en: 'Next calibration: {date}', pt: 'Próx. calibração: {date}' },
  'fileUpload.equipos.calibrateBtn': { es: 'Calibrar', en: 'Calibrate', pt: 'Calibrar' },

  // Modal Calibrar
  'fileUpload.calibrate.duplicateKeysTitle': { es: 'Llaves duplicadas', en: 'Duplicate keys', pt: 'Chaves duplicadas' },
  'fileUpload.calibrate.duplicateKeysMsg': { es: 'Cada medida debe tener una llave (1ª columna) única.', en: 'Each measurement must have a unique key (1st column).', pt: 'Cada medição deve ter uma chave (1ª coluna) única.' },
  'fileUpload.calibrate.saveError': { es: 'No se pudo guardar la calibración.', en: 'The calibration could not be saved.', pt: 'Não foi possível salvar a calibração.' },
  'fileUpload.calibrate.headerTitle': { es: 'Calibrar — {name}', en: 'Calibrate — {name}', pt: 'Calibrar — {name}' },
  'fileUpload.calibrate.keySuffix': { es: ' (llave)', en: ' (key)', pt: ' (chave)' },
  'fileUpload.calibrate.addMeasure': { es: 'Adicionar medida', en: 'Add measurement', pt: 'Adicionar medição' },
  'fileUpload.calibrate.keyHint': { es: 'La 1ª columna es la LLAVE única. En filas existentes no se edita; en una medida nueva se autogenera y puedes ajustarla.', en: 'The 1st column is the unique KEY. It is not editable on existing rows; on a new measurement it is auto-generated and you can adjust it.', pt: 'A 1ª coluna é a CHAVE única. Não é editável em linhas existentes; em uma nova medição é gerada automaticamente e você pode ajustá-la.' },
  'fileUpload.calibrate.nextDateLabel': { es: 'Próxima calibración (AAAA-MM-DD)', en: 'Next calibration (YYYY-MM-DD)', pt: 'Próxima calibração (AAAA-MM-DD)' },
  'fileUpload.calibrate.saveBtn': { es: 'Guardar calibración', en: 'Save calibration', pt: 'Salvar calibração' },

  // Estado vacío
  'fileUpload.equipos.emptyMaq': { es: 'Aún no hay maquinaria pesada en este proyecto.', en: 'There is no heavy machinery in this project yet.', pt: 'Ainda não há maquinário pesado neste projeto.' },
  'fileUpload.equipos.emptyLab': { es: 'Aún no hay equipos de laboratorio en este proyecto.', en: 'There is no laboratory equipment in this project yet.', pt: 'Ainda não há equipamentos de laboratório neste projeto.' },
  'fileUpload.equipos.emptyHint': { es: 'Sube un Excel para empezar.', en: 'Upload an Excel file to get started.', pt: 'Envie um Excel para começar.' },

  // Tarjeta de equipo
  'fileUpload.equipos.tagMaq': { es: 'MAQUINARIA', en: 'MACHINERY', pt: 'MAQUINÁRIO' },
  'fileUpload.equipos.tagLab': { es: 'LABORATORIO', en: 'LABORATORY', pt: 'LABORATÓRIO' },
  'fileUpload.equipos.noActivities': { es: 'Este equipo no tiene actividades asociadas.', en: 'This equipment has no associated activities.', pt: 'Este equipamento não tem atividades associadas.' },

  // kindLabel
  'fileUpload.kind.productive': { es: 'Productiva', en: 'Productive', pt: 'Produtiva' },
  'fileUpload.kind.maintenance': { es: 'Mantenim.', en: 'Maint.', pt: 'Manut.' },
  'fileUpload.kind.transport': { es: 'Transporte', en: 'Transport', pt: 'Transporte' },
  'fileUpload.kind.other': { es: 'Otro', en: 'Other', pt: 'Outro' },
};

export default fileUpload;
