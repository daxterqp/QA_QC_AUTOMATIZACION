/**
 * i18n — Cadenas de WorkSessionDetailScreen (detalle de una sesión de trabajo cerrada).
 * Record<clave, { es, en, pt }>. Se agrega en `./index.ts`.
 */
const workSession: Record<string, { es: string; en: string; pt: string }> = {
  // Estados de carga / cabecera
  'workSession.loading': { es: 'Cargando…', en: 'Loading…', pt: 'Carregando…' },
  'workSession.title': { es: 'Sesión cerrada', en: 'Closed session', pt: 'Sessão encerrada' },

  // Banner de cierre automático
  'workSession.autoClosedBanner': { es: 'Esta sesión fue cerrada automáticamente por inactividad de 24h.', en: 'This session was closed automatically after 24h of inactivity.', pt: 'Esta sessão foi encerrada automaticamente após 24h de inatividade.' },

  // Tarjeta de tiempo
  'workSession.effectiveTime': { es: 'tiempo efectivo', en: 'effective time', pt: 'tempo efetivo' },
  'workSession.pausedTotal': { es: '{time} en pausa', en: '{time} paused', pt: '{time} em pausa' },

  // Etiquetas de información
  'workSession.field.equipment': { es: 'Equipo', en: 'Equipment', pt: 'Equipamento' },
  'workSession.field.activity': { es: 'Actividad', en: 'Activity', pt: 'Atividade' },
  'workSession.field.sector': { es: 'Sector', en: 'Sector', pt: 'Setor' },
  'workSession.field.shift': { es: 'Turno', en: 'Shift', pt: 'Turno' },
  'workSession.field.start': { es: 'Inicio', en: 'Start', pt: 'Início' },
  'workSession.field.end': { es: 'Fin', en: 'End', pt: 'Fim' },
  'workSession.field.gpsPoints': { es: 'Puntos GPS', en: 'GPS points', pt: 'Pontos GPS' },

  // Corregir hora de cierre
  'workSession.editEnd': { es: 'Corregir hora de cierre', en: 'Adjust closing time', pt: 'Corrigir hora de encerramento' },
  'workSession.editEnd.sub': { es: 'Recortará el último intervalo activo. Se acota a 12h máximo por intervalo.', en: 'It will trim the last active interval. Capped at 12h max per interval.', pt: 'Recortará o último intervalo ativo. Limitado a 12h máximo por intervalo.' },
  'workSession.editEnd.timeLabel': { es: 'Hora:', en: 'Time:', pt: 'Hora:' },

  // Checklist
  'workSession.viewChecklist': { es: 'Ver checklist', en: 'View checklist', pt: 'Ver checklist' },

  // Notas
  'workSession.notes': { es: 'NOTAS', en: 'NOTES', pt: 'NOTAS' },
  'workSession.notesPlaceholder': { es: 'Agrega notas administrativas…', en: 'Add administrative notes…', pt: 'Adicione notas administrativas…' },
  'workSession.saving': { es: 'Guardando…', en: 'Saving…', pt: 'Salvando…' },
  'workSession.saveNotes': { es: 'Guardar notas', en: 'Save notes', pt: 'Salvar notas' },
  'workSession.noNotes': { es: '— Sin notas —', en: '— No notes —', pt: '— Sem notas —' },

  // Intervalos
  'workSession.intervals': { es: 'INTERVALOS', en: 'INTERVALS', pt: 'INTERVALOS' },
  'workSession.interval.active': { es: 'Activa', en: 'Active', pt: 'Ativa' },
  'workSession.interval.pause': { es: 'Pausa', en: 'Pause', pt: 'Pausa' },
  'workSession.interval.open': { es: ' (abierto)', en: ' (open)', pt: ' (aberto)' },

  // Eliminar
  'workSession.delete': { es: 'Eliminar sesión', en: 'Delete session', pt: 'Excluir sessão' },

  // Modal: guardar / cancelar
  'workSession.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'workSession.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },

  // Alerts
  'workSession.alert.invalidDataTitle': { es: 'Datos inválidos', en: 'Invalid data', pt: 'Dados inválidos' },
  'workSession.alert.invalidDataMsg': { es: 'Revisa la fecha y la hora.', en: 'Check the date and time.', pt: 'Verifique a data e a hora.' },
  'workSession.alert.fixFailedTitle': { es: 'No se pudo corregir', en: 'Could not adjust', pt: 'Não foi possível corrigir' },
  'workSession.alert.errorTitle': { es: 'Error', en: 'Error', pt: 'Erro' },
  'workSession.alert.deleteTitle': { es: '¿Eliminar sesión?', en: 'Delete session?', pt: 'Excluir sessão?' },
  'workSession.alert.deleteMsg': { es: 'La sesión y todos sus datos (intervals, formulario, puntos GPS) serán eliminados. Esta acción no se puede deshacer.', en: 'The session and all its data (intervals, form, GPS points) will be deleted. This action cannot be undone.', pt: 'A sessão e todos os seus dados (intervalos, formulário, pontos GPS) serão excluídos. Esta ação não pode ser desfeita.' },
  'workSession.alert.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'workSession.alert.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default workSession;
