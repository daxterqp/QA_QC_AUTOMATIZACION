import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { read, utils } from 'xlsx';
import type { UserRole } from '@models/User';

export interface ExcelUser {
  name: string;
  apellido: string;
  role: UserRole;
  /** v44 — Nombres de proyectos del usuario (columna "Proyectos", separados por coma/;/
   *  salto de línea). undefined = la columna no existe → no se sincronizan accesos. */
  projects?: string[];
}

export class UserImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserImportError';
  }
}

const ROLE_MAP: Record<string, UserRole> = {
  'creador': 'CREATOR',
  'creator': 'CREATOR',
  'jefe': 'RESIDENT',
  'resident': 'RESIDENT',
  'supervisor': 'SUPERVISOR',
  'tecnico': 'OPERATOR',     // v44 — operario renombrado a Técnico
  'técnico': 'OPERATOR',
  'operario': 'OPERATOR',    // alias legacy (sigue mapeando a OPERATOR)
  'operator': 'OPERATOR',
  'otros': 'OPERATOR',
};

export async function importUsersFromExcel(): Promise<ExcelUser[]> {
  // Android SAF se bloquea a "Recientes" con array de types — usar '*/*'.
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) {
    throw new UserImportError('No se seleccionó ningún archivo.');
  }

  const asset = result.assets[0];
  if (!/\.(xlsx?|csv)$/i.test(asset.name)) {
    throw new UserImportError('Formato no válido. Selecciona un archivo .xlsx, .xls o .csv');
  }
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' as const });
  const workbook = read(base64, { type: 'base64' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: Record<string, string>[] = utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) throw new UserImportError('El archivo está vacío.');

  // Detectar columnas (flexible — acepta variaciones de mayúsculas)
  const headers = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
  const hasNombre = headers.some((h) => h.includes('nombre'));
  const hasApellido = headers.some((h) => h.includes('apellido'));
  const hasRol = headers.some((h) => h.includes('rol') || h.includes('role'));
  // v44 — Columna OPCIONAL de proyectos (Proyectos / Proyecto / Projects).
  const hasProyectos = headers.some((h) => h.includes('proyecto') || h.includes('project'));

  if (!hasNombre || !hasApellido || !hasRol) {
    throw new UserImportError(
      'El archivo debe tener columnas: Nombre, Apellido, Rol'
    );
  }

  const users: ExcelUser[] = [];

  for (const row of rows) {
    const nameKey = Object.keys(row).find((k) => k.toLowerCase().includes('nombre')) ?? '';
    const apellidoKey = Object.keys(row).find((k) => k.toLowerCase().includes('apellido')) ?? '';
    const rolKey = Object.keys(row).find((k) => k.toLowerCase().includes('rol') || k.toLowerCase().includes('role')) ?? '';
    const projKey = Object.keys(row).find((k) => k.toLowerCase().includes('proyecto') || k.toLowerCase().includes('project')) ?? '';

    const name = String(row[nameKey] ?? '').trim();
    const apellido = String(row[apellidoKey] ?? '').trim();
    const rolRaw = String(row[rolKey] ?? '').trim().toLowerCase();

    if (!name || !apellido || !rolRaw) continue;

    const role = ROLE_MAP[rolRaw];
    if (!role) continue; // Ignorar roles desconocidos

    // Proyectos: solo si la columna existe (para no revocar accesos sin querer).
    const projects = hasProyectos
      ? String(row[projKey] ?? '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
      : undefined;

    users.push({ name, apellido, role, projects });
  }

  if (users.length === 0) {
    throw new UserImportError('No se encontraron usuarios válidos en el archivo.');
  }

  return users;
}
