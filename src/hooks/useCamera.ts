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
  cameraRef: React.RefObject<Camera | null>;
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
        // SIEMPRE solicitar primero. `requestPermission()` de vision-camera
        // muestra el recuadro NATIVO si el permiso nunca fue pedido, y si está
        // denegado permanentemente ("no volver a preguntar") resuelve de
        // inmediato a `false` sin mostrar diálogo. NO confiar en
        // `getCameraPermissionStatus()` para decidir pedir-vs-Ajustes: en Android
        // ese estado no distingue 'not-determined' de 'denied' y puede devolver
        // 'denied' para un permiso JAMÁS solicitado, saltándose el recuadro
        // nativo y mandando directo a Ajustes (el bug que reportó el usuario).
        const granted = await requestPermission();

        // Solo si tras pedirlo SIGUE sin permiso ofrecemos ir a Ajustes
        // (caso real de denegado permanente). Así el recuadro nativo siempre
        // aparece primero cuando Android puede mostrarlo.
        if (!granted && !cancelled && Camera.getCameraPermissionStatus() !== 'granted') {
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Permiso de cámara requerido',
              'Flow QA/QC necesita acceso a la cámara para capturar evidencias fotográficas. Si lo denegaste, habilítalo en Ajustes.',
              [
                { text: 'Cancelar', style: 'cancel', onPress: () => resolve() },
                { text: 'Ir a Ajustes', onPress: () => { Linking.openSettings(); resolve(); } },
              ],
            );
          });
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
