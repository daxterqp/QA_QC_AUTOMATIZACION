/**
 * i18n (v46) — Cadenas de la pantalla LoginScreen (namespace `login`).
 * Export default: Record<clave, { es; en; pt }>. Se agrega en `./index.ts`.
 */
const login: Record<string, { es: string; en: string; pt: string }> = {
  'login.title': { es: 'INICIAR SESIÓN', en: 'SIGN IN', pt: 'ENTRAR' },
  'login.demoExpired': { es: 'Demo expirada', en: 'Demo expired', pt: 'Demo expirada' },
  'login.viewDemo': { es: 'Ver demo', en: 'View demo', pt: 'Ver demo' },

  'login.nameLabel': { es: 'NOMBRE', en: 'NAME', pt: 'NOME' },
  'login.namePlaceholder': { es: 'Ingrese su nombre', en: 'Enter your name', pt: 'Digite seu nome' },

  'login.emailLabel': { es: 'CORREO', en: 'EMAIL', pt: 'E-MAIL' },
  'login.emailPlaceholder': { es: 'Ingrese su correo', en: 'Enter your email', pt: 'Digite seu e-mail' },

  'login.passwordLabel': { es: 'CONTRASEÑA', en: 'PASSWORD', pt: 'SENHA' },
  'login.passwordPlaceholder': { es: 'Ingrese su contraseña', en: 'Enter your password', pt: 'Digite sua senha' },
  'login.hide': { es: 'Ocultar', en: 'Hide', pt: 'Ocultar' },
  'login.show': { es: 'Mostrar', en: 'Show', pt: 'Mostrar' },

  'login.firstTimeHint': {
    es: 'Use el correo y la contraseña proporcionados por el administrador.',
    en: 'Use the email and password provided by the administrator.',
    pt: 'Use o e-mail e a senha fornecidos pelo administrador.',
  },

  'login.verifying': { es: 'Verificando...', en: 'Verifying...', pt: 'Verificando...' },
  'login.submit': { es: 'INGRESAR', en: 'SIGN IN', pt: 'ENTRAR' },

  'login.footer': {
    es: 'Para solicitar acceso, contacte al administrador del sistema.',
    en: 'To request access, contact the system administrator.',
    pt: 'Para solicitar acesso, entre em contato com o administrador do sistema.',
  },
  'login.privacyPolicy': { es: 'Política de Privacidad', en: 'Privacy Policy', pt: 'Política de Privacidade' },

  // Modal demo
  'login.demoModalTitle': { es: 'Acceso Demo', en: 'Demo Access', pt: 'Acesso Demo' },
  'login.demoModalSubtitle': {
    es: 'Ingresa la contraseña de demostración',
    en: 'Enter the demo password',
    pt: 'Digite a senha de demonstração',
  },
  'login.demoPasswordPlaceholder': { es: 'Contraseña demo', en: 'Demo password', pt: 'Senha demo' },
  'login.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'login.enter': { es: 'Entrar', en: 'Enter', pt: 'Entrar' },

  // Alerts
  'login.wrongPasswordTitle': { es: 'Contraseña incorrecta', en: 'Incorrect password', pt: 'Senha incorreta' },
  'login.wrongPasswordMsg': {
    es: 'La contraseña de demo no es correcta.',
    en: 'The demo password is not correct.',
    pt: 'A senha de demonstração não está correta.',
  },
  'login.accessErrorTitle': { es: 'Error de acceso', en: 'Access error', pt: 'Erro de acesso' },
  'login.accessErrorMsg': {
    es: 'Correo o contraseña incorrectos. Verifique sus datos e intente de nuevo.',
    en: 'Incorrect email or password. Check your details and try again.',
    pt: 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.',
  },
};

export default login;
