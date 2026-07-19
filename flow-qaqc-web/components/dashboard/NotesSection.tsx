'use client';

/**
 * NotesSection — Anotaciones colaborativas del dashboard (CRUD sobre
 * dashboard_notes). Extraída del dashboard (antes duplicada). Autocontenida:
 * solo necesita `projectId`.
 */

import { useState } from 'react';
import { Loader2, Pencil, Trash2, Plus } from 'lucide-react';
import {
  useDashboardNotes,
  useAddDashboardNote,
  useUpdateDashboardNote,
  useDeleteDashboardNote,
  useUsersMap,
} from '@hooks/useHistorical';
import { useAuth } from '@lib/auth-context';
import { useI18n } from '@lib/i18n';

export default function NotesSection({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { data: notes = [] } = useDashboardNotes(projectId);
  const { data: usersMap = {} } = useUsersMap();
  const addNote = useAddDashboardNote(projectId);
  const updateNote = useUpdateDashboardNote(projectId);
  const deleteNote = useDeleteDashboardNote(projectId);

  const [noteText, setNoteText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleAdd() {
    if (!noteText.trim() || !currentUser) return;
    await addNote.mutateAsync({ content: noteText, userId: currentUser.id });
    setNoteText('');
  }

  async function handleUpdate(noteId: string) {
    if (!editingText.trim()) return;
    await updateNote.mutateAsync({ noteId, content: editingText });
    setEditingId(null);
    setEditingText('');
  }

  async function handleDelete(noteId: string) {
    await deleteNote.mutateAsync(noteId);
    setConfirmDeleteId(null);
  }

  return (
    <div className="bg-white rounded-xl shadow-subtle p-4 flex flex-col gap-3">
      <p className="text-xs font-bold text-gray-700">{t('webDash.notes')}</p>

      <div className="flex gap-2 items-end">
        <textarea
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm
                     text-gray-800 placeholder-gray-400 resize-none
                     focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          rows={2}
          placeholder={t('webDash.notePlaceholder')}
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
        />
        <button
          disabled={!noteText.trim() || addNote.isPending}
          onClick={handleAdd}
          className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold
                     disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1"
        >
          {addNote.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          {t('common.save')}
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">{t('webDash.noNotesYet')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map(note => {
            const isOwner = currentUser?.id === note.created_by_id;
            const isEditing = editingId === note.id;
            return (
              <div key={note.id} className="bg-surface rounded-lg p-3 flex flex-col gap-2">
                {isEditing ? (
                  <>
                    <textarea
                      className="w-full rounded border border-border bg-white px-2.5 py-2 text-sm
                                 text-gray-800 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                      rows={3}
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setEditingId(null); setEditingText(''); }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-semibold">
                        {t('common.cancel')}
                      </button>
                      <button onClick={() => handleUpdate(note.id)}
                        disabled={!editingText.trim() || updateNote.isPending}
                        className="text-xs text-white bg-primary px-3 py-1.5 rounded-md font-bold
                                   disabled:opacity-40 hover:bg-primary/90 transition-colors">
                        {t('common.save')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-800 leading-relaxed">{note.content}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-gray-400">
                        {usersMap[note.created_by_id] ?? '—'} · {new Date(note.created_at).toLocaleString('es-PE')}
                      </p>
                      {isOwner && (
                        <div className="flex gap-3">
                          <button onClick={() => { setEditingId(note.id); setEditingText(note.content); }}
                            className="text-gray-400 hover:text-primary transition-colors">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setConfirmDeleteId(note.id)}
                            className="text-gray-400 hover:text-danger transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-navy/50 flex items-center justify-center p-4"
          onClick={() => setConfirmDeleteId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 flex flex-col gap-4 shadow-modal"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-900">{t('webDash.deleteNoteTitle')}</p>
            <p className="text-xs text-gray-500">{t('webDash.deleteNoteWarning')}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDeleteId(null)}
                className="text-sm text-gray-500 font-semibold">
                {t('common.cancel')}
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleteNote.isPending}
                className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-bold
                           disabled:opacity-50 hover:bg-red-700 transition-colors">
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
