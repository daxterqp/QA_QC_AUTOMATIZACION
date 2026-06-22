'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Lock, LogOut, Loader2, ShieldAlert, PenLine, Globe, Info, Mail, Sparkles, ChevronRight, UploadCloud, GraduationCap,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useAuth } from '@lib/auth-context';
import { createClient } from '@lib/supabase/client';
import { uploadUserSignature } from '@hooks/useFileUpload';
import { roleLabel, canSignature } from '@lib/roles';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';

const supabase = createClient();

// Recomendaciones / datos curiosos (paridad con el carrusel del menú móvil).
const TIP_KEYS = [
  'webMisc.tip1', 'webMisc.tip2', 'webMisc.tip3', 'webMisc.tip4', 'webMisc.tip5',
  'webMisc.tip6', 'webMisc.tip7', 'webMisc.tip8', 'webMisc.tip9', 'webMisc.tip10',
  'webMisc.tip11', 'webMisc.tip12', 'webMisc.tip13',
];

export default function MyAccountPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { currentUser, signOut } = useAuth();

  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Firma personal
  const [signPreview, setSignPreview] = useState<string | null>(null);
  const [signStatus, setSignStatus] = useState<{ type: 'idle' | 'loading' | 'error'; msg?: string }>({ type: 'idle' });
  const signInputRef = useRef<HTMLInputElement>(null);

  // Carrusel de recomendaciones
  const [tip, setTip] = useState(0);

  const showSign = canSignature(currentUser?.role);

  useEffect(() => {
    if (currentUser && showSign) {
      setSignPreview(`/api/s3-image?key=${encodeURIComponent(`signatures/${currentUser.id}/signature.jpg`)}&fresh=1&t=${Date.now()}`);
    }
  }, [currentUser, showSign]);

  useEffect(() => {
    const id = setInterval(() => setTip(t => (t + 1) % TIP_KEYS.length), 6000);
    return () => clearInterval(id);
  }, []);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <PageHeader title={t('webMisc.myAccount')} />
        <div className="flex-1 flex items-center justify-center text-muted text-sm">{t('webMisc.noActiveSession')}</div>
      </div>
    );
  }

  const storedPassword = currentUser.password ?? currentUser.name;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (current !== storedPassword) { setMsg({ type: 'error', text: t('webMisc.currentPasswordWrong') }); return; }
    if (newPass.length < 4) { setMsg({ type: 'error', text: t('webMisc.newPasswordTooShort') }); return; }
    if (newPass !== confirmPass) { setMsg({ type: 'error', text: t('webMisc.confirmMismatch') }); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update({ password: newPass, updated_at: Date.now() }).eq('id', currentUser!.id);
      if (error) throw error;
      setCurrent(''); setNewPass(''); setConfirmPass('');
      setMsg({ type: 'success', text: t('webMisc.passwordUpdated') });
    } catch (e: any) {
      setMsg({ type: 'error', text: t('webMisc.errorWithMsg', { error: e?.message ?? e }) });
    } finally { setSaving(false); }
  }

  async function handlePickSignature(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser) return;
    setSignStatus({ type: 'loading' });
    try {
      const s3Key = await uploadUserSignature(file, currentUser.id);
      try { await supabase.from('users').update({ signature_uri: s3Key, updated_at: Date.now() }).eq('id', currentUser.id); } catch { /* registro opcional */ }
      setSignPreview(`/api/s3-image?key=${encodeURIComponent(s3Key)}&fresh=1&t=${Date.now()}`);
      setSignStatus({ type: 'idle' });
    } catch (err: any) {
      setSignStatus({ type: 'error', msg: err?.message ?? t('webMisc.signatureUploadError') });
    }
  }

  async function handleSignOut() {
    if (!confirm(t('webMisc.confirmSignOut'))) return;
    await signOut();
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={t('webMisc.myAccount')}
        subtitle={`${currentUser.name} ${currentUser.apellido ?? ''}`.trim()}
        crumbs={[{ label: t('webMisc.crumbProjects'), href: '/app/projects' }, { label: t('webMisc.crumbMyAccount') }]}
      />

      <div className="flex-1 max-w-md w-full mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Identidad */}
        <div className="bg-white rounded-xl shadow-subtle px-4 py-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center text-base">
            {(currentUser.name?.[0] ?? '') + (currentUser.apellido?.[0] ?? '')}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-navy truncate">{currentUser.name} {currentUser.apellido ?? ''}</p>
            <p className="text-[11px] text-muted uppercase tracking-wider font-bold">{roleLabel(currentUser.role)}</p>
          </div>
        </div>

        {/* Recomendaciones del día */}
        <button onClick={() => setTip(p => (p + 1) % TIP_KEYS.length)}
          className="bg-white rounded-xl shadow-subtle p-4 text-left hover:shadow-md transition">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles size={13} className="text-secondary" />
            <span className="text-[11px] font-extrabold text-secondary uppercase tracking-wider">{t('webMisc.dailyTips')}</span>
          </div>
          <p className="text-xs text-navy/70 leading-relaxed min-h-[32px]">{t(TIP_KEYS[tip])}</p>
          <div className="flex gap-1 mt-2">
            {TIP_KEYS.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all', i === tip ? 'w-4 bg-primary' : 'w-1.5 bg-border')} />)}
          </div>
        </button>

        {/* Mi firma (solo Jefe / Supervisor / Creador) */}
        {showSign && (
          <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <PenLine size={16} className="text-primary" />
              <h3 className="text-sm font-bold text-navy">{t('webMisc.mySignature')}</h3>
            </div>
            <p className="text-[11px] text-muted">
              {t('webMisc.signatureHint')}
            </p>
            <div className="h-32 rounded-lg border border-border bg-[#fbfcfe] flex items-center justify-center overflow-hidden">
              {signPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={signPreview} alt={t('webMisc.signatureAlt')} className="max-h-[88%] max-w-[88%] object-contain" onError={() => setSignPreview(null)} />
              ) : (
                <span className="text-xs text-muted">{t('webMisc.noSignature')}</span>
              )}
            </div>
            {signStatus.type === 'error' && <p className="text-xs text-danger font-semibold">{signStatus.msg}</p>}
            <input ref={signInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickSignature} />
            <button
              onClick={() => signInputRef.current?.click()}
              disabled={signStatus.type === 'loading'}
              className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 transition"
            >
              {signStatus.type === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={15} />}
              {signPreview ? t('webMisc.changeSignature') : t('webMisc.uploadSignature')}
            </button>
          </div>
        )}

        {/* Cambiar contraseña */}
        <form onSubmit={handleChangePassword} className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-navy">{t('webMisc.changePassword')}</h3>
          </div>
          <Field label={t('webMisc.currentPassword')}>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </Field>
          <Field label={t('webMisc.newPasswordLabel')}>
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} autoComplete="new-password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </Field>
          <Field label={t('webMisc.confirmNewPassword')}>
            <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} autoComplete="new-password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </Field>
          {msg && (
            <div className={cn('rounded-lg px-3 py-2 text-xs font-semibold flex items-start gap-2', msg.type === 'error' ? 'bg-red-50 text-danger' : 'bg-green-50 text-success')}>
              {msg.type === 'error' && <ShieldAlert size={14} className="flex-shrink-0 mt-0.5" />}
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={saving || !current || !newPass || !confirmPass}
            className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40 transition mt-1">
            {saving && <Loader2 size={14} className="animate-spin" />}
            {t('webMisc.updatePassword')}
          </button>
        </form>

        {/* Preferencias / Idioma (stub) */}
        <div className="bg-white rounded-xl shadow-subtle p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-navy">{t('webMisc.preferences')}</h3>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-navy">{t('webMisc.language')}</span>
            <span className="text-xs font-bold text-primary bg-primary/10 rounded px-2 py-1">{t('webMisc.spanishSelected')}</span>
          </div>
          <p className="text-[11px] text-muted">{t('webMisc.moreLanguagesSoon')}</p>
        </div>

        {/* Información */}
        <div className="bg-white rounded-xl shadow-subtle overflow-hidden">
          <a href="/walkthrough" target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition border-b border-divider">
            <GraduationCap size={16} className="text-primary" />
            <span className="flex-1 text-sm font-semibold text-navy">{t('webMisc.tutorial')}</span>
            <ChevronRight size={16} className="text-muted" />
          </a>
          <Link href="/app/about" className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition border-b border-divider">
            <Info size={16} className="text-primary" />
            <span className="flex-1 text-sm font-semibold text-navy">{t('webMisc.aboutUs')}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
          <Link href="/app/contact" className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition">
            <Mail size={16} className="text-primary" />
            <span className="flex-1 text-sm font-semibold text-navy">{t('webMisc.contactUs')}</span>
            <ChevronRight size={16} className="text-muted" />
          </Link>
        </div>

        {/* Sign out */}
        <button onClick={handleSignOut}
          className="bg-white rounded-xl shadow-subtle px-4 py-3 flex items-center gap-3 text-danger hover:bg-red-50 transition font-bold text-sm">
          <LogOut size={16} />
          {t('webMisc.signOut')}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-muted tracking-wider uppercase">{label}</label>
      {children}
    </div>
  );
}
