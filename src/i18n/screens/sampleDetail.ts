/**
 * i18n — Cadenas de SampleDetailScreen (pantalla de detalle de una muestra).
 * Record<clave, { es, en, pt }>. Se agrega en `./index.ts`.
 */
const sampleDetail: Record<string, { es: string; en: string; pt: string }> = {
  // Estados (etiquetas de protocolo/ensayo)
  'sampleDetail.status.inProgress': { es: 'En progreso', en: 'In progress', pt: 'Em andamento' },
  'sampleDetail.status.inReview': { es: 'En revisión', en: 'Under review', pt: 'Em revisão' },
  'sampleDetail.status.approved': { es: 'Aprobado', en: 'Approved', pt: 'Aprovado' },
  'sampleDetail.status.rejected': { es: 'Rechazado', en: 'Rejected', pt: 'Rejeitado' },

  // Cabecera / estados de carga
  'sampleDetail.title': { es: 'Muestra', en: 'Sample', pt: 'Amostra' },
  'sampleDetail.notFound': { es: 'Muestra no encontrada.', en: 'Sample not found.', pt: 'Amostra não encontrada.' },

  // Etiquetas de datos generales
  'sampleDetail.field.date': { es: 'Fecha', en: 'Date', pt: 'Data' },
  'sampleDetail.field.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'sampleDetail.field.location': { es: 'Ubicación', en: 'Location', pt: 'Localização' },
  'sampleDetail.field.materialType': { es: 'Tipo de material', en: 'Material type', pt: 'Tipo de material' },
  'sampleDetail.field.condition': { es: 'Condición', en: 'Condition', pt: 'Condição' },
  'sampleDetail.field.depthM': { es: 'Profundidad (m)', en: 'Depth (m)', pt: 'Profundidade (m)' },
  'sampleDetail.field.depth': { es: 'Profundidad', en: 'Depth', pt: 'Profundidade' },
  'sampleDetail.field.coordinates': { es: 'Coordenadas', en: 'Coordinates', pt: 'Coordenadas' },
  'sampleDetail.field.code': { es: 'Código', en: 'Code', pt: 'Código' },
  'sampleDetail.field.layer': { es: 'Capa', en: 'Layer', pt: 'Camada' },
  'sampleDetail.layerValue': { es: 'Capa - {value}', en: 'Layer - {value}', pt: 'Camada - {value}' },

  // Valores de condición
  'sampleDetail.condition.altered': { es: 'Alterada', en: 'Disturbed', pt: 'Deformada' },
  'sampleDetail.condition.unaltered': { es: 'Inalterada', en: 'Undisturbed', pt: 'Indeformada' },

  // Sección de ensayos
  'sampleDetail.tests': { es: 'Ensayos ({count})', en: 'Tests ({count})', pt: 'Ensaios ({count})' },
  'sampleDetail.addTest': { es: 'Añadir ensayo', en: 'Add test', pt: 'Adicionar ensaio' },
  'sampleDetail.noTests': { es: 'Sin ensayos. Pulsa "Añadir ensayo".', en: 'No tests. Tap "Add test".', pt: 'Sem ensaios. Toque em "Adicionar ensaio".' },

  // Modal añadir ensayo
  'sampleDetail.modal.title': { es: 'Añadir ensayo a la muestra', en: 'Add test to sample', pt: 'Adicionar ensaio à amostra' },
  'sampleDetail.modal.testType': { es: 'Tipo de ensayo', en: 'Test type', pt: 'Tipo de ensaio' },
  'sampleDetail.modal.noTypes': { es: 'No hay tipos disponibles.', en: 'No types available.', pt: 'Nenhum tipo disponível.' },
  'sampleDetail.modal.quantity': { es: 'Cantidad', en: 'Quantity', pt: 'Quantidade' },
  'sampleDetail.modal.creating': { es: 'Creando…', en: 'Creating…', pt: 'Criando…' },
  'sampleDetail.modal.create': { es: 'Crear', en: 'Create', pt: 'Criar' },

  // Alerts
  'sampleDetail.alert.missingTypeTitle': { es: 'Falta el tipo', en: 'Missing type', pt: 'Tipo ausente' },
  'sampleDetail.alert.missingTypeMsg': { es: 'Elige el tipo de ensayo.', en: 'Choose the test type.', pt: 'Escolha o tipo de ensaio.' },
  'sampleDetail.alert.errorTitle': { es: 'Error', en: 'Error', pt: 'Erro' },
  'sampleDetail.alert.createFailed': { es: 'No se pudieron crear los ensayos.', en: 'The tests could not be created.', pt: 'Não foi possível criar os ensaios.' },
  'sampleDetail.alert.exportFailed': { es: 'No se pudo exportar.', en: 'Could not export.', pt: 'Não foi possível exportar.' },

  // Export PDF
  'sampleDetail.pdf.sampleTitle': { es: 'Muestra {code}', en: 'Sample {code}', pt: 'Amostra {code}' },
  'sampleDetail.pdf.generalData': { es: 'Datos generales', en: 'General data', pt: 'Dados gerais' },
  'sampleDetail.pdf.depthValue': { es: '{from} a {to} m', en: '{from} to {to} m', pt: '{from} a {to} m' },
  'sampleDetail.pdf.testsOfSample': { es: 'Ensayos de la muestra ({count})', en: 'Sample tests ({count})', pt: 'Ensaios da amostra ({count})' },
  'sampleDetail.pdf.colNumber': { es: '#', en: '#', pt: '#' },
  'sampleDetail.pdf.colCode': { es: 'Código', en: 'Code', pt: 'Código' },
  'sampleDetail.pdf.colType': { es: 'Tipo', en: 'Type', pt: 'Tipo' },
  'sampleDetail.pdf.colStatus': { es: 'Estado', en: 'Status', pt: 'Status' },
  'sampleDetail.pdf.colDate': { es: 'Fecha', en: 'Date', pt: 'Data' },
  'sampleDetail.pdf.noTests': { es: 'Sin ensayos', en: 'No tests', pt: 'Sem ensaios' },
};

export default sampleDetail;
