/**
 * DossierPreviewScreen
 *
 * Previsualizador del PDF generado para el Dossier de Calidad.
 * Header: botón compartir + botón descargar (elige carpeta en Android).
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import Pdf from 'react-native-pdf';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';
import AppHeader from '@components/AppHeader';
import { Colors, Radius, Shadow } from '../theme/colors';
import { useTourStepWithLayout } from '@hooks/useTourStep';

type Props = NativeStackScreenProps<RootStackParamList, 'DossierPreview'>;

export default function DossierPreviewScreen({ navigation, route }: Props) {
  const { pdfUri, projectName } = route.params;
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { ref: pdfAreaRef, onLayout: pdfAreaLayout } = useTourStepWithLayout('dossier_preview_pdf');
  const { ref: actionsRef, onLayout: actionsLayout } = useTourStepWithLayout('dossier_preview_actions');

  const handleShare = async () => {
    try {
      await Sharing.shareAsync(pdfUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Exportar Dossier PDF',
      });
    } catch (e) {
      Alert.alert('Error', `No se pudo compartir el PDF.\n${String(e)}`);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      if (Platform.OS === 'android') {
        const { StorageAccessFramework } = FileSystem;
        const perms = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!perms.granted) { setDownloading(false); return; }

        // Extraer nombre del archivo del URI
        const fileName = pdfUri.split('/').pop() ?? 'dossier.pdf';

        // Crear el archivo en la carpeta elegida
        const destUri = await StorageAccessFramework.createFileAsync(
          perms.directoryUri,
          fileName,
          'application/pdf',
        );

        // Leer el PDF en base64 y escribirlo en destino
        const b64 = await FileSystem.readAsStringAsync(pdfUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await FileSystem.writeAsStringAsync(destUri, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert('Descargado', `El PDF fue guardado en la carpeta seleccionada.`);
      } else {
        // iOS: compartir como alternativa
        await handleShare();
      }
    } catch (e) {
      Alert.alert('Error', `No se pudo guardar el PDF.\n${String(e)}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Vista previa del Dossier"
        subtitle={projectName}
        onBack={() => navigation.goBack()}
        rightContent={
          <View ref={actionsRef} onLayout={actionsLayout} style={styles.headerBtns}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleDownload}
              disabled={downloading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {downloading
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Ionicons name="download-outline" size={22} color={Colors.white} />
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleShare}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="share-social-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>
        }
      />

      <View ref={pdfAreaRef} onLayout={pdfAreaLayout} style={styles.pdfWrap}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Cargando PDF...</Text>
          </View>
        )}
        <Pdf
          source={{ uri: pdfUri, cache: true }}
          style={styles.pdf}
          onLoadComplete={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            Alert.alert('Error', 'No se pudo cargar el PDF para previsualización.');
          }}
          enablePaging
          horizontal={false}
          fitPolicy={0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  headerBtns: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  headerBtn: { padding: 4 },
  pdfWrap: { flex: 1 },
  pdf: { flex: 1, backgroundColor: Colors.surface },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, zIndex: 10,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 13 },
});
