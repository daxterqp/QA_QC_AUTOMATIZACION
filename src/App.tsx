import 'react-native-screens';
import React, { useEffect } from 'react';
import { LogBox, Platform, Alert, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Camera } from 'react-native-vision-camera';
import { AuthProvider } from '@context/AuthContext';
import AppNavigator from '@navigation/AppNavigator';

// Suppress console.log/warn in production builds
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
}

/** Solicita permiso de cámara al iniciar la app */
function useRequestCameraOnStart() {
  useEffect(() => {
    (async () => {
      const status = Camera.getCameraPermissionStatus();
      if (status === 'granted') return;

      // Si nunca se pidió, solicitar directamente
      if (status === 'not-determined') {
        await Camera.requestCameraPermission();
        return;
      }

      // Si fue denegado, sugerir ir a Ajustes
      if (status === 'denied') {
        Alert.alert(
          'Permiso de cámara requerido',
          'Flow QA/QC necesita acceso a la cámara para capturar evidencias fotográficas. Por favor habilítalo en Ajustes.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Ir a Ajustes', onPress: () => Linking.openSettings() },
          ],
        );
      }
    })();
  }, []);
}

export default function App() {
  useRequestCameraOnStart();

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AppNavigator />
    </AuthProvider>
  );
}
