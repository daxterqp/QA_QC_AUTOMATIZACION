const changePass: Record<string, { es: string; en: string; pt: string }> = {
  'changePass.title': { es: 'Cambiar Clave', en: 'Change Password', pt: 'Alterar Senha' },

  'changePass.idLabel': { es: 'ID: {id}', en: 'ID: {id}', pt: 'ID: {id}' },

  'changePass.currentLabel': { es: 'Contraseña actual', en: 'Current password', pt: 'Senha atual' },
  'changePass.currentPlaceholder': { es: 'Contraseña actual', en: 'Current password', pt: 'Senha atual' },

  'changePass.newLabel': { es: 'Nueva contraseña', en: 'New password', pt: 'Nova senha' },
  'changePass.newPlaceholder': { es: 'Mínimo 4 caracteres', en: 'Minimum 4 characters', pt: 'Mínimo de 4 caracteres' },

  'changePass.confirmLabel': { es: 'Confirmar nueva contraseña', en: 'Confirm new password', pt: 'Confirmar nova senha' },
  'changePass.confirmPlaceholder': { es: 'Repite la contraseña', en: 'Repeat the password', pt: 'Repita a senha' },

  'changePass.show': { es: 'Ver', en: 'Show', pt: 'Mostrar' },
  'changePass.hide': { es: 'Ocultar', en: 'Hide', pt: 'Ocultar' },

  'changePass.mismatch': { es: 'Las contraseñas no coinciden', en: 'Passwords do not match', pt: 'As senhas não coincidem' },

  'changePass.saving': { es: 'Guardando...', en: 'Saving...', pt: 'Salvando...' },
  'changePass.save': { es: 'GUARDAR CONTRASEÑA', en: 'SAVE PASSWORD', pt: 'SALVAR SENHA' },

  'changePass.demoTitle': { es: 'No disponible', en: 'Not available', pt: 'Indisponível' },
  'changePass.demoMessage': { es: 'No puedes cambiar de clave en modo demo.', en: 'You cannot change the password in demo mode.', pt: 'Você não pode alterar a senha no modo demo.' },

  'changePass.errorTitle': { es: 'Error', en: 'Error', pt: 'Erro' },
  'changePass.errorCurrentWrong': { es: 'La contraseña actual no es correcta.', en: 'The current password is incorrect.', pt: 'A senha atual está incorreta.' },
  'changePass.errorTooShort': { es: 'La nueva contraseña debe tener al menos 4 caracteres.', en: 'The new password must be at least 4 characters long.', pt: 'A nova senha deve ter pelo menos 4 caracteres.' },

  'changePass.doneTitle': { es: 'Listo', en: 'Done', pt: 'Pronto' },
  'changePass.doneMessage': { es: 'Contraseña actualizada correctamente.', en: 'Password updated successfully.', pt: 'Senha atualizada com sucesso.' },
  'changePass.ok': { es: 'OK', en: 'OK', pt: 'OK' },

  'changePass.bioTitle': { es: 'Ingreso rápido', en: 'Quick sign-in', pt: 'Acesso rápido' },
  'changePass.bioDesc': {
    es: 'Desbloquear la app con huella o rostro al abrirla (más rápido y seguro en este dispositivo).',
    en: 'Unlock the app with fingerprint or face when opening it (faster and safer on this device).',
    pt: 'Desbloquear o app com impressão digital ou rosto ao abri-lo (mais rápido e seguro neste dispositivo).',
  },
  'changePass.bioLabel': { es: 'Huella / rostro', en: 'Fingerprint / face', pt: 'Digital / rosto' },
  'changePass.bioUnavailableTitle': { es: 'No disponible', en: 'Not available', pt: 'Indisponível' },
  'changePass.bioUnavailableMsg': {
    es: 'Este dispositivo no tiene huella o rostro configurados (o falta reconstruir la app).',
    en: 'This device has no fingerprint or face set up (or the app needs a rebuild).',
    pt: 'Este dispositivo não tem digital ou rosto configurados (ou o app precisa ser recompilado).',
  },

  'changePass.deleteSectionTitle': { es: 'Eliminar mi cuenta', en: 'Delete my account', pt: 'Excluir minha conta' },
  'changePass.deleteSectionDesc': {
    es: 'Se eliminará tu cuenta, firma, accesos a proyectos y token de notificaciones. Esta acción no se puede deshacer.',
    en: 'Your account, signature, project access and notification token will be deleted. This action cannot be undone.',
    pt: 'Sua conta, assinatura, acessos a projetos e token de notificações serão excluídos. Esta ação não pode ser desfeita.',
  },
  'changePass.deleteBtn': { es: 'ELIMINAR MI CUENTA', en: 'DELETE MY ACCOUNT', pt: 'EXCLUIR MINHA CONTA' },

  'changePass.deleteConfirmTitle': { es: 'Eliminar cuenta', en: 'Delete account', pt: 'Excluir conta' },
  'changePass.deleteConfirmMessage': {
    es: '¿Estás seguro? Se eliminarán todos tus datos personales. Los protocolos y observaciones que creaste se mantendrán como registro del proyecto.',
    en: 'Are you sure? All your personal data will be deleted. The protocols and observations you created will be kept as a project record.',
    pt: 'Tem certeza? Todos os seus dados pessoais serão excluídos. Os protocolos e observações que você criou serão mantidos como registro do projeto.',
  },
  'changePass.cancel': { es: 'Cancelar', en: 'Cancel', pt: 'Cancelar' },
  'changePass.delete': { es: 'Eliminar', en: 'Delete', pt: 'Excluir' },
};

export default changePass;
