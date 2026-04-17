const { contextBridge, ipcRenderer } = require('electron');

/**
 * electronAPI — disponible en window.electronAPI dentro de la app web.
 * Expone operaciones de filesystem del PC al renderer mediante IPC.
 *
 * Estructura local de archivos:
 *   D:\Flow-QAQC\{proyecto}\plans\{nombre}.pdf
 *   D:\Flow-QAQC\{proyecto}\plansdwg\{nombre}.dwg
 *
 * La s3_key de Supabase tiene el formato:
 *   "projects/{proyecto}/plans/{nombre}.pdf"
 *   "projects/{proyecto}/plansdwg/{nombre}.dwg"
 *
 * La API mapea automáticamente s3Key → ruta local.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /** Indica que la app corre en Electron (no en browser) */
  isElectron: true,

  /**
   * Verifica si un archivo ya existe en la ruta local.
   * @param {string} s3Key — ej: "projects/obra/plans/plano-1.pdf"
   * @returns {Promise<string|null>} ruta local completa o null si no existe
   */
  checkLocalFile: (s3Key) => ipcRenderer.invoke('check-local-file', s3Key),

  /**
   * Guarda un archivo (ArrayBuffer) en la ruta local correspondiente.
   * Crea carpetas automáticamente si no existen.
   * @param {string} s3Key
   * @param {ArrayBuffer} buffer
   * @returns {Promise<string>} ruta local donde se guardó
   */
  saveLocalFile: (s3Key, buffer) => ipcRenderer.invoke('save-local-file', s3Key, buffer),

  /**
   * Devuelve la ruta local de un s3Key sin verificar existencia.
   * @param {string} s3Key
   * @returns {Promise<string>}
   */
  getLocalPath: (s3Key) => ipcRenderer.invoke('get-local-path', s3Key),

  /**
   * Devuelve el directorio raíz D:\Flow-QAQC
   * @returns {Promise<string>}
   */
  getLocalBase: () => ipcRenderer.invoke('get-local-base'),

  /**
   * Abre la carpeta del archivo en el Explorador de Windows.
   * @param {string} s3Key
   */
  openLocalFolder: (s3Key) => ipcRenderer.invoke('open-local-folder', s3Key),

  /**
   * Elimina un archivo local.
   * @param {string} s3Key
   */
  deleteLocalFile: (s3Key) => ipcRenderer.invoke('delete-local-file', s3Key),

  /**
   * Lista archivos en una carpeta local.
   * @param {string} s3Prefix — ej: "projects/obra/plans"
   * @returns {Promise<Array<{name: string, filePath: string, sizeBytes: number}>>}
   */
  listLocalFiles: (s3Prefix) => ipcRenderer.invoke('list-local-files', s3Prefix),

  /**
   * Genera un PDF desde HTML y muestra diálogo "Guardar como".
   * @param {string} html — HTML completo del documento
   * @param {string} filename — nombre sugerido (ej: "DOSSIER-Proyecto-2026-04-05.pdf")
   * @returns {Promise<string|null>} ruta donde se guardó, o null si canceló
   */
  printToPdf: (html, filename) => ipcRenderer.invoke('print-to-pdf', html, filename),

  /**
   * Genera un PDF y lo abre con la app del SO para compartir (correo, WhatsApp, etc.).
   * @param {string} html — HTML completo del documento
   * @param {string} filename — nombre del archivo
   * @returns {Promise<string>} ruta temporal del PDF
   */
  sharePdf: (html, filename) => ipcRenderer.invoke('share-pdf', html, filename),

  /**
   * Abre el HTML en el navegador del sistema como archivo temporal.
   * @param {string} html — HTML completo del documento
   * @param {string} filename — nombre base del archivo
   * @returns {Promise<string>} ruta temporal del HTML
   */
  openHtmlInBrowser: (html, filename) => ipcRenderer.invoke('open-html-in-browser', html, filename),
});
