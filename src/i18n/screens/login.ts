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

  'login.subtitle': {
    es: 'Control de calidad en obra, en tu bolsillo.',
    en: 'Quality control on site, in your pocket.',
    pt: 'Controle de qualidade na obra, no seu bolso.',
  },
  'login.forgotPassword': { es: '¿Olvidaste tu contraseña?', en: 'Forgot your password?', pt: 'Esqueceu sua senha?' },
  'login.tapToStart': { es: 'Toca para comenzar', en: 'Tap to start', pt: 'Toque para começar' },
  'login.or': { es: 'o', en: 'or', pt: 'ou' },
  'login.continueGoogle': { es: 'Continuar con Google', en: 'Continue with Google', pt: 'Continuar com Google' },
  'login.createAccount': { es: 'Crear una cuenta', en: 'Create an account', pt: 'Criar uma conta' },
  'login.googleSetupTitle': { es: 'Google casi listo', en: 'Google almost ready', pt: 'Google quase pronto' },
  'login.googleSetupMsg': {
    es: 'El ingreso con Google se activa en el siguiente paso (requiere una reconstrucción de la app y el ID de cliente de Google).',
    en: 'Google sign-in will be enabled in the next step (requires an app rebuild and the Google client ID).',
    pt: 'O login com Google será ativado na próxima etapa (requer recompilar o app e o ID de cliente do Google).',
  },
  'login.googleNoAccountTitle': { es: 'Cuenta creada', en: 'Account created', pt: 'Conta criada' },
  'login.googleNoAccountMsg': {
    es: 'Tu cuenta quedó lista pero aún no tiene acceso. Pedile a un administrador que te asigne proyectos.',
    en: 'Your account is ready but has no access yet. Ask an administrator to assign you projects.',
    pt: 'Sua conta está pronta, mas ainda sem acesso. Peça a um administrador para atribuir projetos.',
  },
  'login.googleErrorTitle': { es: 'No se pudo con Google', en: 'Google sign-in failed', pt: 'Falha no Google' },
  'login.googleErrorMsg': {
    es: 'No se pudo iniciar con Google. Si recién se configuró, puede faltar reconstruir la app.',
    en: 'Could not sign in with Google. If it was just set up, the app may need a rebuild.',
    pt: 'Não foi possível entrar com Google. Se foi configurado agora, o app pode precisar ser recompilado.',
  },
  // Modal de registro (crear cuenta)
  'login.signupTitle': { es: 'Crear una cuenta', en: 'Create an account', pt: 'Criar uma conta' },
  'login.signupSubtitle': {
    es: 'Tu cuenta se crea como Visualizador. Un administrador te asignará acceso a proyectos.',
    en: 'Your account is created as Viewer. An administrator will grant you project access.',
    pt: 'Sua conta é criada como Visualizador. Um administrador concederá acesso aos projetos.',
  },
  'login.signupName': { es: 'Nombre y apellido', en: 'Full name', pt: 'Nome completo' },
  'login.signupCreate': { es: 'Crear cuenta', en: 'Create account', pt: 'Criar conta' },
  'login.signupCreating': { es: 'Creando...', en: 'Creating...', pt: 'Criando...' },
  'login.signupOkTitle': { es: 'Cuenta creada', en: 'Account created', pt: 'Conta criada' },
  'login.signupOkMsg': {
    es: 'Listo. Aún no tenés acceso a proyectos: pedile a un administrador que te los asigne.',
    en: 'Done. You have no project access yet: ask an administrator to assign them.',
    pt: 'Pronto. Você ainda não tem acesso a projetos: peça a um administrador para atribuí-los.',
  },
  'login.signupConfirmTitle': { es: 'Confirma tu correo', en: 'Confirm your email', pt: 'Confirme seu e-mail' },
  'login.signupConfirmMsg': {
    es: 'Te enviamos un correo para confirmar tu cuenta. Confírmalo y luego inicia sesión.',
    en: 'We sent you an email to confirm your account. Confirm it and then sign in.',
    pt: 'Enviamos um e-mail para confirmar sua conta. Confirme e depois entre.',
  },
  'login.signupExistsTitle': { es: 'Correo ya registrado', en: 'Email already registered', pt: 'E-mail já registrado' },
  'login.signupExistsMsg': {
    es: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
    en: 'That email already has an account. Sign in or reset your password.',
    pt: 'Esse e-mail já tem uma conta. Entre ou recupere sua senha.',
  },
  'login.signupErrorTitle': { es: 'No se pudo crear', en: 'Could not create', pt: 'Não foi possível criar' },
  'login.signupErrorMsg': {
    es: 'Revisa los datos (contraseña mínima 6) e intenta de nuevo.',
    en: 'Check the details (password min 6) and try again.',
    pt: 'Verifique os dados (senha mínima 6) e tente novamente.',
  },

  // Modal "olvidé mi contraseña"
  'login.resetTitle': { es: 'Recuperar contraseña', en: 'Reset password', pt: 'Recuperar senha' },
  'login.resetSubtitle': {
    es: 'Te enviaremos un correo con un enlace para crear una nueva contraseña.',
    en: 'We will send you an email with a link to set a new password.',
    pt: 'Enviaremos um e-mail com um link para criar uma nova senha.',
  },
  'login.resetEmailPlaceholder': { es: 'Tu correo', en: 'Your email', pt: 'Seu e-mail' },
  'login.resetSend': { es: 'Enviar enlace', en: 'Send link', pt: 'Enviar link' },
  'login.resetSending': { es: 'Enviando...', en: 'Sending...', pt: 'Enviando...' },
  'login.resetSentTitle': { es: 'Revisa tu correo', en: 'Check your email', pt: 'Verifique seu e-mail' },
  'login.resetSentMsg': {
    es: 'Si el correo está registrado, te llegará un enlace para restablecer tu contraseña.',
    en: 'If the email is registered, you will receive a link to reset your password.',
    pt: 'Se o e-mail estiver registrado, você receberá um link para redefinir sua senha.',
  },
  'login.resetErrorTitle': { es: 'No se pudo enviar', en: 'Could not send', pt: 'Não foi possível enviar' },
  'login.resetErrorMsg': {
    es: 'Revisa el correo e intenta de nuevo.',
    en: 'Check the email and try again.',
    pt: 'Verifique o e-mail e tente novamente.',
  },

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
