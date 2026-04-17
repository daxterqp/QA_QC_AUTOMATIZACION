/**
 * Tipos para window.electronAPI — disponible cuando la app corre en Electron.
 * Definido en flow-qaqc-desktop/preload.js
 *
 * Mapeo s3Key → ruta local:
 *   "projects/{proj}/plans/{name}.pdf"  →  "D:\Flow-QAQC\{proj}\plans\{name}.pdf"
 *   "projects/{proj}/plansdwg/{name}.dwg" → "D:\Flow-QAQC\{proj}\plansdwg\{name}.dwg"
 */

interface ElectronAPI {
  isElectron: true;

  /** Verifica si el archivo existe localmente. Devuelve ruta completa o null. */
  checkLocalFile(s3Key: string): Promise<string | null>;

  /** Guarda un ArrayBuffer en la ruta local. Devuelve la ruta donde se guardó. */
  saveLocalFile(s3Key: string, buffer: ArrayBuffer): Promise<string>;

  /** Devuelve la ruta local sin verificar existencia. */
  getLocalPath(s3Key: string): Promise<string>;

  /** Devuelve el directorio raíz D:\Flow-QAQC */
  getLocalBase(): Promise<string>;

  /** Abre la carpeta del archivo en el Explorador de Windows. */
  openLocalFolder(s3Key: string): Promise<void>;

  /** Elimina un archivo local. */
  deleteLocalFile(s3Key: string): Promise<void>;

  /** Lista archivos en una carpeta local. */
  listLocalFiles(s3Prefix: string): Promise<Array<{
    name: string;
    filePath: string;
    sizeBytes: number;
  }>>;
  /** Abre el HTML en el navegador del sistema. */
  openHtmlInBrowser(html: string, filename: string): Promise<string>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
