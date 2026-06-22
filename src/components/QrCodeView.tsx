/**
 * QrCodeView (v43) — Renderiza un QR (deep-link `flow://…`) como SVG.
 *
 * Genera el SVG con `qrcode` (JS puro) en un efecto y lo pinta con react-native-svg
 * (SvgXml). Sirve para el Audit header y la pantalla de muestra. El QR lo lee el
 * QRScannerScreen global.
 */
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { renderQrSvg } from '@utils/qrCode';
import { Colors } from '../theme/colors';

export default function QrCodeView({ value, size = 96 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    renderQrSvg(value, { size }).then(s => { if (active) setSvg(s); }).catch(() => { if (active) setSvg(null); });
    return () => { active = false; };
  }, [value, size]);

  if (!svg) {
    return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 6 }}><ActivityIndicator size="small" color={Colors.primary} /></View>;
  }
  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius: 6, overflow: 'hidden' }}>
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  );
}
