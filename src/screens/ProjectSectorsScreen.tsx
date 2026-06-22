/**
 * ProjectSectorsScreen — Pantalla independiente (compat con rutas antiguas).
 *
 * El contenido principal vive en [components/ProjectSectorsContent.tsx] para
 * que el FileUploadScreen lo pueda embeber como tab "Sectores" sin duplicar
 * lógica. Esta pantalla solo monta el AppHeader + el componente.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import ProjectSectorsContent from '@components/ProjectSectorsContent';
import { useAuth } from '@context/AuthContext';
import { useTour } from '@context/TourContext';
import { useI18n } from '@i18n/index';
import { Colors } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'ProjectSectors'>;

export default function ProjectSectorsScreen({ route, navigation }: Props) {
  const { projectId, projectName } = route.params;
  const { currentUser } = useAuth();
  const isCreator = currentUser?.role === 'CREATOR';
  const { jumpToStep, isActive: tourActive, isContextual, dismissTour } = useTour();
  const { t } = useI18n();

  useEffect(() => {
    if (!isCreator) {
      Alert.alert(t('sectors.restrictedTitle'), t('sectors.restrictedMessage'), [
        { text: t('sectors.ok'), onPress: () => navigation.goBack() },
      ]);
    }
  }, [isCreator, navigation, t]);

  useEffect(() => {
    const unsub = navigation.addListener('blur', () => {
      if (tourActive && isContextual) dismissTour();
    });
    return unsub;
  }, [navigation, tourActive, isContextual, dismissTour]);

  if (!isCreator) return null;

  return (
    <View style={styles.container}>
      <AppHeader
        title={t('sectors.headerTitle')}
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <TouchableOpacity onPress={() => jumpToStep('sectors_import')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="help-circle-outline" size={22} color={Colors.white} />
          </TouchableOpacity>
        }
      />
      <ProjectSectorsContent projectId={projectId} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
});
