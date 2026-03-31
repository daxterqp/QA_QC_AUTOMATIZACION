'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Plus, Search, FolderOpen, MapPin, BookOpen,
  BarChart2, Upload, Phone, LogIn, X, Loader2,
} from 'lucide-react';
import { useProjects, useCreateProject, useJoinProject } from '@hooks/useProjects';
import { useAuth } from '@lib/auth-context';
import { cn, formatDate } from '@lib/utils';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const { currentUser } = useAuth();
  const { data: projects = [], isLoading } = useProjects();
  const createProject = useCreateProject();
  const joinProject = useJoinProject();

  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [joinId, setJoinId] = useState('');

  const isJefe = currentUser?.role === 'RESIDENT' || currentUser?.role === 'CREATOR';
  const isCreator = currentUser?.role === 'CREATOR';

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject.mutateAsync(newName.trim());
    setNewName('');
    setShowNewModal(false);
  };

  const handleJoin = async () => {
    if (!joinId.trim()) return;
    await joinProject.mutateAsync(joinId.trim());
    setJoinId('');
    setShowJoinModal(false);
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-navy px-6 pt-6 pb-5">
        <h1 className="text-white text-xl font-black tracking-wide">Mis Proyectos</h1>
        <p className="text-light text-xs mt-0.5">
          {projects.length} proyecto{projects.length !== 1 ? 's' : ''} disponible{projects.length !== 1 ? 's' : ''}
        </p>

        {/* Buscador */}
        <div className="mt-4 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8896a5]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar proyecto..."
            className="w-full bg-white/10 border border-white/20 rounded-md pl-8 pr-3 py-2.5 text-sm text-white placeholder:text-light/60 focus:outline-none focus:bg-white/15 transition"
          />
        </div>
      </div>

      {/* Lista */}
      <div className="p-4 flex flex-col gap-3 pb-10">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <FolderOpen size={40} className="text-[#8896a5]" />
            <p className="text-[#8896a5] font-semibold">
              {search ? 'Sin resultados' : 'Sin proyectos aún'}
            </p>
          </div>
        ) : (
          filtered.map(project => (
            <ProjectCard key={project.id} project={project} isJefe={isJefe} />
          ))
        )}
      </div>

      {/* FAB / Bottom actions */}
      <div className="fixed bottom-6 right-6 flex flex-col gap-2 items-end z-20">
        {isCreator && (
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 bg-primary text-white rounded-full px-5 py-3 text-sm font-bold shadow-modal hover:bg-navy transition"
          >
            <Plus size={16} />
            Nuevo proyecto
          </button>
        )}
        <button
          onClick={() => setShowJoinModal(true)}
          className="flex items-center gap-2 bg-white border border-border text-primary rounded-full px-5 py-3 text-sm font-bold shadow-card hover:bg-surface transition"
        >
          <LogIn size={16} />
          Unirse
        </button>
      </div>

      {/* Modal Nuevo Proyecto */}
      {showNewModal && (
        <Modal title="Nuevo Proyecto" onClose={() => setShowNewModal(false)}>
          <label className="text-[11px] font-bold text-[#4a5568] uppercase tracking-wider">
            Nombre del proyecto *
          </label>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Ej: Edificio Torre Norte"
            className="border border-border rounded-md px-3.5 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30 mt-1.5"
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowNewModal(false)}
              className="flex-1 border border-border rounded-md py-3 text-sm font-semibold text-[#4a5568] hover:bg-surface transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createProject.isPending}
              className="flex-1 bg-primary text-white rounded-md py-3 text-sm font-bold disabled:opacity-50 hover:bg-navy transition"
            >
              {createProject.isPending ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Unirse */}
      {showJoinModal && (
        <Modal title="Unirse a Proyecto" onClose={() => setShowJoinModal(false)}>
          <label className="text-[11px] font-bold text-[#4a5568] uppercase tracking-wider">
            ID del proyecto
          </label>
          <input
            autoFocus
            value={joinId}
            onChange={e => setJoinId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            placeholder="Pega el ID del proyecto"
            className="border border-border rounded-md px-3.5 py-3 text-sm text-navy focus:outline-none focus:ring-2 focus:ring-primary/30 mt-1.5 font-mono text-xs"
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowJoinModal(false)}
              className="flex-1 border border-border rounded-md py-3 text-sm font-semibold text-[#4a5568] hover:bg-surface transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleJoin}
              disabled={!joinId.trim() || joinProject.isPending}
              className="flex-1 bg-primary text-white rounded-md py-3 text-sm font-bold disabled:opacity-50 hover:bg-navy transition"
            >
              {joinProject.isPending ? 'Uniéndose...' : 'Unirse'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Tarjeta de proyecto ──────────────────────────────────────────────────────
function ProjectCard({ project, isJefe }: { project: Project; isJefe: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Chip = { href: string; icon: any; label: string; iconOnly?: boolean };

  const chips: Chip[] = [
    { href: `/app/projects/${project.id}/locations`, icon: MapPin, label: 'Ubicaciones' },
    { href: `/app/projects/${project.id}/historical`, icon: BarChart2, label: 'Dashboard' },
    { href: `/app/projects/${project.id}/dossier`, icon: BookOpen, label: 'Dossier' },
    { href: `/app/projects/${project.id}/contacts`, icon: Phone, label: '', iconOnly: true },
  ];

  const adminChips: Chip[] = isJefe ? [
    { href: `/app/projects/${project.id}/file-upload`, icon: Upload, label: 'Cargar' },
  ] : [];

  return (
    <div className="bg-white rounded-xl shadow-card p-4 flex flex-col gap-3">
      {/* Nombre */}
      <div className="flex items-start gap-2">
        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FolderOpen size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-navy font-bold text-[15px] leading-tight truncate">{project.name}</h2>
          <p className="text-[#8896a5] text-[11px] mt-0.5">
            Creado {formatDate(project.created_at)}
          </p>
        </div>
      </div>

      {/* Chips de acciones */}
      <div className="flex gap-1.5 flex-wrap">
        {[...chips, ...adminChips].map(chip => (
          <Link
            key={chip.href}
            href={chip.href}
            className={cn(
              'flex items-center gap-1.5 bg-surface border border-border rounded-md py-2 text-[12px] font-semibold text-navy hover:bg-primary hover:text-white hover:border-primary transition',
              chip.iconOnly ? 'px-2.5' : 'px-3'
            )}
          >
            <chip.icon size={13} />
            {chip.label && <span>{chip.label}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Modal genérico ────────────────────────────────────────────────────────────
function Modal({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-navy/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-sm p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-navy font-bold text-base">{title}</h3>
          <button onClick={onClose} className="text-[#8896a5] hover:text-navy transition">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
