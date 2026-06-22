/**
 * i18n (web, v46.1) — Cadenas EXCLUSIVAS de la web (no existen en el móvil).
 * Se mantienen APARTE del catálogo espejo (strings/strings.extra/screens) para no
 * divergir de la app móvil. Se fusionan en `index.tsx` (ALL_STRINGS).
 * Namespace `webLayout.*` para el shell (barra lateral, modales crear/unir).
 */
export const STRINGS_WEB: Record<string, { es: string; en: string; pt: string }> = {
  // ── Barra lateral / navegación ──
  'webLayout.navProjects': { es: 'Proyectos', en: 'Projects', pt: 'Projetos' },
  'webLayout.navDashboard': { es: 'Dashboard', en: 'Dashboard', pt: 'Painel' },
  'webLayout.navUsers': { es: 'Usuarios', en: 'Users', pt: 'Usuários' },
  'webLayout.newProject': { es: 'Nuevo proyecto', en: 'New project', pt: 'Novo projeto' },
  'webLayout.joinProject': { es: 'Unirse a proyecto', en: 'Join project', pt: 'Entrar no projeto' },
  'webLayout.signOut': { es: 'Cerrar sesión', en: 'Sign out', pt: 'Sair' },

  // ── Modal: Nuevo proyecto ──
  'webLayout.newProjectTitle': { es: 'Nuevo Proyecto', en: 'New Project', pt: 'Novo Projeto' },
  'webLayout.projectNameLabel': { es: 'Nombre del proyecto *', en: 'Project name *', pt: 'Nome do projeto *' },
  'webLayout.projectNamePlaceholder': { es: 'Ej: Edificio Torre Norte', en: 'E.g.: North Tower Building', pt: 'Ex.: Edifício Torre Norte' },
  'webLayout.projectPasswordLabel': { es: 'Contraseña del proyecto *', en: 'Project password *', pt: 'Senha do projeto *' },
  'webLayout.projectPasswordPlaceholder': { es: 'Contraseña para unirse', en: 'Password to join', pt: 'Senha para entrar' },
  'webLayout.create': { es: 'Crear', en: 'Create', pt: 'Criar' },

  // ── Modal: Unirse a proyecto ──
  'webLayout.joinProjectTitle': { es: 'Unirse a Proyecto', en: 'Join Project', pt: 'Entrar no Projeto' },
  'webLayout.joinNameLabel': { es: 'Nombre del proyecto', en: 'Project name', pt: 'Nome do projeto' },
  'webLayout.joinNamePlaceholder': { es: 'Nombre exacto del proyecto', en: 'Exact project name', pt: 'Nome exato do projeto' },
  'webLayout.passwordLabel': { es: 'Contraseña', en: 'Password', pt: 'Senha' },
  'webLayout.joinPasswordPlaceholder': { es: 'Contraseña del proyecto', en: 'Project password', pt: 'Senha do projeto' },
  'webLayout.join': { es: 'Unirse', en: 'Join', pt: 'Entrar' },
  'webLayout.joinError': { es: 'Error al unirse', en: 'Error joining', pt: 'Erro ao entrar' },

  // ── Avisos ──
  'webLayout.duplicateProject': {
    es: 'Ya existe un proyecto con ese nombre. Usa un nombre diferente.',
    en: 'A project with that name already exists. Use a different name.',
    pt: 'Já existe um projeto com esse nome. Use um nome diferente.',
  },
  'webLayout.configModulesTitle': { es: 'Configurar módulos: {name}', en: 'Configure modules: {name}', pt: 'Configurar módulos: {name}' },
  'webLayout.createProjectConfirm': { es: 'Crear proyecto', en: 'Create project', pt: 'Criar projeto' },

  // ── Prioridad de observaciones (componente PriorityChip, web) ──
  'priority.low': { es: 'Baja', en: 'Low', pt: 'Baixa' },
  'priority.medium': { es: 'Media', en: 'Medium', pt: 'Média' },
  'priority.high': { es: 'Alta', en: 'High', pt: 'Alta' },
  'priority.none': { es: 'Sin prioridad', en: 'No priority', pt: 'Sem prioridade' },
  'priority.remove': { es: 'Quitar prioridad', en: 'Remove priority', pt: 'Remover prioridade' },
  'priority.modalTitle': { es: 'Prioridad de la observación', en: 'Observation priority', pt: 'Prioridade da observação' },
  'priority.modalSubtitle': { es: 'Selecciona el nivel de urgencia', en: 'Select the urgency level', pt: 'Selecione o nível de urgência' },
};
