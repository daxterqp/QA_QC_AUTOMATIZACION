/**
 * Paleta corporativa S-CUA
 * Fuente: Century Gothic / Gill Sans (sistema)
 */
export const Colors = {
  // Paleta principal
  navy:       '#0e213d',   // fondo header, textos principales
  primary:    '#394e7d',   // botones principales, acentos
  secondary:  '#668abc',   // elementos secundarios, tags
  light:      '#bbcee7',   // bordes, fondos suaves
  surface:    '#f3f5f6',   // fondo general de la app

  // Neutros
  white:      '#ffffff',
  textPrimary:'#0e213d',
  textSecondary: '#4a5568',
  textMuted:  '#8896a5',
  border:     '#d4dde8',
  divider:    '#e8edf4',

  // Semánticos
  success:    '#2e7d5e',
  danger:     '#c0392b',
  warning:    '#c47d15',
  info:       '#394e7d',
};

export const Typography = {
  fontFamily: 'System',  // Gill Sans / Century Gothic en sistema
  sizes: {
    xs:   10,
    sm:   12,
    md:   14,
    base: 16,
    lg:   18,
    xl:   22,
    xxl:  28,
    hero: 40,
  },
  weights: {
    regular: '400' as const,
    medium:  '500' as const,
    semibold:'600' as const,
    bold:    '700' as const,
    black:   '900' as const,
  },
};

export const Radius = {
  sm:  6,
  md:  10,
  lg:  14,
  xl:  20,
};

export const Shadow = {
  card: {
    shadowColor: '#0e213d',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  subtle: {
    shadowColor: '#0e213d',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
};
