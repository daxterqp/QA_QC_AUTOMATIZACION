import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@context/AuthContext';
import type { RootStackParamList } from './types';

// Screens
import RoleSelectScreen from '@screens/RoleSelectScreen';
import ProjectListScreen from '@screens/ProjectListScreen';
import ProtocolListScreen from '@screens/ProtocolListScreen';
import ProtocolFillScreen from '@screens/ProtocolFillScreen';
import ProtocolAuditScreen from '@screens/ProtocolAuditScreen';
import NonConformityScreen from '@screens/NonConformityScreen';
import ExcelImportScreen from '@screens/ExcelImportScreen';
import LocationsImportScreen from '@screens/LocationsImportScreen';
import CameraScreen from '@screens/CameraScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={currentUser ? 'ProjectList' : 'RoleSelect'}
      >
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
        <Stack.Screen name="ProjectList" component={ProjectListScreen} />
        <Stack.Screen name="ProtocolList" component={ProtocolListScreen} />
        <Stack.Screen name="ProtocolFill" component={ProtocolFillScreen} />
        <Stack.Screen name="ProtocolAudit" component={ProtocolAuditScreen} />
        <Stack.Screen name="NonConformity" component={NonConformityScreen} />
        <Stack.Screen
          name="ExcelImport"
          component={ExcelImportScreenWrapper}
        />
        <Stack.Screen
          name="LocationsImport"
          component={LocationsImportScreenWrapper}
        />
        <Stack.Screen
          name="Camera"
          component={CameraScreenWrapper}
          options={{ animation: 'fade' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ── Wrappers para adaptar props de navegacion a props de componente ───────────

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
      onClose={() => navigation.goBack()}
    />
  );
}
