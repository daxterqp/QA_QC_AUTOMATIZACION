/**
 * i18n (v46) — Cadenas de la pantalla PhoneContactsScreen (namespace `contacts`).
 * Record<clave, { es, en, pt }>. Se agrega al barril en `./index.ts`.
 */
const contacts: Record<string, { es: string; en: string; pt: string }> = {
  'contacts.title': { es: 'Contactos', en: 'Contacts', pt: 'Contatos' },

  // Hint listado
  'contacts.hint': {
    es: 'Toca {icon} para importar desde Excel · Columnas: Nombre | Rol | Prefijo | Teléfono',
    en: 'Tap {icon} to import from Excel · Columns: Name | Role | Prefix | Phone',
    pt: 'Toque {icon} para importar do Excel · Colunas: Nome | Função | Prefixo | Telefone',
  },

  // Estado vacío
  'contacts.empty.title': { es: 'Sin contactos aún.', en: 'No contacts yet.', pt: 'Nenhum contato ainda.' },
  'contacts.empty.addHint': {
    es: 'Toca + para agregar manualmente',
    en: 'Tap + to add manually',
    pt: 'Toque + para adicionar manualmente',
  },
  'contacts.empty.importHint': {
    es: 'o 📄 para importar desde Excel.',
    en: 'or 📄 to import from Excel.',
    pt: 'ou 📄 para importar do Excel.',
  },
  'contacts.empty.excelFormat': {
    es: 'Formato Excel:\nCol A: Nombre y Apellido\nCol B: Rol / Cargo\nCol C: Prefijo (ej: +51)\nCol D: Número de celular',
    en: 'Excel format:\nCol A: First and last name\nCol B: Role / Position\nCol C: Prefix (e.g.: +51)\nCol D: Mobile number',
    pt: 'Formato Excel:\nCol A: Nome e sobrenome\nCol B: Função / Cargo\nCol C: Prefixo (ex.: +51)\nCol D: Número de celular',
  },

  // Modal
  'contacts.modal.editTitle': { es: 'Editar contacto', en: 'Edit contact', pt: 'Editar contato' },
  'contacts.modal.newTitle': { es: 'Nuevo contacto', en: 'New contact', pt: 'Novo contato' },
  'contacts.field.name': { es: 'Nombre *', en: 'Name *', pt: 'Nome *' },
  'contacts.field.namePlaceholder': { es: 'Ej: Juan Pérez', en: 'E.g.: John Smith', pt: 'Ex.: João Silva' },
  'contacts.field.phone': { es: 'Teléfono * (con prefijo)', en: 'Phone * (with prefix)', pt: 'Telefone * (com prefixo)' },
  'contacts.field.phonePlaceholder': { es: '+51 9 XXXX XXXX', en: '+51 9 XXXX XXXX', pt: '+51 9 XXXX XXXX' },
  'contacts.field.role': { es: 'Cargo / Rol', en: 'Position / Role', pt: 'Cargo / Função' },
  'contacts.field.rolePlaceholder': { es: 'Ej: Jefe de Obra', en: 'E.g.: Site Manager', pt: 'Ex.: Chefe de Obra' },

  // Botones modal
  'contacts.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'contacts.saving': { es: 'Guardando…', en: 'Saving…', pt: 'Salvando…' },
  'contacts.save': { es: 'Guardar', en: 'Save', pt: 'Salvar' },

  // Eliminar contacto (Alert)
  'contacts.delete.title': { es: 'Eliminar contacto', en: 'Delete contact', pt: 'Excluir contato' },
  'contacts.delete.message': { es: '¿Eliminar a {name}?', en: 'Delete {name}?', pt: 'Excluir {name}?' },
  'contacts.delete.confirm': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },

  // Llamar (Alert)
  'contacts.error': { es: 'Error', en: 'Error', pt: 'Erro' },
  'contacts.call.error': {
    es: 'No se puede abrir el marcador en este dispositivo.',
    en: 'The dialer cannot be opened on this device.',
    pt: 'Não é possível abrir o discador neste dispositivo.',
  },

  // Importación Excel (Alert)
  'contacts.import.noDataTitle': { es: 'Sin datos', en: 'No data', pt: 'Sem dados' },
  'contacts.import.noDataMessage': {
    es: 'El archivo no contiene filas válidas.',
    en: 'The file does not contain valid rows.',
    pt: 'O arquivo não contém linhas válidas.',
  },
  'contacts.import.doneTitle': { es: 'Importación completada', en: 'Import completed', pt: 'Importação concluída' },
  'contacts.import.doneOne': {
    es: '{imported} contacto importado.',
    en: '{imported} contact imported.',
    pt: '{imported} contato importado.',
  },
  'contacts.import.doneMany': {
    es: '{imported} contactos importados.',
    en: '{imported} contacts imported.',
    pt: '{imported} contatos importados.',
  },
  'contacts.import.skippedOne': {
    es: ' ({skipped} fila omitida por datos incompletos)',
    en: ' ({skipped} row skipped due to incomplete data)',
    pt: ' ({skipped} linha ignorada por dados incompletos)',
  },
  'contacts.import.skippedMany': {
    es: ' ({skipped} filas omitidas por datos incompletos)',
    en: ' ({skipped} rows skipped due to incomplete data)',
    pt: ' ({skipped} linhas ignoradas por dados incompletos)',
  },
  'contacts.import.error': {
    es: 'No se pudo importar el archivo.\n{error}',
    en: 'The file could not be imported.\n{error}',
    pt: 'Não foi possível importar o arquivo.\n{error}',
  },
};

export default contacts;
