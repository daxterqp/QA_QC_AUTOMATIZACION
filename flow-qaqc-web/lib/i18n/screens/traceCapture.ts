const traceCapture: Record<string, { es: string; en: string; pt: string }> = {
  'traceCapture.header': { es: 'Nueva sesión', en: 'New session', pt: 'Nova sessão' },

  'traceCapture.activeSessionTitle': { es: 'Hay una actividad en curso', en: 'There is an activity in progress', pt: 'Há uma atividade em andamento' },
  'traceCapture.activeSessionMessage': {
    es: 'Debes finalizar la actividad actual antes de registrar una nueva.',
    en: 'You must finish the current activity before registering a new one.',
    pt: 'Você deve finalizar a atividade atual antes de registrar uma nova.',
  },
  'traceCapture.activeSessionBack': { es: 'Volver', en: 'Back', pt: 'Voltar' },
  'traceCapture.activeSessionGo': { es: 'Ir a la actividad', en: 'Go to the activity', pt: 'Ir para a atividade' },

  'traceCapture.equipmentLabel': { es: 'Equipo', en: 'Equipment', pt: 'Equipamento' },
  'traceCapture.equipmentPlaceholder': { es: 'Selecciona maquinaria', en: 'Select machinery', pt: 'Selecione o maquinário' },
  'traceCapture.equipmentEmptyHint': {
    es: 'No hay maquinaria pesada cargada en este proyecto. Súbela desde el tab Equipos.',
    en: 'There is no heavy machinery loaded in this project. Upload it from the Equipment tab.',
    pt: 'Não há maquinário pesado carregado neste projeto. Carregue-o pela aba Equipamentos.',
  },

  'traceCapture.lockText': {
    es: 'Este equipo está siendo usado por otro técnico (iniciado el {date}). Avisa para coordinar.',
    en: 'This equipment is being used by another technician (started on {date}). Reach out to coordinate.',
    pt: 'Este equipamento está sendo usado por outro técnico (iniciado em {date}). Avise para coordenar.',
  },
  'traceCapture.takeover': { es: 'Tomar', en: 'Take over', pt: 'Assumir' },
  'traceCapture.selectFirstTitle': { es: 'Selecciona primero', en: 'Select first', pt: 'Selecione primeiro' },
  'traceCapture.selectFirstMessage': {
    es: 'Antes de tomar el equipo, elige la actividad y el sector.',
    en: 'Before taking over the equipment, choose the activity and the sector.',
    pt: 'Antes de assumir o equipamento, escolha a atividade e o setor.',
  },

  'traceCapture.activityLabel': { es: 'Actividad', en: 'Activity', pt: 'Atividade' },
  'traceCapture.activityPlaceholder': { es: 'Selecciona la actividad', en: 'Select the activity', pt: 'Selecione a atividade' },
  'traceCapture.activityEmptyHint': {
    es: 'Este equipo no tiene actividades asignadas. Configúralas en el Excel de Trazabilidad.',
    en: 'This equipment has no assigned activities. Configure them in the Traceability Excel.',
    pt: 'Este equipamento não tem atividades atribuídas. Configure-as no Excel de Rastreabilidade.',
  },

  'traceCapture.sectorLabel': { es: 'Sector / Campaña', en: 'Sector / Campaign', pt: 'Setor / Campanha' },
  'traceCapture.sectorPlaceholder': { es: 'Selecciona sector o campaña', en: 'Select sector or campaign', pt: 'Selecione setor ou campanha' },

  'traceCapture.templateInfo': {
    es: 'Esta actividad tiene un formulario inicial. Se rellenará en la pantalla de la sesión activa.',
    en: 'This activity has an initial form. It will be filled in on the active session screen.',
    pt: 'Esta atividade tem um formulário inicial. Ele será preenchido na tela da sessão ativa.',
  },

  'traceCapture.equipmentFallback': { es: 'el equipo', en: 'the equipment', pt: 'o equipamento' },

  'traceCapture.slideLabel': { es: 'Desliza para iniciar', en: 'Slide to start', pt: 'Deslize para iniciar' },
  'traceCapture.hintSelectEquipment': { es: 'Selecciona un equipo primero.', en: 'Select an equipment first.', pt: 'Selecione um equipamento primeiro.' },
  'traceCapture.hintSelectActivity': { es: 'Selecciona una actividad.', en: 'Select an activity.', pt: 'Selecione uma atividade.' },
  'traceCapture.hintSelectSector': { es: 'Selecciona un sector / campaña.', en: 'Select a sector / campaign.', pt: 'Selecione um setor / campanha.' },
  'traceCapture.hintLocked': { es: 'Equipo bloqueado por otra sesión activa.', en: 'Equipment locked by another active session.', pt: 'Equipamento bloqueado por outra sessão ativa.' },

  'traceCapture.toastActivityInvalid': {
    es: 'La actividad ya no es valida para este equipo',
    en: 'The activity is no longer valid for this equipment',
    pt: 'A atividade não é mais válida para este equipamento',
  },
  'traceCapture.toastSessionStarted': { es: 'Sesión iniciada', en: 'Session started', pt: 'Sessão iniciada' },
  'traceCapture.toastCouldNotStart': { es: 'No se pudo iniciar', en: 'Could not start', pt: 'Não foi possível iniciar' },
};

export default traceCapture;
