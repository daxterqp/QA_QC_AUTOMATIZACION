export const AWS_CONFIG = {
  region: 'us-east-2',
  bucketName: 'flow-qc-proyecto',
  accessKeyId: '',
  secretAccessKey: '',
};

/** Sanitiza el nombre del proyecto para usarlo como clave S3 segura */
export function sanitizeProjectName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 80);
}

/** Prefijo S3 para un proyecto: projects/{projectName}/ */
export const s3ProjectPrefix = (projectName: string) => `projects/${sanitizeProjectName(projectName)}`;
