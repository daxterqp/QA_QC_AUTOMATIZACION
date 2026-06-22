/**
 * i18n — Cadenas de la pantalla EnsayosScreen (namespace `ensayos`).
 * Cada clave: { es, en, pt }. Interpolación con {var}.
 */
const ensayos: Record<string, { es: string; en: string; pt: string }> = {
  // Estados de protocolo (etiquetas visibles)
  'ensayos.status.inProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'ensayos.status.inReview': { es: 'En revisión', en: 'Under review', pt: 'Em revisão' },
  'ensayos.status.approved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'ensayos.status.rejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },

  // Títulos de pantalla por modo
  'ensayos.title.sector': { es: 'Ensayos por sector', en: 'Tests by sector', pt: 'Ensaios por setor' },
  'ensayos.title.type': { es: 'Ensayos por tipo', en: 'Tests by type', pt: 'Ensaios por tipo' },
  'ensayos.title.date': { es: 'Ensayos por fecha', en: 'Tests by date', pt: 'Ensaios por data' },

  // Etiquetas de fecha / grupos
  'ensayos.dateToday': { es: '{date} (hoy)', en: '{date} (today)', pt: '{date} (hoje)' },
  'ensayos.noDate': { es: 'Sin fecha', en: 'No date', pt: 'Sem data' },

  // Alerts — creación de ensayos
  'ensayos.alert.missingType.title': { es: 'Falta el tipo', en: 'Type is missing', pt: 'Falta o tipo' },
  'ensayos.alert.missingType.msg': { es: 'Elige el tipo de ensayo.', en: 'Choose the test type.', pt: 'Escolha o tipo de ensaio.' },
  'ensayos.alert.hiddenType.title': { es: 'Tipo oculto', en: 'Hidden type', pt: 'Tipo oculto' },
  'ensayos.alert.hiddenType.msg': { es: 'Este tipo de ensayo está oculto: no se pueden crear ensayos nuevos.', en: 'This test type is hidden: new tests cannot be created.', pt: 'Este tipo de ensaio está oculto: não é possível criar novos ensaios.' },
  'ensayos.alert.invalidDate.title': { es: 'Fecha inválida', en: 'Invalid date', pt: 'Data inválida' },
  'ensayos.alert.invalidDate.msg': { es: 'Usa el formato AAAA-MM-DD (ej: 2026-03-03).', en: 'Use the format YYYY-MM-DD (e.g. 2026-03-03).', pt: 'Use o formato AAAA-MM-DD (ex.: 2026-03-03).' },
  'ensayos.alert.invalidTime.title': { es: 'Hora inválida', en: 'Invalid time', pt: 'Hora inválida' },
  'ensayos.alert.invalidTime.msg': { es: 'Usa el formato HH:MM (ej: 08:30).', en: 'Use the format HH:MM (e.g. 08:30).', pt: 'Use o formato HH:MM (ex.: 08:30).' },
  'ensayos.alert.created.title': { es: 'Ensayos creados', en: 'Tests created', pt: 'Ensaios criados' },
  'ensayos.alert.created.msg': { es: '{count} ensayo(s) de {type} creado(s).', en: '{count} test(s) of {type} created.', pt: '{count} ensaio(s) de {type} criado(s).' },
  'ensayos.alert.created.codes': { es: '\nCódigos: {codes}', en: '\nCodes: {codes}', pt: '\nCódigos: {codes}' },
  'ensayos.alert.created.warning': { es: '\n⚠ {warning}', en: '\n⚠ {warning}', pt: '\n⚠ {warning}' },
  'ensayos.alert.error.title': { es: 'Error', en: 'Error', pt: 'Erro' },
  'ensayos.alert.error.createFailed': { es: 'No se pudieron crear los ensayos.', en: 'The tests could not be created.', pt: 'Não foi possível criar os ensaios.' },

  // Alerts — gestión / eliminación
  'ensayos.alert.saveFailed': { es: 'No se pudo guardar.', en: 'Could not save.', pt: 'Não foi possível salvar.' },
  'ensayos.alert.noPermission.title': { es: 'Sin permiso', en: 'No permission', pt: 'Sem permissão' },
  'ensayos.alert.noPermission.msg': { es: 'Solo el Jefe o el Creador del proyecto pueden eliminar ensayos.', en: 'Only the project Lead or Creator can delete tests.', pt: 'Apenas o Líder ou o Criador do projeto podem excluir ensaios.' },
  'ensayos.alert.delete.title': { es: 'Eliminar ensayo', en: 'Delete test', pt: 'Excluir ensaio' },
  'ensayos.alert.delete.msg': { es: 'Se eliminará {label} con todos sus datos y evidencias, aquí y en la nube. Se guardará una copia en la Papelera de Reciclaje. Esta acción no se puede deshacer.', en: '{label} will be deleted with all its data and evidence, here and in the cloud. A copy will be saved in the Recycle Bin. This action cannot be undone.', pt: '{label} será excluído com todos os seus dados e evidências, aqui e na nuvem. Uma cópia será salva na Lixeira. Esta ação não pode ser desfeita.' },
  'ensayos.alert.delete.defaultLabel': { es: 'el ensayo', en: 'the test', pt: 'o ensaio' },
  'ensayos.alert.delete.deleteFailed': { es: 'No se pudo eliminar el ensayo.', en: 'The test could not be deleted.', pt: 'Não foi possível excluir o ensaio.' },

  // Botones genéricos
  'ensayos.btn.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'ensayos.btn.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Filtros
  'ensayos.filters.label': { es: 'Filtros', en: 'Filters', pt: 'Filtros' },
  'ensayos.filters.labelActive': { es: 'Filtros · activos', en: 'Filters · active', pt: 'Filtros · ativos' },
  'ensayos.filters.clear': { es: 'Limpiar', en: 'Clear', pt: 'Limpar' },
  'ensayos.filters.searchPlaceholder': { es: 'Buscar por código, ensayo o referencia…', en: 'Search by code, test or reference…', pt: 'Buscar por código, ensaio ou referência…' },
  'ensayos.filters.type.all': { es: 'Tipo: todos', en: 'Type: all', pt: 'Tipo: todos' },
  'ensayos.filters.type.one': { es: 'Tipo (1)', en: 'Type (1)', pt: 'Tipo (1)' },
  'ensayos.filters.type.many': { es: 'Tipo ({count})', en: 'Type ({count})', pt: 'Tipo ({count})' },
  'ensayos.filters.sector.all': { es: 'Sector: todos', en: 'Sector: all', pt: 'Setor: todos' },
  'ensayos.filters.sector.one': { es: 'Sector (1)', en: 'Sector (1)', pt: 'Setor (1)' },
  'ensayos.filters.sector.many': { es: 'Sector ({count})', en: 'Sector ({count})', pt: 'Setor ({count})' },
  'ensayos.filters.sample': { es: 'Muestra', en: 'Sample', pt: 'Amostra' },
  'ensayos.filters.sample.many': { es: 'Muestra ({count})', en: 'Sample ({count})', pt: 'Amostra ({count})' },

  // Encabezado de grupo
  'ensayos.group.count': { es: '{count} ensayo(s)', en: '{count} test(s)', pt: '{count} ensaio(s)' },
  'ensayos.group.hiddenNote': { es: 'Tipo de ensayo oculto — no se pueden crear nuevos (los registros existentes siguen disponibles).', en: 'Hidden test type — new ones cannot be created (existing records remain available).', pt: 'Tipo de ensaio oculto — não é possível criar novos (os registros existentes permanecem disponíveis).' },
  'ensayos.group.addTest': { es: 'Adicionar ensayo', en: 'Add test', pt: 'Adicionar ensaio' },

  // Estado vacío
  'ensayos.empty.noSectors': { es: 'Este proyecto no tiene sectores cargados.\nImpórtalos desde Cargar archivos → Sectores (web) o Geolocalización.', en: 'This project has no sectors loaded.\nImport them from Upload files → Sectors (web) or Geolocation.', pt: 'Este projeto não tem setores carregados.\nImporte-os em Carregar arquivos → Setores (web) ou Geolocalização.' },
  'ensayos.empty.noTemplates': { es: 'Este proyecto no tiene plantillas de ensayo cargadas.', en: 'This project has no test templates loaded.', pt: 'Este projeto não tem modelos de ensaio carregados.' },
  'ensayos.empty.noneMatch': { es: 'Sin ensayos que coincidan con la búsqueda/filtros.', en: 'No tests match the search/filters.', pt: 'Nenhum ensaio corresponde à busca/filtros.' },
  'ensayos.empty.none': { es: 'Sin ensayos todavía.', en: 'No tests yet.', pt: 'Nenhum ensaio ainda.' },

  // Modal de filtro multiselect
  'ensayos.picker.title.type': { es: 'Filtrar por tipo de ensayo', en: 'Filter by test type', pt: 'Filtrar por tipo de ensaio' },
  'ensayos.picker.title.sample': { es: 'Filtrar por muestra', en: 'Filter by sample', pt: 'Filtrar por amostra' },
  'ensayos.picker.title.sector': { es: 'Filtrar por sector', en: 'Filter by sector', pt: 'Filtrar por setor' },
  'ensayos.picker.hint': { es: 'Selecciona uno o varios. Vacío = todos.', en: 'Select one or more. Empty = all.', pt: 'Selecione um ou mais. Vazio = todos.' },
  'ensayos.picker.sampleFrom': { es: 'Desde muestra #', en: 'From sample #', pt: 'Da amostra #' },
  'ensayos.picker.sampleTo': { es: 'Hasta muestra #', en: 'To sample #', pt: 'Até amostra #' },
  'ensayos.picker.all': { es: 'Todos (limpiar selección)', en: 'All (clear selection)', pt: 'Todos (limpar seleção)' },
  'ensayos.picker.noSamples': { es: 'El proyecto aún no tiene muestras.', en: 'The project has no samples yet.', pt: 'O projeto ainda não tem amostras.' },
  'ensayos.picker.apply': { es: 'Aplicar', en: 'Apply', pt: 'Aplicar' },

  // Modal de gestión (long-press)
  'ensayos.manage.locked': { es: 'Este ensayo está {state}: no se puede editar ni eliminar desde aquí.', en: 'This test is {state}: it cannot be edited or deleted from here.', pt: 'Este ensaio está {state}: não é possível editar nem excluir daqui.' },
  'ensayos.manage.locked.approved': { es: 'aprobado', en: 'approved', pt: 'aprovado' },
  'ensayos.manage.locked.inReview': { es: 'en revisión', en: 'under review', pt: 'em revisão' },
  'ensayos.field.testDate': { es: 'Fecha del ensayo', en: 'Test date', pt: 'Data do ensaio' },
  'ensayos.field.time': { es: 'Hora', en: 'Time', pt: 'Hora' },
  'ensayos.btn.saving': { es: 'Guardando…', en: 'Saving…', pt: 'Salvando…' },
  'ensayos.btn.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },
  'ensayos.manage.deleteTest': { es: 'Eliminar ensayo', en: 'Delete test', pt: 'Excluir ensaio' },

  // Modal "Adicionar ensayo"
  'ensayos.add.title': { es: 'Adicionar ensayo', en: 'Add test', pt: 'Adicionar ensaio' },
  'ensayos.add.titleGroup': { es: 'Adicionar ensayo — {group}', en: 'Add test — {group}', pt: 'Adicionar ensaio — {group}' },
  'ensayos.field.testType': { es: 'Tipo de ensayo', en: 'Test type', pt: 'Tipo de ensaio' },
  'ensayos.field.quantity': { es: 'Cantidad', en: 'Quantity', pt: 'Quantidade' },
  'ensayos.add.timeHint': { es: 'Se recolectará la hora de inicio del ensayo.', en: 'The test start time will be recorded.', pt: 'A hora de início do ensaio será registrada.' },
  'ensayos.btn.creating': { es: 'Creando…', en: 'Creating…', pt: 'Criando…' },
  'ensayos.btn.create': { es: 'Crear', en: 'Create', pt: 'Criar' },
};

export default ensayos;
