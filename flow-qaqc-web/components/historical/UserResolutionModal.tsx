'use client';

import { useState, useMemo } from 'react';
import { X, UserPlus, Link2, SkipForward } from 'lucide-react';
import { cn } from '@lib/utils';
import { useI18n } from '@lib/i18n';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import { userKey, type UnknownUser } from '@lib/historicalImport';
import type { UserResolution } from '@hooks/useHistoricalImport';

const supabase = createClient();

interface ExistingUser {
  id: string;
  name: string;
  apellido: string | null;
  role: string;
}

interface Props {
  unknownUsers: UnknownUser[];
  onConfirm: (resolutions: UserResolution[]) => void;
  onCancel: () => void;
}

const ROLES: UserResolution['role'][] = ['CREATOR', 'RESIDENT', 'SUPERVISOR', 'OPERATOR'];

/** Modal interactivo que pide al admin decidir qué hacer con cada user no registrado:
 *  crear, mapear a existente, o saltar. */
export function UserResolutionModal({ unknownUsers, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const { data: existingUsers = [] } = useQuery({
    queryKey: ['users-all'],
    queryFn: async (): Promise<ExistingUser[]> => {
      const { data } = await supabase.from('users').select('id, name, apellido, role').order('name');
      return (data ?? []) as ExistingUser[];
    },
  });

  const [resolutions, setResolutions] = useState<Map<string, UserResolution>>(() => {
    const m = new Map<string, UserResolution>();
    for (const u of unknownUsers) {
      const k = userKey(u.name, u.apellido);
      m.set(k, { key: k, name: u.name, apellido: u.apellido, action: 'create', role: 'SUPERVISOR' });
    }
    return m;
  });

  const updateRes = (key: string, patch: Partial<UserResolution>) => {
    setResolutions(prev => {
      const next = new Map(prev);
      const cur = next.get(key)!;
      next.set(key, { ...cur, ...patch });
      return next;
    });
  };

  const allReady = useMemo(() => {
    let ok = true;
    resolutions.forEach(r => {
      if (r.action === 'create' && !r.role) ok = false;
      if (r.action === 'map' && !r.mapToUserId) ok = false;
    });
    return ok;
  }, [resolutions]);

  const handleConfirm = () => {
    const out: UserResolution[] = [];
    resolutions.forEach(r => out.push(r));
    onConfirm(out);
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-modal overflow-hidden"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-navy text-white">
          <h3 className="text-sm font-bold tracking-wide uppercase">{t('webCHist.usersNotFound', { count: unknownUsers.length })}</h3>
          <button onClick={onCancel} className="p-1 rounded hover:bg-white/10 transition" title={t('webCHist.cancelImportTitle')}>
            <X size={16} />
          </button>
        </div>

        <p className="px-4 py-3 text-xs text-textSecondary bg-surface border-b border-border">
          {t('webCHist.usersNotFoundDesc')}
        </p>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {unknownUsers.map(u => {
            const k = userKey(u.name, u.apellido);
            const res = resolutions.get(k)!;
            return (
              <div key={k} className="border border-border rounded-lg p-3 bg-white">
                <p className="font-bold text-sm text-textPrimary mb-2">
                  {u.name}{u.apellido ? ` ${u.apellido}` : ''}
                </p>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <ActionBtn icon={<UserPlus size={12} />} label={t('webCHist.actionCreate')} active={res.action === 'create'} onClick={() => updateRes(k, { action: 'create' })} />
                  <ActionBtn icon={<Link2 size={12} />} label={t('webCHist.actionMap')} active={res.action === 'map'} onClick={() => updateRes(k, { action: 'map' })} />
                  <ActionBtn icon={<SkipForward size={12} />} label={t('webCHist.actionSkip')} active={res.action === 'skip'} onClick={() => updateRes(k, { action: 'skip' })} />
                </div>

                {res.action === 'create' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted">{t('webCHist.roleLabel')}</span>
                    <select
                      value={res.role ?? 'SUPERVISOR'}
                      onChange={e => updateRes(k, { role: e.target.value as UserResolution['role'] })}
                      className="text-xs border border-border rounded px-2 py-1 bg-white focus:outline-none focus:border-primary"
                    >
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )}

                {res.action === 'map' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted">{t('webCHist.userLabel')}</span>
                    <select
                      value={res.mapToUserId ?? ''}
                      onChange={e => updateRes(k, { mapToUserId: e.target.value })}
                      className="text-xs border border-border rounded px-2 py-1 bg-white focus:outline-none focus:border-primary flex-1"
                    >
                      <option value="">{t('webCHist.chooseOption')}</option>
                      {existingUsers.map(eu => (
                        <option key={eu.id} value={eu.id}>
                          {eu.name}{eu.apellido ? ` ${eu.apellido}` : ''} · {eu.role}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {res.action === 'skip' && (
                  <p className="text-[11px] text-warning">{t('webCHist.skipWarning')}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-surface">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-bold text-textSecondary hover:text-textPrimary transition">
            {t('webCHist.cancelImportBtn')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allReady}
            className={cn(
              'px-4 py-1.5 text-xs font-bold rounded transition',
              allReady ? 'bg-primary text-white hover:bg-primary/90' : 'bg-border text-muted cursor-not-allowed',
            )}
          >
            {t('webCHist.continueImport')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded border transition',
        active ? 'bg-primary text-white border-primary' : 'bg-white text-textSecondary border-border hover:bg-surface',
      )}
    >
      {icon}{label}
    </button>
  );
}
