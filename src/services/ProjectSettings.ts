/**
 * ProjectSettings
 *
 * Almacena configuraciones por proyecto en AsyncStorage:
 *   - stampEnabled: activar/desactivar estampado de fotos
 *   - stampPhotoUri: URI local de la foto del proyecto para el stamp
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ProjectStampSettings {
  stampEnabled: boolean;
  stampPhotoUri: string | null;
  signatureUri: string | null;
  stampComment: string | null;
}

const key = (projectId: string) => `project_settings_${projectId}`;

const defaults: ProjectStampSettings = {
  stampEnabled: true,
  stampPhotoUri: null,
  signatureUri: null,
  stampComment: null,
};

export async function getProjectSettings(projectId: string): Promise<ProjectStampSettings> {
  try {
    const raw = await AsyncStorage.getItem(key(projectId));
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export async function saveProjectSettings(
  projectId: string,
  settings: Partial<ProjectStampSettings>
): Promise<void> {
  const current = await getProjectSettings(projectId);
  await AsyncStorage.setItem(key(projectId), JSON.stringify({ ...current, ...settings }));
}
