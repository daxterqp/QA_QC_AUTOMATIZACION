import 'react-native-screens';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@context/AuthContext';
import { NetworkProvider, useNetwork } from '@context/NetworkContext';
import { CroquisCaptureProvider } from '@context/CroquisCaptureContext';
import { LanguageProvider } from '@i18n/index';
import AppNavigator from '@navigation/AppNavigator';
import { SyncWorker } from '@services/SyncWorker';
import { _setSyncing as setGlobalSyncing } from '@hooks/useSyncQueue';

// Suppress console.log/warn in production builds
if (!__DEV__) {
  console.log = () => {};
  console.warn = () => {};
}

/** Wrapper interno que tiene acceso a useNetwork (necesario para SyncWorker). */
function AppInner() {
  const { isOnline } = useNetwork();
  const onlineRef = React.useRef(isOnline);
  React.useEffect(() => { onlineRef.current = isOnline; }, [isOnline]);

  // Iniciar SyncWorker UNA SOLA VEZ. Lee el estado online via ref para que el
  // worker no reinicie cada vez que cambia la red.
  React.useEffect(() => {
    SyncWorker.start(() => onlineRef.current, setGlobalSyncing);
    return () => SyncWorker.stop();
  }, []);

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <CroquisCaptureProvider>
        <AppNavigator />
      </CroquisCaptureProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <NetworkProvider>
        <AppInner />
      </NetworkProvider>
    </LanguageProvider>
  );
}
