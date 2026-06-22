/**
 * useRequiresOnline — gate para features que NO funcionan offline.
 *
 * Devuelve una función `gate(featureName, action)` que:
 *  - Si hay conexión → ejecuta la acción.
 *  - Si NO hay conexión → muestra Alert claro y NO ejecuta la acción.
 *
 * Uso:
 *   const requireOnline = useRequiresOnline();
 *   <Button onPress={() => requireOnline('Importar Excel', () => doImport())} />
 *
 * Para features que se desactivan visualmente (botón disabled), usar
 * directamente `useNetwork().isOnline` y aplicar el estado correspondiente.
 */

import { Alert } from 'react-native';
import { useCallback } from 'react';
import { useNetwork } from '@context/NetworkContext';

export function useRequiresOnline() {
  const { isOnline } = useNetwork();

  return useCallback((featureName: string, action: () => void) => {
    if (!isOnline) {
      Alert.alert(
        'Sin conexión',
        `${featureName} requiere conexión a internet.\n\nConéctate a WiFi/datos móviles y vuelve a intentar.`,
      );
      return;
    }
    action();
  }, [isOnline]);
}
