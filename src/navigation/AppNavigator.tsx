import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import type { NavigationContainerRef } from '@react-navigation/native';

// Carga segura de expo-notifications (módulo nativo puede no estar disponible en builds anteriores)
let Notifications: typeof import('expo-notifications') | null = null;
try { Notifications = require('expo-notifications'); } catch { /* módulo nativo no disponible */ }
import type { RootStackParamList as RootStackParamListFull } from './types';

import { useAuth } from '@context/AuthContext';
import type { RootStackParamList } from './types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// Screens
import LoginScreen from '@screens/LoginScreen';
import ProjectListScreen from '@screens/ProjectListScreen';
import LocationListScreen from '@screens/LocationListScreen';
import LocationProtocolsScreen from '@screens/LocationProtocolsScreen';
import ProtocolListScreen from '@screens/ProtocolListScreen';
import ProtocolFillScreen from '@screens/ProtocolFillScreen';
import ProtocolAuditScreen from '@screens/ProtocolAuditScreen';
import NonConformityScreen from '@screens/NonConformityScreen';
import ExcelImportScreen from '@screens/ExcelImportScreen';
import LocationsImportScreen from '@screens/LocationsImportScreen';
import CameraScreen from '@screens/CameraScreen';
import UserManagementScreen from '@screens/UserManagementScreen';
import ChangePasswordScreen from '@screens/ChangePasswordScreen';
import DossierScreen from '@screens/DossierScreen';
import PlansManagementScreen from '@screens/PlansManagementScreen';
import PlanViewerScreen from '@screens/PlanViewerScreen';
import HistoricalScreen from '@screens/HistoricalScreen';
import AnnotationCommentsScreen from '@screens/AnnotationCommentsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { currentUser, isLoading } = useAuth();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamListFull>>(null);

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
    <NavigationContainer ref={navigationRef}>
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
            <Stack.Screen name="ProtocolList" component={ProtocolListScreen} />
            <Stack.Screen name="ProtocolFill" component={ProtocolFillScreen} />
            <Stack.Screen name="ProtocolAudit" component={ProtocolAuditScreen} />
            <Stack.Screen name="NonConformity" component={NonConformityScreen} />
            <Stack.Screen name="Historical" component={HistoricalScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="UserManagement" component={UserManagementScreen} />
            <Stack.Screen name="Dossier" component={DossierScreenWrapper} />
            <Stack.Screen name="PlansManagement" component={PlansManagementScreenWrapper} />
            <Stack.Screen name="PlanViewer" component={PlanViewerScreen} />
            <Stack.Screen name="AnnotationComments" component={AnnotationCommentsScreen} />
            <Stack.Screen name="ExcelImport" component={ExcelImportScreenWrapper} />
            <Stack.Screen name="LocationsImport" component={LocationsImportScreenWrapper} />
            <Stack.Screen
              name="Camera"
              component={CameraScreenWrapper}
              options={{ animation: 'fade' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
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
      onClose={() => navigation.goBack()}
    />
  );
}

function DossierScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'Dossier'>) {
  return (
    <DossierScreen
      projectId={route.params.projectId}
      projectName={route.params.projectName}
      onBack={() => navigation.goBack()}
      onOpenProtocol={(protocolId) => navigation.navigate('ProtocolAudit', { protocolId })}
    />
  );
}

function PlansManagementScreenWrapper({
  navigation,
  route,
}: NativeStackScreenProps<RootStackParamList, 'PlansManagement'>) {
  return (
    <PlansManagementScreen
      projectId={route.params.projectId}
      projectName={route.params.projectName}
      onBack={() => navigation.goBack()}
      onOpenPlan={(planId, planName) => navigation.navigate('PlanViewer', { planId, planName })}
    />
  );
}

