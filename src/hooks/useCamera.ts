import { useRef, useCallback, useEffect, useState } from 'react';
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
 * Estrategia de "cero tiempos de carga":
 * - El componente <Camera> debe montarse al abrir el modulo de inspeccion,
 *   no solo al presionar el boton de camara.
 * - Usar `isActive={true}` en el componente para que el sensor quede en
 *   standby y la primera captura sea instantanea.
 */
export function useCamera(): UseCameraReturn {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [isLoading, setIsLoading] = useState(!hasPermission);

  // Solicitar permisos automaticamente al montar el hook
  useEffect(() => {
    if (!hasPermission) {
      setIsLoading(true);
      requestPermission().finally(() => setIsLoading(false));
    }
  }, [hasPermission, requestPermission]);

  const takePhoto = useCallback(async (): Promise<PhotoFile | null> => {
    if (!cameraRef.current || !hasPermission) return null;

    try {
      const photo = await cameraRef.current.takePhoto({
        flash: 'off',
        enableShutterSound: false,
        // enableAutoRedEyeReduction: false, // No disponible en v4
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
