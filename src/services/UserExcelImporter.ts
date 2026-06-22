import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { read, utils } from 'xlsx';
import type { UserRole } from '@models/User';
import { supabase } from '@config/supabase';

export interface ExcelUser {
  name: string;
  apellido: string;
  role: UserRole;
  /** v47 (RLS) — Correo del usuario (columna opcional "Email"/"Correo"). Si falta,
   *  se genera un placeholder a partir del nombre. Login ahora es por email. */
  email?: string;
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
  // v47 — Columna OPCIONAL de email (Email / Correo / E-mail).
  const hasEmail = headers.some((h) => h.includes('email') || h.includes('correo') || h.includes('mail'));

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
    const emailKey = Object.keys(row).find((k) => { const l = k.toLowerCase(); return l.includes('email') || l.includes('correo') || l.includes('mail'); }) ?? '';

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

    // Email: solo si la columna existe y trae valor.
    const email = hasEmail ? String(row[emailKey] ?? '').trim() || undefined : undefined;

    users.push({ name, apellido, role, email, projects });
  }

  if (users.length === 0) {
    throw new UserImportError('No se encontraron usuarios válidos en el archivo.');
  }

  return users;
}

/** Resultado del alta masiva vía Edge Function. */
export interface BulkCreateResult {
  /** Cantidad de filas procesadas con éxito (alta OK). */
  created: number;
  /** Errores por fila (no rompen el resto del import). */
  errors: string[];
}

/** Quita acentos/espacios para armar el local-part del email placeholder. */
function slugify(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // sin tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')                        // no-alfanum → punto
    .replace(/^\.+|\.+$/g, '');                         // sin puntos al borde
}

/**
 * v47 (RLS) — Alta masiva de usuarios desde Excel vía Edge Function `admin-users`.
 * Con RLS el INSERT directo a `users` está denegado; cada fila se crea con
 * `action:'create'` (crea cuenta Auth + fila users + accesos). Si una fila no trae
 * email, se genera un placeholder `nombre.apellido@flowqc.local` y la contraseña
 * temporal es el nombre. Los errores se acumulan y se reportan al final (una fila
 * fallida no detiene el resto del import).
 *
 * @param rows         usuarios parseados del Excel.
 * @param resolveProjectIds  mapea los nombres de proyecto de la fila a sus ids
 *   (los nombres sin match se ignoran aquí; el llamador puede avisar aparte).
 */
export async function bulkCreateUsersViaEdgeFunction(
  rows: ExcelUser[],
  resolveProjectIds: (projectNames: string[] | undefined) => string[],
): Promise<BulkCreateResult> {
  let created = 0;
  const errors: string[] = [];

  for (const u of rows) {
    const fullName = `${u.name} ${u.apellido}`.trim();
    // TODO: el usuario debe poner email real — placeholder generado si el Excel no trae columna Email.
    const email = u.email && u.email.includes('@')
      ? u.email
      : `${slugify(u.name)}.${slugify(u.apellido)}@flowqc.local`;
    // Password temporal = el nombre (el usuario la cambia luego). // TODO: forzar cambio en primer login.
    const password = u.name;
    const projectIds = resolveProjectIds(u.projects);

    try {
      const { error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create',
          email,
          password,
          name: u.name,
          apellido: u.apellido,
          role: u.role,
          projectIds,
        },
      });
      if (error) {
        errors.push(`${fullName}: ${error.message ?? 'error'}`);
      } else {
        created++;
      }
    } catch (e: any) {
      errors.push(`${fullName}: ${e?.message ?? String(e)}`);
    }
  }

  return { created, errors };
}
