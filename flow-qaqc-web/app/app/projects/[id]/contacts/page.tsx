'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Phone, Plus, X, Pencil, Trash2, User, Briefcase, Search, Check,
} from 'lucide-react';
import PageHeader from '@components/PageHeader';
import { useProjects } from '@hooks/useProjects';
import {
  useContacts, useCreateContact, useUpdateContact, useDeleteContact,
} from '@hooks/useContacts';
import { cn } from '@lib/utils';
import type { PhoneContact } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return raw;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const { data: projects = [] } = useProjects();
  const project = projects.find(p => p.id === projectId);

  const { data: contacts = [], isLoading } = useContacts(projectId);

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<PhoneContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PhoneContact | null>(null);

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.role ?? '').toLowerCase().includes(q)
    );
  });

  function openEdit(c: PhoneContact) {
    setEditTarget(c);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditTarget(null);
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PageHeader
        title={project?.name ?? 'Proyecto'}
        subtitle={`${contacts.length} contacto${contacts.length !== 1 ? 's' : ''}`}
        crumbs={[
          { label: 'Proyectos', href: '/app/projects' },
          { label: project?.name ?? '...', href: `/app/projects/${projectId}/locations` },
          { label: 'Contactos' },
        ]}
        syncing={isLoading}
        rightContent={
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-primary text-white hover:bg-primary/90 transition"
          >
            <Plus size={14} />
            Nuevo
          </button>
        }
      />

      {/* Search */}
      <div className="bg-white border-b border-divider px-4 py-2.5 flex items-center gap-2">
        <Search size={14} className="text-[#8896a5] flex-shrink-0" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o cargo..."
          className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-sm text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[#8896a5] hover:text-navy transition">
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 p-4 flex flex-col gap-2.5">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl h-[72px] animate-pulse border border-gray-100" />
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <Phone size={36} className="text-[#8896a5]" />
            <p className="text-[#8896a5] font-semibold text-sm text-center">
              {contacts.length === 0
                ? 'No hay contactos aún.\nPresiona "Nuevo" para agregar uno.'
                : 'Sin resultados para la búsqueda.'}
            </p>
          </div>
        ) : (
          filtered.map(contact => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => openEdit(contact)}
              onDelete={() => setDeleteTarget(contact)}
            />
          ))
        )}
      </div>

      {/* Add / Edit form modal */}
      {showForm && (
        <ContactFormModal
          projectId={projectId}
          contact={editTarget}
          onClose={closeForm}
        />
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          contact={deleteTarget}
          projectId={projectId}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

// ── Contact Card ──────────────────────────────────────────────────────────────

function ContactCard({
  contact, onEdit, onDelete,
}: {
  contact: PhoneContact;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-white rounded-xl shadow-subtle border border-transparent p-4 flex items-center gap-3 hover:shadow-card hover:border-primary/20 transition group">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <User size={18} className="text-primary" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-navy font-semibold text-sm leading-tight truncate">
          {contact.name}
        </p>
        <div className="flex items-center gap-3 mt-0.5">
          <a
            href={`tel:${contact.phone}`}
            className="flex items-center gap-1 text-[12px] text-primary font-medium hover:underline"
            onClick={e => e.stopPropagation()}
          >
            <Phone size={11} />
            {formatPhone(contact.phone)}
          </a>
          {contact.role && (
            <span className="flex items-center gap-1 text-[11px] text-[#8896a5]">
              <Briefcase size={10} />
              {contact.role}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-[#8896a5] hover:text-primary hover:bg-primary/10 transition"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-[#8896a5] hover:text-danger hover:bg-danger/10 transition"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Form Modal ────────────────────────────────────────────────────────────────

function ContactFormModal({
  projectId, contact, onClose,
}: {
  projectId: string;
  contact: PhoneContact | null;
  onClose: () => void;
}) {
  const isEdit = !!contact;
  const createMut = useCreateContact(projectId);
  const updateMut = useUpdateContact(projectId);

  const [name, setName] = useState(contact?.name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [role, setRole] = useState(contact?.role ?? '');
  const [error, setError] = useState('');

  const loading = createMut.isPending || updateMut.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!phone.trim()) { setError('El teléfono es obligatorio.'); return; }

    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: contact!.id, name, phone, role: role || null });
      } else {
        await createMut.mutateAsync({ name, phone, role: role || null });
      }
      onClose();
    } catch {
      setError('Error al guardar. Intenta nuevamente.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-divider">
          <h2 className="font-bold text-navy text-base">
            {isEdit ? 'Editar contacto' : 'Nuevo contacto'}
          </h2>
          <button onClick={onClose} className="text-[#8896a5] hover:text-navy transition">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
          <Field label="Nombre *">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej. Juan Pérez"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              autoFocus
            />
          </Field>
          <Field label="Teléfono *">
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Ej. 999 123 456"
              type="tel"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
          </Field>
          <Field label="Cargo">
            <input
              value={role}
              onChange={e => setRole(e.target.value)}
              placeholder="Ej. Residente de obra"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-navy placeholder:text-[#8896a5] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
          </Field>

          {error && (
            <p className="text-danger text-xs font-medium">{error}</p>
          )}

          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-[#4a5568] hover:bg-surface transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={cn(
                'flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition flex items-center justify-center gap-1.5',
                loading ? 'bg-primary/60' : 'bg-primary hover:bg-primary/90'
              )}
            >
              {loading ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full" />
              ) : (
                <>
                  <Check size={14} />
                  {isEdit ? 'Guardar cambios' : 'Agregar'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  contact, projectId, onClose,
}: {
  contact: PhoneContact;
  projectId: string;
  onClose: () => void;
}) {
  const deleteMut = useDeleteContact(projectId);

  async function handleDelete() {
    await deleteMut.mutateAsync(contact.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-danger" />
          </div>
          <div>
            <p className="font-bold text-navy text-sm">Eliminar contacto</p>
            <p className="text-[#8896a5] text-xs mt-0.5">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        <div className="bg-surface rounded-lg px-4 py-3">
          <p className="font-semibold text-navy text-sm">{contact.name}</p>
          <p className="text-[#8896a5] text-xs">{formatPhone(contact.phone)}</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-[#4a5568] hover:bg-surface transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMut.isPending}
            className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-bold hover:bg-red-700 transition disabled:opacity-60"
          >
            {deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-[#4a5568] uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}
