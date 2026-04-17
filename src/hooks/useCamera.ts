import { useRef, useCallback, useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  type CameraDevice,
  type PhotoFile,
} from 'react-native-vision-camera';

export interface UseCameraReturn {
  /** Ref para adjuntar al componente <Camera> */
  cameraRef: React.RefObject<Camera>;
  /** Dispositivo de camara trasera listo para usar */
  device: CameraDevice | undefined;
  /** true cuando los permisos estan concedidos */
  hasPermission: boolean;
  /** true mientras se solicitan permisos */
  isLoading: boolean;
  /** Toma la foto. Retorna inmediatamente con la URI local. */
  takePhoto: () => Promise<PhotoFile | null>;
  /** Solicitar permisos manualmente si fueron denegados */
  requestPermission: () => Promise<boolean>;
}

/**
 * Hook que encapsula toda la logica de camara con vision-camera v4.
 *
 * Estrategia de permisos:
 * - Al montar, verifica el estado actual del permiso.
 * - Si nunca se pidió (not-determined), lo solicita directamente.
 * - Si fue denegado permanentemente (denied), ofrece ir a Ajustes.
 * - Si ya fue concedido, continúa sin demora.
 */
export function useCamera(): UseCameraReturn {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasPermission) {
        const status = Camera.getCameraPermissionStatus();

        if (status === 'not-determined') {
          // Primera vez: solicitar directamente
          await requestPermission();
        } else if (status === 'denied') {
          // Denegado permanentemente: ofrecer ir a Ajustes
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Permiso de cámara requerido',
              'Flow QA/QC necesita acceso a la cámara para capturar evidencias fotográficas. El permiso fue denegado anteriormente — habilítalo en Ajustes.',
              [
                { text: 'Cancelar', style: 'cancel', onPress: () => resolve() },
                { text: 'Ir a Ajustes', onPress: () => { Linking.openSettings(); resolve(); } },
              ],
            );
          });
        } else {
          // 'restricted' u otro: intentar solicitar por si acaso
          await requestPermission();
        }
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const takePhoto = useCallback(async (): Promise<PhotoFile | null> => {
    if (!cameraRef.current || !hasPermission) return null;

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });
      return photo;
    } catch (error) {
      console.error('[Camera] Error al tomar foto:', error);
      return null;
    }
  }, [hasPermission]);

  return {
    cameraRef,
    device,
    hasPermission,
    isLoading,
    takePhoto,
    requestPermission,
  };
}
