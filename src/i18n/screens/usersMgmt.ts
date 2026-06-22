/**
 * i18n (v46) — Cadenas de la pantalla UserManagementScreen (namespace `usersMgmt`).
 * Record<clave, { es, en, pt }>. Se agrega al barril en `./index.ts`.
 */
const usersMgmt: Record<string, { es: string; en: string; pt: string }> = {
  // Header
  'usersMgmt.title': { es: 'Usuarios', en: 'Users', pt: 'Usuários' },

  // Roles (etiquetas mostradas)
  'usersMgmt.role.creator': { es: 'Creador', en: 'Creator', pt: 'Criador' },
  'usersMgmt.role.resident': { es: 'Jefe', en: 'Manager', pt: 'Chefe' },
  'usersMgmt.role.supervisor': { es: 'Supervisor', en: 'Supervisor', pt: 'Supervisor' },
  'usersMgmt.role.operator': { es: 'Técnico', en: 'Technician', pt: 'Técnico' },

  // Barra superior (acciones del Creador)
  'usersMgmt.addUser': { es: 'Añadir usuario', en: 'Add user', pt: 'Adicionar usuário' },
  'usersMgmt.importFromExcel': { es: 'Importar desde Excel', en: 'Import from Excel', pt: 'Importar do Excel' },
  'usersMgmt.importHint': {
    es: 'Columnas del Excel: Nombre · Apellido · Rol · Proyectos',
    en: 'Excel columns: First name · Last name · Role · Projects',
    pt: 'Colunas do Excel: Nome · Sobrenome · Função · Projetos',
  },
  'usersMgmt.enterProject': { es: 'Ingresar a proyecto', en: 'Add to project', pt: 'Adicionar ao projeto' },
  'usersMgmt.removeAccess': { es: 'Quitar accesos', en: 'Remove access', pt: 'Remover acessos' },

  // Listado
  'usersMgmt.empty': { es: 'No hay usuarios registrados.', en: 'No registered users.', pt: 'Nenhum usuário registrado.' },
  'usersMgmt.you': { es: 'Usted', en: 'You', pt: 'Você' },
  'usersMgmt.inactive': { es: 'Inactivo', en: 'Inactive', pt: 'Inativo' },
  'usersMgmt.reset': { es: 'Reset', en: 'Reset', pt: 'Redefinir' },
  'usersMgmt.reactivate': { es: 'Reactivar', en: 'Reactivate', pt: 'Reativar' },
  'usersMgmt.deactivate': { es: 'Desactivar', en: 'Deactivate', pt: 'Desativar' },
  'usersMgmt.allProjects': { es: 'Todos los proyectos (Creador)', en: 'All projects (Creator)', pt: 'Todos os projetos (Criador)' },
  'usersMgmt.noProjectsAssigned': { es: 'Sin proyectos asignados', en: 'No projects assigned', pt: 'Nenhum projeto atribuído' },

  // Modal: alta manual
  'usersMgmt.addModal.title': { es: 'Agregar usuario', en: 'Add user', pt: 'Adicionar usuário' },
  'usersMgmt.field.name': { es: 'Nombre', en: 'First name', pt: 'Nome' },
  'usersMgmt.field.lastName': { es: 'Apellido', en: 'Last name', pt: 'Sobrenome' },
  'usersMgmt.field.role': { es: 'Rol', en: 'Role', pt: 'Função' },
  // v47 (RLS) — el alta ahora exige email + contraseña (login por email).
  'usersMgmt.field.email': { es: 'Correo electrónico', en: 'Email', pt: 'E-mail' },
  'usersMgmt.field.password': { es: 'Contraseña', en: 'Password', pt: 'Senha' },
  'usersMgmt.addModal.passwordHint': {
    es: 'El usuario iniciará sesión con su correo y esta contraseña. Podrá cambiarla luego.',
    en: 'The user will log in with their email and this password. They can change it later.',
    pt: 'O usuário fará login com o e-mail e esta senha. Poderá alterá-la depois.',
  },
  'usersMgmt.alert.missingEmailTitle': { es: 'Falta el correo', en: 'Missing email', pt: 'E-mail ausente' },
  'usersMgmt.alert.missingEmailMessage': { es: 'Ingresa un correo y una contraseña.', en: 'Enter an email and a password.', pt: 'Informe um e-mail e uma senha.' },
  'usersMgmt.creating': { es: 'Creando…', en: 'Creating…', pt: 'Criando…' },
  'usersMgmt.createUser': { es: 'Crear usuario', en: 'Create user', pt: 'Criar usuário' },

  // Modal: editar rol
  'usersMgmt.roleModal.title': { es: 'Rol de {name}', en: 'Role of {name}', pt: 'Função de {name}' },

  // Modal: ingresar usuarios a proyecto
  'usersMgmt.assignModal.title': { es: 'Ingresar usuarios a proyecto', en: 'Add users to project', pt: 'Adicionar usuários ao projeto' },
  'usersMgmt.assignModal.usersLabel': { es: 'Usuarios ({count})', en: 'Users ({count})', pt: 'Usuários ({count})' },
  'usersMgmt.assignModal.projectsLabel': { es: 'Proyectos ({count})', en: 'Projects ({count})', pt: 'Projetos ({count})' },
  'usersMgmt.assigning': { es: 'Asignando…', en: 'Assigning…', pt: 'Atribuindo…' },
  'usersMgmt.assignAccess': {
    es: 'Asignar acceso ({users}×{projects})',
    en: 'Grant access ({users}×{projects})',
    pt: 'Conceder acesso ({users}×{projects})',
  },

  // Modal: quitar accesos
  'usersMgmt.removeModal.title': { es: 'Quitar accesos', en: 'Remove access', pt: 'Remover acessos' },
  'usersMgmt.removeModal.projectLabel': { es: 'Proyecto (uno)', en: 'Project (one)', pt: 'Projeto (um)' },
  'usersMgmt.removeModal.usersLabel': { es: 'Usuarios a desvincular ({count})', en: 'Users to unlink ({count})', pt: 'Usuários a desvincular ({count})' },
  'usersMgmt.removeModal.noAccess': { es: 'Nadie tiene acceso a este proyecto.', en: 'No one has access to this project.', pt: 'Ninguém tem acesso a este projeto.' },
  'usersMgmt.removeModal.pickProjectFirst': { es: 'Elige un proyecto primero.', en: 'Choose a project first.', pt: 'Escolha um projeto primeiro.' },
  'usersMgmt.removing': { es: 'Quitando…', en: 'Removing…', pt: 'Removendo…' },

  // Alerts comunes
  'usersMgmt.alert.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'usersMgmt.alert.done': { es: 'Listo', en: 'Done', pt: 'Concluído' },
  'usersMgmt.alert.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },

  // Alerts: asignar accesos
  'usersMgmt.alert.selectTitle': { es: 'Selecciona', en: 'Select', pt: 'Selecione' },
  'usersMgmt.alert.selectUserProject': {
    es: 'Elige al menos un usuario y un proyecto.',
    en: 'Choose at least one user and one project.',
    pt: 'Escolha ao menos um usuário e um projeto.',
  },
  'usersMgmt.alert.grantedSome': { es: '{count} acceso(s) otorgado(s).', en: '{count} access(es) granted.', pt: '{count} acesso(s) concedido(s).' },
  'usersMgmt.alert.grantedNone': {
    es: 'Los usuarios ya tenían esos accesos.',
    en: 'The users already had those access rights.',
    pt: 'Os usuários já tinham esses acessos.',
  },
  'usersMgmt.alert.grantFailed': { es: 'No se pudo asignar.', en: 'Could not grant access.', pt: 'Não foi possível atribuir.' },

  // Alerts: quitar accesos
  'usersMgmt.alert.selectProjectUser': {
    es: 'Elige un proyecto y al menos un usuario.',
    en: 'Choose a project and at least one user.',
    pt: 'Escolha um projeto e ao menos um usuário.',
  },
  'usersMgmt.alert.theProject': { es: 'el proyecto', en: 'the project', pt: 'o projeto' },
  'usersMgmt.alert.removeAccessTitle': { es: 'Quitar accesos', en: 'Remove access', pt: 'Remover acessos' },
  'usersMgmt.alert.removeAccessMessage': {
    es: '¿Quitar el acceso de {count} usuario(s) a "{project}"?',
    en: 'Remove access for {count} user(s) to "{project}"?',
    pt: 'Remover o acesso de {count} usuário(s) a "{project}"?',
  },
  'usersMgmt.alert.remove': { es: 'Quitar', en: 'Remove', pt: 'Remover' },
  'usersMgmt.alert.accessRevoked': { es: 'Accesos revocados.', en: 'Access revoked.', pt: 'Acessos revogados.' },
  'usersMgmt.alert.removeFailed': { es: 'No se pudo quitar.', en: 'Could not remove.', pt: 'Não foi possível remover.' },

  // Alerts: importación
  'usersMgmt.alert.offlineTitle': { es: 'Sin conexión', en: 'No connection', pt: 'Sem conexão' },
  'usersMgmt.alert.offlineImport': {
    es: 'Importar usuarios requiere conexión a internet.',
    en: 'Importing users requires an internet connection.',
    pt: 'Importar usuários requer conexão com a internet.',
  },
  'usersMgmt.alert.usersProcessed': { es: '{count} usuarios procesados.', en: '{count} users processed.', pt: '{count} usuários processados.' },
  'usersMgmt.alert.projectAccessSynced': {
    es: '\nAccesos a proyectos sincronizados.',
    en: '\nProject access synchronized.',
    pt: '\nAcessos a projetos sincronizados.',
  },
  'usersMgmt.alert.unmatchedProjects': {
    es: '\n\n⚠ Proyectos no encontrados (omitidos): {projects}',
    en: '\n\n⚠ Projects not found (skipped): {projects}',
    pt: '\n\n⚠ Projetos não encontrados (ignorados): {projects}',
  },
  'usersMgmt.alert.importDoneTitle': { es: 'Importación completada', en: 'Import completed', pt: 'Importação concluída' },
  'usersMgmt.alert.importErrors': {
    es: '\n\n⚠ {count} fila(s) con error:\n{details}',
    en: '\n\n⚠ {count} row(s) with errors:\n{details}',
    pt: '\n\n⚠ {count} linha(s) com erro:\n{details}',
  },
  'usersMgmt.alert.importUnexpected': {
    es: 'Error inesperado al importar.',
    en: 'Unexpected error while importing.',
    pt: 'Erro inesperado ao importar.',
  },

  // Alerts: alta manual
  'usersMgmt.alert.missingNameTitle': { es: 'Falta el nombre', en: 'Missing name', pt: 'Nome ausente' },
  'usersMgmt.alert.missingNameMessage': { es: 'Ingresa el nombre del usuario.', en: "Enter the user's name.", pt: 'Informe o nome do usuário.' },
  'usersMgmt.alert.userCreatedTitle': { es: 'Usuario creado', en: 'User created', pt: 'Usuário criado' },
  'usersMgmt.alert.userCreatedMessage': {
    es: '{name} agregado. Iniciará sesión con el correo y la contraseña que ingresaste.',
    en: '{name} added. They will log in with the email and password you entered.',
    pt: '{name} adicionado. Fará login com o e-mail e a senha que você informou.',
  },
  'usersMgmt.alert.createUserFailed': { es: 'No se pudo crear el usuario.', en: 'Could not create the user.', pt: 'Não foi possível criar o usuário.' },

  // Alerts: activar / desactivar
  'usersMgmt.alert.notAllowedTitle': { es: 'No permitido', en: 'Not allowed', pt: 'Não permitido' },
  'usersMgmt.alert.cannotDeactivateSelf': {
    es: 'No puedes desactivar tu propio usuario.',
    en: 'You cannot deactivate your own user.',
    pt: 'Você não pode desativar seu próprio usuário.',
  },
  'usersMgmt.alert.deactivateTitle': { es: 'Desactivar usuario', en: 'Deactivate user', pt: 'Desativar usuário' },
  'usersMgmt.alert.reactivateTitle': { es: 'Reactivar usuario', en: 'Reactivate user', pt: 'Reativar usuário' },
  'usersMgmt.alert.deactivateMessage': {
    es: '{name} perderá el acceso, pero sus firmas y aprobaciones se conservan intactas.',
    en: '{name} will lose access, but their signatures and approvals are kept intact.',
    pt: '{name} perderá o acesso, mas suas assinaturas e aprovações permanecem intactas.',
  },
  'usersMgmt.alert.reactivateMessage': {
    es: '{name} podrá volver a iniciar sesión.',
    en: '{name} will be able to log in again.',
    pt: '{name} poderá fazer login novamente.',
  },

  // Alerts: resetear contraseña
  'usersMgmt.alert.resetPasswordTitle': { es: 'Resetear contraseña', en: 'Reset password', pt: 'Redefinir senha' },
  'usersMgmt.alert.resetPasswordMessage': {
    es: 'La contraseña de {name} volverá a ser su nombre. Podrá cambiarla luego.',
    en: "{name}'s password will revert to their first name. They can change it later.",
    pt: 'A senha de {name} voltará a ser o nome. Poderá alterá-la depois.',
  },
  'usersMgmt.alert.resetConfirm': { es: 'Resetear', en: 'Reset', pt: 'Redefinir' },
  'usersMgmt.alert.passwordReset': { es: 'Contraseña reseteada.', en: 'Password reset.', pt: 'Senha redefinida.' },

  // v47 (RLS) — operaciones vía Edge Function admin-users
  'usersMgmt.alert.opFailed': {
    es: 'No se pudo completar la operación.',
    en: 'Could not complete the operation.',
    pt: 'Não foi possível concluir a operação.',
  },
};

export default usersMgmt;
