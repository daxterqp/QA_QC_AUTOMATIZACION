'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users as UsersIcon, Plus, Trash2, Loader2, ShieldAlert, X,
  Pencil, Search,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useAuth } from '@lib/auth-context';
import {
  useUsers, useCreateUser, useUpdateUser, useDeleteUser,
  useProjectAccess, useSetUserAccess,
} from '@hooks/useUsers';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import type { User, UserRole } from '@/types';

const ROLE_META: Record<UserRole, { labelKey: string; cls: string }> = {
  CREATOR:    { labelKey: 'webMisc.roleCreator',    cls: 'bg-purple-100 text-purple-700' },
  RESIDENT:   { labelKey: 'webMisc.roleResident',   cls: 'bg-primary/10 text-primary' },
  SUPERVISOR: { labelKey: 'webMisc.roleSupervisor', cls: 'bg-blue-100 text-blue-700' },
  OPERATOR:   { labelKey: 'webMisc.roleOperator',   cls: 'bg-amber-100 text-amber-700' },
};

const ROLES: UserRole[] = ['CREATOR', 'RESIDENT', 'SUPERVISOR', 'OPERATOR'];

export default function UsersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const { data: access } = useProjectAccess();
  const setAccess = useSetUserAccess();
  const projects = access?.projects ?? [];
  const accessByUser = access?.byUser ?? {};
  const projName = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();

  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Gate por rol — solo CREATOR puede entrar
  if (currentUser && currentUser.role !== 'CREATOR') {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <PageHeader title={t('webMisc.noAccess')} />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <ShieldAlert size={48} className="text-danger opacity-70" />
          <p className="text-base font-bold text-navy">{t('webMisc.creatorsOnly')}</p>
          <button onClick={() => router.push('/app/projects')}
            className="text-primary font-bold text-sm hover:underline">
            {t('webMisc.backToProjects')}
          </button>
        </div>
      </div>
    );
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      `${u.name} ${u.apellido ?? ''}`.toLowerCase().includes(q)
      || u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  function handleDelete(u: User) {
    if (u.id === currentUser?.id) {
      alert(t('webMisc.cannotDeleteSelfAlert'));
      return;
    }
    if (!confirm(t('webMisc.confirmDeleteUser', { name: `${u.name} ${u.apellido ?? ''}`.trim() }))) return;
    remove.mutate(u.id);
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={t('webMisc.usersTitle')}
        subtitle={t('webMisc.usersSubtitle', { count: users.length, plural: users.length !== 1 ? 's' : '' })}
        crumbs={[
          { label: t('webMisc.crumbProjects'), href: '/app/projects' },
          { label: t('webMisc.crumbUsers') },
        ]}
        rightContent={
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition"
          >
            <Plus size={13} /> {t('webMisc.newUser')}
          </button>
        }
      />

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-5 flex flex-col gap-4">
        {/* Búsqueda */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('webMisc.searchUsersPlaceholder')}
            className="w-full bg-white border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <UsersIcon size={48} className="text-muted opacity-30" />
            <p className="text-muted text-sm font-semibold">
              {search ? t('webMisc.noResults') : t('webMisc.noUsersYet')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(u => {
              const meta = ROLE_META[u.role];
              const role = meta ? { label: t(meta.labelKey), cls: meta.cls } : { label: u.role, cls: 'bg-gray-100 text-gray-600' };
              const isSelf = u.id === currentUser?.id;
              const projNames = (accessByUser[u.id] ?? []).map(id => projName[id]).filter(Boolean) as string[];
              return (
                <div key={u.id} className="bg-white rounded-xl shadow-subtle px-4 py-3 flex items-center gap-3 hover:shadow-md transition">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center flex-shrink-0">
                    {(u.name?.[0] ?? '') + (u.apellido?.[0] ?? '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy truncate">
                      {u.name} {u.apellido ?? ''}
                      {isSelf && <span className="text-[10px] text-muted font-normal ml-1">{t('webMisc.selfTag')}</span>}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider', role.cls)}>
                        {role.label.toUpperCase()}
                      </span>
                      {u.password && (
                        <span className="text-[10px] text-muted">{t('webMisc.initialPassword')} <code className="bg-surface px-1 rounded">{u.password}</code></span>
                      )}
                    </div>
                    {/* v44 — Proyectos asignados */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {u.role === 'CREATOR' ? (
                        <span className="text-[10px] text-primary font-bold">{t('webMisc.allProjectsCreator')}</span>
                      ) : projNames.length === 0 ? (
                        <span className="text-[10px] text-muted italic">{t('webMisc.noProjectsAssigned')}</span>
                      ) : (
                        <>
                          {projNames.slice(0, 8).map((n, i) => (
                            <span key={i} className="bg-surface border border-border rounded px-1.5 py-0.5 text-[10px] text-navy/70 font-semibold max-w-[140px] truncate">{n}</span>
                          ))}
                          {projNames.length > 8 && <span className="text-[10px] text-muted font-bold">+{projNames.length - 8}</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditingUser(u)}
                      className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition"
                      title={t('webMisc.edit')}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDelete(u)} disabled={isSelf || remove.isPending}
                      className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition disabled:opacity-30 disabled:hover:bg-transparent"
                      title={isSelf ? t('webMisc.cannotDeleteSelf') : t('common.delete')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: crear */}
      {showCreate && (
        <UserModal
          mode="create"
          projects={projects}
          initialProjectIds={[]}
          onClose={() => setShowCreate(false)}
          onSubmit={async ({ projectIds, ...input }) => {
            try {
              // La Edge Function crea la cuenta + inserta los accesos (projectIds)
              // en una sola operación atómica.
              await create.mutateAsync({ ...input, projectIds });
              setShowCreate(false);
            } catch (e: any) {
              alert(t('webMisc.createUserError', { error: e?.message ?? e }));
            }
          }}
          isPending={create.isPending}
        />
      )}

      {/* Modal: editar */}
      {editingUser && (
        <UserModal
          mode="edit"
          initial={editingUser}
          projects={projects}
          initialProjectIds={accessByUser[editingUser.id] ?? []}
          onClose={() => setEditingUser(null)}
          onSubmit={async ({ projectIds, ...input }) => {
            try {
              await update.mutateAsync({ id: editingUser.id, ...input });
              if (input.role !== 'CREATOR') await setAccess.mutateAsync({ userId: editingUser.id, projectIds });
              setEditingUser(null);
            } catch (e: any) {
              alert(t('webMisc.updateUserError', { error: e?.message ?? e }));
            }
          }}
          isPending={update.isPending || setAccess.isPending}
        />
      )}
    </div>
  );
}

// ── Modal compartido para crear y editar ─────────────────────────────────────
function UserModal({ mode, initial, projects, initialProjectIds, onClose, onSubmit, isPending }: {
  mode: 'create' | 'edit';
  initial?: User;
  projects: { id: string; name: string }[];
  initialProjectIds: string[];
  onClose: () => void;
  onSubmit: (input: { email: string; name: string; apellido: string | null; role: UserRole; password: string | null; projectIds: string[] }) => void;
  isPending: boolean;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(initial?.name ?? '');
  const [apellido, setApellido] = useState(initial?.apellido ?? '');
  const [role, setRole] = useState<UserRole>(initial?.role ?? 'OPERATOR');
  // Login es por EMAIL → en el alta es obligatorio (lo necesita la cuenta de Auth).
  // En edición permitimos cambiarlo (se propaga a Auth vía la Edge Function).
  const [email, setEmail] = useState((initial as { email?: string } | undefined)?.email ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [projIds, setProjIds] = useState<Set<string>>(new Set(initialProjectIds));
  const toggleProj = (id: string) => setProjIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // En el alta exigimos email + password (ambos requeridos por la cuenta de Auth);
  // en edición el email basta con que sea válido si se tocó, y la password es opcional (reset).
  const canSave = name.trim().length >= 2
    && (mode === 'create' ? (emailOk && password.trim().length >= 4) : (email.trim() === '' || emailOk));

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4 shadow-modal"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-navy">
            {mode === 'create' ? t('webMisc.newUser') : t('webMisc.editUser')}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-navy">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('webMisc.nameLabel')}>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('webMisc.namePlaceholder')}
                autoFocus
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </Field>
            <Field label={t('webMisc.surnameLabel')}>
              <input
                type="text"
                value={apellido ?? ''}
                onChange={e => setApellido(e.target.value)}
                placeholder={t('webMisc.surnamePlaceholder')}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </Field>
          </div>

          <Field label={t('webMisc.emailLabel')}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="usuario@correo.com"
              autoComplete="off"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            {email.trim() !== '' && !emailOk && (
              <p className="text-[11px] text-danger mt-1">{t('webMisc.emailInvalid')}</p>
            )}
          </Field>

          <Field label={t('webMisc.roleLabel')}>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLES.map(r => {
                const meta = ROLE_META[r];
                const active = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={cn(
                      'px-3 py-2 rounded-lg border text-xs font-bold transition',
                      active ? `${meta.cls} border-transparent ring-2 ring-primary/30` : 'border-border text-muted hover:border-primary',
                    )}
                  >
                    {t(meta.labelKey)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={mode === 'create' ? t('webMisc.initialPasswordLabel') : t('webMisc.passwordEditLabel')}>
            <input
              type="text"
              value={password ?? ''}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'create' ? t('webMisc.passwordDefaultPlaceholder') : ''}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
            <p className="text-[11px] text-muted mt-1">
              {t('webMisc.passwordHint')}
            </p>
          </Field>

          {/* v44 — Acceso a proyectos (Creador ve todos, no aplica) */}
          {role !== 'CREATOR' && (
            <Field label={t('webMisc.projectsWithAccess', { count: projIds.size })}>
              {projects.length === 0 ? (
                <p className="text-[11px] text-muted">{t('webMisc.noProjects')}</p>
              ) : (
                <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                  {projects.map(p => {
                    const on = projIds.has(p.id);
                    return (
                      <button key={p.id} type="button" onClick={() => toggleProj(p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface transition">
                        <span className={cn('w-4 h-4 rounded border flex items-center justify-center flex-shrink-0', on ? 'bg-primary border-primary' : 'border-border')}>
                          {on && <span className="text-white text-[10px] leading-none">✓</span>}
                        </span>
                        <span className="text-sm text-navy truncate">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted mt-1">{t('webMisc.syncAccessHint')}</p>
            </Field>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-muted font-semibold hover:text-navy">
            {t('common.cancel')}
          </button>
          <button
            disabled={!canSave || isPending}
            onClick={() => onSubmit({
              email: email.trim(),
              name: name.trim(),
              apellido: apellido.trim() || null,
              role,
              // En el alta `canSave` ya exige password; en edición vacío = no resetear.
              password: password.trim() || null,
              projectIds: Array.from(projIds),
            })}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-40"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            {mode === 'create' ? t('webMisc.createUser') : t('webMisc.saveChanges')}
          </button>
        </div>
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
