import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View, Linking, Alert } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastHost } from '@components/Toast';
import { ActiveSessionPrompt } from '@components/ActiveSessionPrompt';
import type { NavigationContainerRef } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import { protocolsCollection, protocolTemplatesCollection } from '@db/index';
import { OfflineBanner } from '@components/OfflineBanner';
import { SyncWorker } from '@services/SyncWorker';

// Carga segura de expo-notifications (módulo nativo puede no estar disponible en builds anteriores)
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch { /* módulo nativo no disponible */ }
import type { RootStackParamList as RootStackParamListFull } from './types';

import { useAuth } from '@context/AuthContext';
import { TourProvider, useTour } from '@context/TourContext';
import TourOverlay from '@components/TourOverlay';
import type { RootStackParamList } from './types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// Screens
import LoginScreen from '@screens/LoginScreen';
import ProjectListScreen from '@screens/ProjectListScreen';
import LocationListScreen from '@screens/LocationListScreen';
import LocationProtocolsScreen from '@screens/LocationProtocolsScreen';
import EnsayosScreen from '@screens/EnsayosScreen';
import SummaryTablesScreen from '@screens/SummaryTablesScreen';
import RecycleBinScreen from '@screens/RecycleBinScreen';
import SamplesScreen from '@screens/SamplesScreen';
import SampleDetailScreen from '@screens/SampleDetailScreen';
import ProtocolListScreen from '@screens/ProtocolListScreen';
import ProtocolFillScreen from '@screens/ProtocolFillScreen';
import ProtocolAuditScreen from '@screens/ProtocolAuditScreen';
import NonConformityScreen from '@screens/NonConformityScreen';
import ExcelImportScreen from '@screens/ExcelImportScreen';
import LocationsImportScreen from '@screens/LocationsImportScreen';
import CameraScreen from '@screens/CameraScreen';
import UserManagementScreen from '@screens/UserManagementScreen';
import ProjectConfigScreen from '@screens/ProjectConfigScreen';
import ChangePasswordScreen from '@screens/ChangePasswordScreen';
import DossierScreen from '@screens/DossierScreen';
import PlansManagementScreen from '@screens/PlansManagementScreen';
import FileUploadScreen from '@screens/FileUploadScreen';
import PlanViewerScreen from '@screens/PlanViewerScreen';
import HistoricalScreen from '@screens/HistoricalScreen';
import AnnotationCommentsScreen from '@screens/AnnotationCommentsScreen';
import DossierPreviewScreen from '@screens/DossierPreviewScreen';
import PhoneContactsScreen from '@screens/PhoneContactsScreen';
import SignatureScreen from '@screens/SignatureScreen';
import InfoScreen from '@screens/InfoScreen';
import MeasurementScreen from '@screens/MeasurementScreen';
import QRScannerScreen from '@screens/QRScannerScreen';
import ProjectMapScreen from '@screens/ProjectMapScreen';
import ProjectSectorsScreen from '@screens/ProjectSectorsScreen';
import TraceabilityHomeScreen from '@screens/TraceabilityHomeScreen';
import TraceabilityCaptureScreen from '@screens/TraceabilityCaptureScreen';
import TraceabilityRunningScreen from '@screens/TraceabilityRunningScreen';
import TraceabilityAnalyticsScreen from '@screens/TraceabilityAnalyticsScreen';
import WorkSessionDetailScreen from '@screens/WorkSessionDetailScreen';
import ProjectMenuScreen from '@screens/ProjectMenuScreen';
import ForceTakeoverPhotoScreen from '@screens/ForceTakeoverPhotoScreen';
import TraceabilityChecklistScreen from '@screens/TraceabilityChecklistScreen';
import ChecklistViewScreen from '@screens/ChecklistViewScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** FASE 7 — Resolución de deep-link `flow://protocol/<identifier>`.
 *  Reconstruye el identificador esperado para cada protocolo local
 *  (`<id_protocolo>-<external_id>` o `<id_protocolo>-<UUIDshort8>`) y matchea.
 *  Si encuentra: navega a ProtocolAudit (SUBMITTED/APPROVED) o ProtocolFill (DRAFT/IN_PROGRESS/REJECTED).
 *  Si no encuentra: alerta para que el usuario sincronice el proyecto correspondiente. */
async function resolveDeepLink(
  url: string,
  nav: NavigationContainerRef<RootStackParamListFull>,
): Promise<void> {
  const m = url.match(/^flow:\/\/protocol\/(.+)$/);
  if (!m) return;
  const identifier = decodeURIComponent(m[1]).trim();
  if (!identifier) return;

  // Si el usuario no está autenticado, el stack solo tiene `Login`. Navegar a
  // ProtocolFill/Audit en ese estado lanza warnings de react-navigation y
  // desperdicia queries. Avisar y abortar limpio.
  const currentRoute = nav.getCurrentRoute();
  if (currentRoute?.name === 'Login') {
    Alert.alert(
      'Inicia sesión primero',
      'Para abrir un protocolo desde un QR necesitas haber iniciado sesión. Inicia sesión y vuelve a escanear.',
    );
    return;
  }

  try {
    const protos = await protocolsCollection.query().fetch();
    const tIds = Array.from(new Set(
      protos.map((p: any) => p.templateId).filter(Boolean) as string[],
    ));
    const tmpls = tIds.length > 0
      ? await protocolTemplatesCollection.query(Q.where('id', Q.oneOf(tIds))).fetch()
      : [];
    const idProtoByTmpl: Record<string, string> = {};
    for (const t of tmpls as any[]) idProtoByTmpl[t.id] = t.idProtocolo;

    for (const p of protos as any[]) {
      const idProto = (p.templateId && idProtoByTmpl[p.templateId]) || 'PROTO';
      let candidate: string;
      if (p.externalId) {
        candidate = `${idProto}-${p.externalId}`;
      } else {
        const short = String(p.id).replace(/-/g, '').slice(0, 8).toUpperCase();
        candidate = `${idProto}-${short}`;
      }
      if (candidate === identifier) {
        const status = p.status;
        const targetScreen =
          status === 'APPROVED' || status === 'SUBMITTED' ? 'ProtocolAudit' : 'ProtocolFill';
        nav.navigate(targetScreen as any, { protocolId: p.id });
        return;
      }
    }
    Alert.alert(
      'Protocolo no encontrado',
      `No se encontró un protocolo con ID "${identifier}" en este dispositivo.\n\nAsegúrate de tener el proyecto correspondiente sincronizado (entra al proyecto y espera la sincronización inicial).`,
    );
  } catch (e) {
    console.warn('[deep-link] resolveDeepLink falló:', e);
  }
}

export default function AppNavigator() {
  const { currentUser, isLoading } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamListFull>>(null);

  // Solicitar permiso de cámara DESPUÉS del login (no en la pantalla de Login).
  // Evita asustar al usuario con prompts antes de que sepa qué es la app.
  // El permiso de GPS NO se pide aquí — solo al usarlo (GPSCaptureBar /
  // TraceabilityCapture / BackgroundLocationTask), que son post-login también.
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      const status = Camera.getCameraPermissionStatus();
      if (status === 'granted') return;
      const after = await Camera.requestCameraPermission();
      if (cancelled || after === 'granted') return;
      Alert.alert(
        'Permiso de cámara requerido',
        'Para capturar evidencias fotográficas necesitamos acceso a la cámara. Habilítalo manualmente en Ajustes del sistema → Permisos → Cámara.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir a Ajustes', onPress: () => Linking.openSettings() },
        ],
        { cancelable: true },
      );
    })();
    return () => { cancelled = true; };
  }, [currentUser]);
  /** FASE 7 — Si el deep-link llega ANTES de que el NavigationContainer esté
   *  montado (caso típico de cold start con sesión guardada: AppNavigator
   *  renderiza spinner mientras isLoading=true, useEffect corre pero ref es null),
   *  guardamos la URL aquí y la drenamos en el `onReady` del container. */
  const pendingUrlRef = useRef<string | null>(null);

  // FASE 7 — Deep-link `flow://protocol/<id>` (escaneo QR desde app externa).
  useEffect(() => {
    // Cold start: app abierta DESDE el deep link
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      if (navigationRef.current) {
        void resolveDeepLink(url, navigationRef.current);
      } else {
        // NavigationContainer aún no montado — drenar en onReady.
        pendingUrlRef.current = url;
      }
    }).catch(() => {});
    // Warm: app ya abierta, llega el deep link
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (navigationRef.current) void resolveDeepLink(url, navigationRef.current);
      else pendingUrlRef.current = url;
    });
    return () => sub.remove();
  }, []);

  // Manejar toque en notificación push → navegar a la pantalla correcta
  useEffect(() => {
    if (!Notifications) return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (!data?.screen || !navigationRef.current) return;
      try {
        if (data.screen === 'AnnotationComments') {
          navigationRef.current.navigate('AnnotationComments', {
            projectId: data.projectId,
            projectName: data.projectName ?? '',
          });
        } else if (data.screen === 'Dossier') {
          navigationRef.current.navigate('Dossier', {
            projectId: data.projectId,
            projectName: data.projectName ?? '',
          });
        }
      } catch { /* pantalla no disponible aún */ }
    });
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
    <TourProvider navigationRef={navigationRef}>
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          // FASE 7 — Drenar deep-link pendiente si llegó antes de que el container montara.
          if (pendingUrlRef.current && navigationRef.current) {
            const pending = pendingUrlRef.current;
            pendingUrlRef.current = null;
            void resolveDeepLink(pending, navigationRef.current);
          }
        }}
        onStateChange={() => {
          // v30 — Cada cambio de pantalla dispara un forceTick del worker.
          // Cubre la regresión del chip "subiendo 1" pegado: si el chip quedó
          // mostrando pending desactualizado por una race del observable, al
          // navegar a otra pantalla el worker drena lo que falte y el chip
          // se limpia solo. Best-effort: si falla, no rompe nada.
          SyncWorker.forceTick().catch(() => {});
        }}
      >
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          // La ruta inicial cambia dinámicamente según si hay sesión activa
          initialRouteName={currentUser ? 'ProjectList' : 'Login'}
        >
          {!currentUser ? (
            // ── Stack sin sesión ──────────────────────────────────────────────
            <Stack.Screen name="Login" component={LoginScreen} />
          ) : (
            // ── Stack con sesión ──────────────────────────────────────────────
            <>
              <Stack.Screen name="ProjectList" component={ProjectListScreen} />
              <Stack.Screen name="LocationList" component={LocationListScreen} />
              <Stack.Screen name="LocationProtocols" component={LocationProtocolsScreen} />
              <Stack.Screen name="Ensayos" component={EnsayosScreen} />
              <Stack.Screen name="SummaryTables" component={SummaryTablesScreen} />
              <Stack.Screen name="Samples" component={SamplesScreen} />
              <Stack.Screen name="SampleDetail" component={SampleDetailScreen} />
              <Stack.Screen name="RecycleBin" component={RecycleBinScreen} />
              <Stack.Screen name="ProtocolList" component={ProtocolListScreen} />
              <Stack.Screen name="ProtocolFill" component={ProtocolFillScreen} />
              <Stack.Screen name="ProtocolAudit" component={ProtocolAuditScreen} />
              <Stack.Screen name="NonConformity" component={NonConformityScreen} />
              <Stack.Screen name="Historical" component={HistoricalScreen} />
              <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
              <Stack.Screen name="Signature" component={SignatureScreen} />
              <Stack.Screen name="Info" component={InfoScreen} />
              <Stack.Screen name="UserManagement" component={UserManagementScreen} />
              <Stack.Screen name="ProjectConfig" component={ProjectConfigScreen} />
              <Stack.Screen name="Dossier" component={DossierScreenWrapper} />
              <Stack.Screen name="PlansManagement" component={PlansManagementScreenWrapper} />
              <Stack.Screen name="FileUpload" component={FileUploadScreen} />
              <Stack.Screen name="PlanViewer" component={PlanViewerScreen} />
              <Stack.Screen name="Measurement" component={MeasurementScreen} />
              <Stack.Screen name="AnnotationComments" component={AnnotationCommentsScreen} />
              <Stack.Screen name="DossierPreview" component={DossierPreviewScreen} />
              <Stack.Screen name="PhoneContacts" component={PhoneContactsScreen} />
              <Stack.Screen name="ExcelImport" component={ExcelImportScreenWrapper} />
              <Stack.Screen name="LocationsImport" component={LocationsImportScreenWrapper} />
              <Stack.Screen
                name="Camera"
                component={CameraScreenWrapper}
                options={{ animation: 'fade' }}
              />
              <Stack.Screen
                name="QRScanner"
                component={QRScannerScreen}
                options={{ animation: 'fade' }}
              />
              <Stack.Screen name="ProjectMap" component={ProjectMapScreen} />
              <Stack.Screen name="ProjectSectors" component={ProjectSectorsScreen} />
              <Stack.Screen name="TraceabilityHome" component={TraceabilityHomeScreen} />
              <Stack.Screen name="TraceabilityCapture" component={TraceabilityCaptureScreen} />
              <Stack.Screen name="TraceabilityRunning" component={TraceabilityRunningScreen} />
              <Stack.Screen name="TraceabilityAnalytics" component={TraceabilityAnalyticsScreen} />
              <Stack.Screen name="WorkSessionDetail" component={WorkSessionDetailScreen} />
              <Stack.Screen name="ProjectMenu" component={ProjectMenuScreen} />
              <Stack.Screen
                name="ForceTakeoverPhoto"
                component={ForceTakeoverPhotoScreen}
                options={{ animation: 'fade' }}
              />
              <Stack.Screen
                name="TraceabilityChecklist"
                component={TraceabilityChecklistScreen}
              />
              <Stack.Screen
                name="ChecklistView"
                component={ChecklistViewScreen}
              />
            </>
          )}
        </Stack.Navigator>
        <TourOverlay />
        {/* v27 — Detección de sesión activa al login (modal de continuar/pausar/cerrar) */}
        {currentUser && (
          <ActiveSessionPrompt
            navigate={(screen, params) => navigationRef.current?.navigate(screen as any, params)}
          />
        )}
      </NavigationContainer>
      {/* v29 — Chip flotante de estado de sincronización (overlay absoluto en
          esquina superior derecha). Solo se monta si hay sesión activa.
          Va DESPUÉS del NavigationContainer para quedar encima de todas las
          pantallas sin empujar el contenido. */}
      {currentUser && <OfflineBanner />}
      <ToastHost />
    </TourProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// ── Wrappers ──────────────────────────────────────────────────────────────────

function ExcelImportScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'ExcelImport'>) {
  return (
    <ExcelImportScreen
      projectId={route.params.projectId}
      projectName={route.params.projectName}
      onClose={() => navigation.goBack()}
      onImportSuccess={() => navigation.goBack()}
    />
  );
}

function LocationsImportScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'LocationsImport'>) {
  return (
    <LocationsImportScreen
      projectId={route.params.projectId}
      projectName={route.params.projectName}
      onClose={() => navigation.goBack()}
      onImportSuccess={() => navigation.goBack()}
    />
  );
}

function CameraScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Camera'>) {
  return (
    <CameraScreen
      protocolItemId={route.params.protocolItemId}
      annotationCommentId={route.params.annotationCommentId}
      extraPhotoProtocolId={route.params.extraPhotoProtocolId}
      projectId={route.params.projectId}
      onClose={() => navigation.goBack()}
    />
  );
}

function DossierScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Dossier'>) {
  const { isActive: tourActive, isContextual, dismissTour } = useTour();
  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);
  return (
    <DossierScreen
      projectId={route.params.projectId}
      projectName={route.params.projectName}
      onBack={() => navigation.goBack()}
      onOpenProtocol={(protocolId, status) => navigation.navigate(
        status === 'REJECTED' ? 'ProtocolFill' : 'ProtocolAudit',
        { protocolId }
      )}
      onPreviewPdf={(pdfUri) => navigation.navigate('DossierPreview', { pdfUri, projectName: route.params.projectName })}
    />
  );
}

function PlansManagementScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PlansManagement'>) {
  const mode = route.params.mode ?? 'viewer';
  return (
    <PlansManagementScreen
      projectId={route.params.projectId}
      projectName={route.params.projectName}
      mode={mode}
      onBack={() => navigation.goBack()}
      onOpenPlan={(planId, planName) => {
        if (mode === 'measure') {
          navigation.navigate('Measurement', { planId, planName });
        } else {
          navigation.navigate('PlanViewer', { planId, planName });
        }
      }}
    />
  );
}

