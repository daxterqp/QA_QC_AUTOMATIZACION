'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  FolderKanban, LogOut, Users, LayoutDashboard, Plus, LogIn, X, Loader2,
} from 'lucide-react';
import { useAuth } from '@lib/auth-context';
import { useCreateProject, useJoinProject, useProjects } from '@hooks/useProjects';
import { ProjectConfigModal } from '@components/project/ProjectConfigModal';
import type { ProjectFeatureFlags } from '@/types';
import PdfPreview from '@components/PdfPreview';
import { cn, getInitials } from '@lib/utils';
import { roleLabel } from '@lib/roles';
import { useI18n } from '@lib/i18n';
import LanguageSelector from '@components/LanguageSelector';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, signOut } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const createProject = useCreateProject();
  const joinProject   = useJoinProject();

  const [showNewModal,  setShowNewModal]  = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [joinName,    setJoinName]    = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [joinError,   setJoinError]   = useState('');
  // v22 — wizard de 2 pasos: tras nombre+password, pedir módulos al CREATOR.
  const [pendingCreate, setPendingCreate] = useState<{ name: string; password: string } | null>(null);

  const { data: projects = [] } = useProjects();
  const appSyncDone = useRef(false);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
    }
  }, [loading, currentUser, router]);

  // Sync all projects on app start (once): plans + refresh logos
  useEffect(() => {
    if (appSyncDone.current || projects.length === 0) return;
    appSyncDone.current = true;
    for (const project of projects) {
      // Sync plans
      for (const type of ['pdf', 'dwg'] as const) {
        fetch('/api/plans/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, projectName: project.name, type }),
        }).catch(() => {});
      }
      // Refresh logo cache (fresh=1 deletes old local cache and downloads latest from S3)
      const logoKey = project.logo_s3_key ?? `logos/project_${project.id}/logo.jpg`;
      fetch(`/api/s3-image?key=${encodeURIComponent(logoKey)}&fresh=1`).catch(() => {});
    }
  }, [projects]);

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-primary font-semibold text-sm animate-pulse">{t('common.loading')}</div>
      </div>
    );
  }

  const isCreator = currentUser.role === 'CREATOR';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newPassword.trim()) return;
    const duplicate = projects.find((p: any) => p.name.toLowerCase().trim() === newName.toLowerCase().trim());
    if (duplicate) { alert(t('webLayout.duplicateProject')); return; }
    // Step 2: pasa al config de módulos. Solo CREATOR ve este modal.
    if (isCreator) {
      setPendingCreate({ name: newName.trim(), password: newPassword.trim() });
      setShowNewModal(false);
    } else {
      // Roles no-CREATOR no deberían poder crear, pero por compatibilidad creamos con defaults
      await createProject.mutateAsync({ name: newName.trim(), password: newPassword.trim() });
      setNewName('');
      setNewPassword('');
      setShowNewModal(false);
    }
  };

  const handleCreateWithFlags = async (flags: ProjectFeatureFlags, _mapTileUrl: string | null) => {
    if (!pendingCreate) return;
    // map_tile_url se setea en la edición posterior; al crear lo dejamos null implícito (default DB).
    await createProject.mutateAsync({ name: pendingCreate.name, password: pendingCreate.password, featureFlags: flags });
    setNewName('');
    setNewPassword('');
    setPendingCreate(null);
  };

  const handleJoin = async () => {
    if (!joinName.trim() || !joinPassword.trim()) return;
    setJoinError('');
    try {
      await joinProject.mutateAsync({ name: joinName.trim(), password: joinPassword.trim() });
      setJoinName('');
      setJoinPassword('');
      setShowJoinModal(false);
    } catch (e: any) {
      setJoinError(e.message ?? t('webLayout.joinError'));
    }
  };

  const navLinks = [
    { href: '/app/projects',  label: t('webLayout.navProjects'),  icon: FolderKanban    },
    { href: '/app/dashboard', label: t('webLayout.navDashboard'),  icon: LayoutDashboard },
    ...(isCreator ? [{ href: '/app/admin/users', label: t('webLayout.navUsers'), icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar */}
      <aside className="w-56 bg-navy flex flex-col fixed top-0 left-0 h-full z-30 shadow-modal">
        {/* Logo */}
        <div className="px-3 border-b border-white/10 flex items-center justify-center">
          <img
            src="/logo-login.png"
            alt="Flow QA/QC"
            className="w-full max-h-[120px] object-contain"
          />
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 flex flex-col gap-0.5 px-2">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/app/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition',
                  active
                    ? 'bg-primary text-white'
                    : 'text-light hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}

          {/* Action buttons */}
          <div className="pt-3 px-1 flex flex-col gap-1.5 border-t border-white/10 mt-2">
            {isCreator && (
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-light hover:bg-white/10 hover:text-white transition w-full text-left"
              >
                <Plus size={15} />
                {t('webLayout.newProject')}
              </button>
            )}
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold text-light hover:bg-white/10 hover:text-white transition w-full text-left"
            >
              <LogIn size={15} />
              {t('webLayout.joinProject')}
            </button>
          </div>
        </nav>

        {/* Selector de idioma (es/en/pt) — persistido por navegador. */}
        <div className="border-t border-white/10 px-3 pt-3 pb-1">
          <LanguageSelector />
        </div>

        {/* User — toca para abrir "Mi cuenta" (firma, contraseña, preferencias). */}
        <div className="border-t border-white/10 p-4 flex items-center gap-3">
          <Link href="/app/me" className="flex-1 min-w-0 flex items-center gap-3 hover:opacity-90 transition">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {getInitials(currentUser.name, currentUser.apellido)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-bold truncate">{currentUser.name}</p>
              <p className="text-light text-[10px] truncate">{roleLabel(currentUser.role)}</p>
            </div>
          </Link>
          <button
            onClick={handleSignOut}
            title={t('webLayout.signOut')}
            className="text-light hover:text-white transition"
          >
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 min-h-screen">
        {children}
      </main>

      {/* Modal Nuevo Proyecto */}
      {showNewModal && (
        <div className="fixed inset-0 bg-navy/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-navy font-bold text-base">{t('webLayout.newProjectTitle')}</h3>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-navy transition">
                <X size={18} />
              </button>
            </div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              {t('webLayout.projectNameLabel')}
            </label>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('webLayout.projectNamePlaceholder')}
              className="border border-border rounded-md px-3.5 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              {t('webLayout.projectPasswordLabel')}
            </label>
            <input
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder={t('webLayout.projectPasswordPlaceholder')}
              className="border border-border rounded-md px-3.5 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setShowNewModal(false)}
                className="flex-1 border border-border rounded-md py-3 text-sm font-semibold text-gray-500 hover:bg-surface transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !newPassword.trim() || createProject.isPending}
                className="flex-1 bg-primary text-white rounded-md py-3 text-sm font-bold disabled:opacity-50 hover:bg-navy transition flex items-center justify-center gap-2"
              >
                {createProject.isPending && <Loader2 size={14} className="animate-spin" />}
                {t('webLayout.create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Unirse */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-navy/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-navy font-bold text-base">{t('webLayout.joinProjectTitle')}</h3>
              <button onClick={() => { setShowJoinModal(false); setJoinError(''); }} className="text-gray-400 hover:text-navy transition">
                <X size={18} />
              </button>
            </div>
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              {t('webLayout.joinNameLabel')}
            </label>
            <input
              autoFocus
              value={joinName}
              onChange={e => { setJoinName(e.target.value); setJoinError(''); }}
              placeholder={t('webLayout.joinNamePlaceholder')}
              className="border border-border rounded-md px-3.5 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              {t('webLayout.passwordLabel')}
            </label>
            <input
              value={joinPassword}
              onChange={e => { setJoinPassword(e.target.value); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder={t('webLayout.joinPasswordPlaceholder')}
              className="border border-border rounded-md px-3.5 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {joinError && (
              <p className="text-xs text-danger font-semibold">{joinError}</p>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { setShowJoinModal(false); setJoinError(''); }}
                className="flex-1 border border-border rounded-md py-3 text-sm font-semibold text-gray-500 hover:bg-surface transition"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleJoin}
                disabled={!joinName.trim() || !joinPassword.trim() || joinProject.isPending}
                className="flex-1 bg-primary text-white rounded-md py-3 text-sm font-bold disabled:opacity-50 hover:bg-navy transition flex items-center justify-center gap-2"
              >
                {joinProject.isPending && <Loader2 size={14} className="animate-spin" />}
                {t('webLayout.join')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview overlay */}
      <PdfPreview />

      {/* Step 2 del wizard de creación: configuración de módulos (solo CREATOR) */}
      {pendingCreate && (
        <ProjectConfigModal
          title={t('webLayout.configModulesTitle', { name: pendingCreate.name })}
          confirmLabel={t('webLayout.createProjectConfirm')}
          onConfirm={handleCreateWithFlags}
          onCancel={() => setPendingCreate(null)}
        />
      )}
    </div>
  );
}
