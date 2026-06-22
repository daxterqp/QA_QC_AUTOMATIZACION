const alerts: Record<string, { es: string; en: string; pt: string }> = {
  // ─── Genéricos ───────────────────────────────────────────────────────────
  'alerts.error': {
    es: 'Error',
    en: 'Error',
    pt: 'Erro',
  },
  'alerts.cancel': {
    es: 'Cancelar',
    en: 'Cancel',
    pt: 'Cancelar',
  },

  // ─── ProjectListScreen — crear proyecto ────────────────────────────────────
  'alerts.duplicateNameTitle': {
    es: 'Nombre duplicado',
    en: 'Duplicate name',
    pt: 'Nome duplicado',
  },
  'alerts.duplicateNameMsg': {
    es: 'Ya existe un proyecto con ese nombre. Usa un nombre diferente.',
    en: 'A project with that name already exists. Use a different name.',
    pt: 'Já existe um projeto com esse nome. Use um nome diferente.',
  },
  'alerts.syncProjectErrorTitle': {
    es: 'Error al sincronizar proyecto',
    en: 'Error syncing project',
    pt: 'Erro ao sincronizar projeto',
  },
  'alerts.networkErrorTitle': {
    es: 'Error de red',
    en: 'Network error',
    pt: 'Erro de rede',
  },
  'alerts.networkSyncProjectMsg': {
    es: 'No se pudo sincronizar el proyecto: {message}',
    en: 'The project could not be synced: {message}',
    pt: 'Não foi possível sincronizar o projeto: {message}',
  },

  // ─── ProjectListScreen — eliminar de vista ─────────────────────────────────
  'alerts.deleteProjectTitle': {
    es: 'Eliminar proyecto',
    en: 'Delete project',
    pt: 'Excluir projeto',
  },
  'alerts.deleteProjectMsg': {
    es: 'Se eliminará el proyecto de tu lista.',
    en: 'The project will be removed from your list.',
    pt: 'O projeto será removido da sua lista.',
  },
  'alerts.delete': {
    es: 'Eliminar',
    en: 'Delete',
    pt: 'Excluir',
  },

  // ─── ProjectListScreen — ingresar a proyecto ───────────────────────────────
  'alerts.projectNotFoundTitle': {
    es: 'Proyecto no encontrado',
    en: 'Project not found',
    pt: 'Projeto não encontrado',
  },
  'alerts.projectNotFoundMsg': {
    es: 'No existe un proyecto con ese nombre.',
    en: 'There is no project with that name.',
    pt: 'Não existe um projeto com esse nome.',
  },
  'alerts.wrongPasswordTitle': {
    es: 'Contraseña incorrecta',
    en: 'Incorrect password',
    pt: 'Senha incorreta',
  },
  'alerts.wrongPasswordMsg': {
    es: 'La contraseña del proyecto no es correcta.',
    en: 'The project password is not correct.',
    pt: 'A senha do projeto não está correta.',
  },
  'alerts.downloadProjectFailedMsg': {
    es: 'No se pudo descargar el proyecto. Desliza la lista hacia abajo para sincronizar e intenta de nuevo.',
    en: 'The project could not be downloaded. Pull the list down to sync and try again.',
    pt: 'Não foi possível baixar o projeto. Arraste a lista para baixo para sincronizar e tente novamente.',
  },
  'alerts.projectRestoredTitle': {
    es: 'Proyecto restaurado',
    en: 'Project restored',
    pt: 'Projeto restaurado',
  },
  'alerts.projectRestoredMsg': {
    es: '"{name}" vuelve a aparecer en tu lista.',
    en: '"{name}" is back in your list.',
    pt: '"{name}" voltou a aparecer na sua lista.',
  },
  'alerts.alreadyHasAccessTitle': {
    es: 'Ya tienes acceso',
    en: 'You already have access',
    pt: 'Você já tem acesso',
  },
  'alerts.alreadyHasAccessMsg': {
    es: 'Este proyecto ya está en tu lista.',
    en: 'This project is already in your list.',
    pt: 'Este projeto já está na sua lista.',
  },
  'alerts.accessGrantedTitle': {
    es: 'Acceso concedido',
    en: 'Access granted',
    pt: 'Acesso concedido',
  },
  'alerts.accessGrantedFromCloudMsg': {
    es: 'El proyecto "{name}" fue descargado desde la nube y ya aparece en tu lista.',
    en: 'The project "{name}" was downloaded from the cloud and now appears in your list.',
    pt: 'O projeto "{name}" foi baixado da nuvem e já aparece na sua lista.',
  },
  'alerts.accessGrantedLocalMsg': {
    es: 'El proyecto "{name}" ya aparece en tu lista.',
    en: 'The project "{name}" now appears in your list.',
    pt: 'O projeto "{name}" já aparece na sua lista.',
  },
  'alerts.joinProjectErrorMsg': {
    es: 'Ocurrió un error al ingresar al proyecto.\n\n{message}',
    en: 'An error occurred while joining the project.\n\n{message}',
    pt: 'Ocorreu um erro ao entrar no projeto.\n\n{message}',
  },

  // ─── ProjectListScreen — sesión / restricciones ────────────────────────────
  'alerts.logoutTitle': {
    es: 'Cerrar sesión',
    en: 'Log out',
    pt: 'Sair',
  },
  'alerts.logoutMsg': {
    es: '¿Desea salir del sistema?',
    en: 'Do you want to log out of the system?',
    pt: 'Deseja sair do sistema?',
  },
  'alerts.logoutConfirm': {
    es: 'Salir',
    en: 'Log out',
    pt: 'Sair',
  },
  'alerts.demoUnavailableTitle': {
    es: 'Opción no disponible en demo',
    en: 'Option not available in demo',
    pt: 'Opção não disponível na demonstração',
  },
  'alerts.demoUnavailableMsg': {
    es: 'Esta función no está habilitada en el modo de demostración.',
    en: 'This feature is not enabled in demo mode.',
    pt: 'Este recurso não está habilitado no modo de demonstração.',
  },
  'alerts.restrictedAccessTitle': {
    es: 'Acceso restringido',
    en: 'Restricted access',
    pt: 'Acesso restrito',
  },
  'alerts.restrictedAccessMsg': {
    es: 'Para crear un nuevo proyecto comuníquese con el administrador.',
    en: 'To create a new project, contact the administrator.',
    pt: 'Para criar um novo projeto, entre em contato com o administrador.',
  },

  // ─── useExcelImport ────────────────────────────────────────────────────────
  'alerts.groupingsTitle': {
    es: 'Agrupamientos',
    en: 'Groupings',
    pt: 'Agrupamentos',
  },
  'alerts.groupingsSeededMsg': {
    es: 'Se sembraron/actualizaron {count} agrupamiento(s) desde la hoja AGRUPACIONES.',
    en: '{count} grouping(s) were seeded/updated from the AGRUPACIONES sheet.',
    pt: '{count} agrupamento(s) foram semeados/atualizados a partir da planilha AGRUPACIONES.',
  },
  'alerts.s3ErrorTitle': {
    es: 'Error S3',
    en: 'S3 Error',
    pt: 'Erro S3',
  },
  'alerts.excelImportUnexpectedError': {
    es: 'Error inesperado al importar el archivo.',
    en: 'Unexpected error while importing the file.',
    pt: 'Erro inesperado ao importar o arquivo.',
  },

  // ─── useLocationsImport ────────────────────────────────────────────────────
  'alerts.locationsImportUnexpectedError': {
    es: 'Error inesperado al importar ubicaciones.',
    en: 'Unexpected error while importing locations.',
    pt: 'Erro inesperado ao importar localizações.',
  },

  // ─── useGpsCapture ─────────────────────────────────────────────────────────
  'alerts.locationPermissionRequiredTitle': {
    es: 'Permiso de ubicación requerido',
    en: 'Location permission required',
    pt: 'Permissão de localização necessária',
  },
  'alerts.locationPermissionRequiredMsg': {
    es: 'Habilita la ubicación para este app en Ajustes del sistema → Permisos → Ubicación. (Android ya no permite mostrar el recuadro dentro de la app una vez denegado.)',
    en: 'Enable location for this app in System Settings → Permissions → Location. (Android no longer allows showing the in-app prompt once it has been denied.)',
    pt: 'Habilite a localização para este app nas Configurações do sistema → Permissões → Localização. (O Android não permite mais exibir a caixa dentro do app depois de negada.)',
  },
  'alerts.goToSettings': {
    es: 'Ir a Ajustes',
    en: 'Go to Settings',
    pt: 'Ir para Configurações',
  },
  'alerts.locationPermissionDenied': {
    es: 'Permiso de ubicación denegado',
    en: 'Location permission denied',
    pt: 'Permissão de localização negada',
  },
  'alerts.gpsDisabledError': {
    es: 'GPS desactivado — actívalo en el sistema',
    en: 'GPS disabled — turn it on in the system',
    pt: 'GPS desativado — ative-o no sistema',
  },
  'alerts.gpsDisabledTitle': {
    es: 'GPS desactivado',
    en: 'GPS disabled',
    pt: 'GPS desativado',
  },
  'alerts.gpsDisabledMsg': {
    es: 'Activa la ubicación del dispositivo y vuelve a intentar.',
    en: 'Turn on the device location and try again.',
    pt: 'Ative a localização do dispositivo e tente novamente.',
  },
  'alerts.gpsTimeoutError': {
    es: 'Timeout esperando fix GPS (45s) — verifica que el cielo esté despejado y reintenta.',
    en: 'Timeout waiting for GPS fix (45s) — make sure the sky is clear and try again.',
    pt: 'Tempo esgotado aguardando o fix do GPS (45s) — verifique se o céu está limpo e tente novamente.',
  },

  // ─── VolumeCalculatorModal ─────────────────────────────────────────────────
  'alerts.incompleteDataTitle': {
    es: 'Datos incompletos',
    en: 'Incomplete data',
    pt: 'Dados incompletos',
  },
  'alerts.enterValidHeightMsg': {
    es: 'Ingresa una altura válida.',
    en: 'Enter a valid height.',
    pt: 'Insira uma altura válida.',
  },
  'alerts.noAreaTitle': {
    es: 'Sin área',
    en: 'No area',
    pt: 'Sem área',
  },
  'alerts.noAreaMsg': {
    es: 'El trazo no define un área válida. Cierra o traza más puntos.',
    en: 'The trace does not define a valid area. Close it or add more points.',
    pt: 'O traçado não define uma área válida. Feche-o ou adicione mais pontos.',
  },
};

export default alerts;
