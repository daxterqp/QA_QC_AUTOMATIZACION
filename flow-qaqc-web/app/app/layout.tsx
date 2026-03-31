'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  FolderKanban, LogOut, ChevronRight, Users, LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '@lib/auth-context';
import { cn, getInitials } from '@lib/utils';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
    }
  }, [loading, currentUser, router]);

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-primary font-semibold text-sm animate-pulse">Cargando...</div>
      </div>
    );
  }

  const isCreator = currentUser.role === 'CREATOR';

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const navLinks = [
    { href: '/app/projects', label: 'Proyectos', icon: FolderKanban },
    ...(isCreator ? [{ href: '/app/admin/users', label: 'Usuarios', icon: Users }] : []),
  ];

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Sidebar */}
      <aside className="w-56 bg-navy flex flex-col fixed top-0 left-0 h-full z-30 shadow-modal">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div
            className="text-white font-black tracking-widest text-2xl leading-none"
            style={{ fontFamily: 'Arial Black, Arial, sans-serif' }}
          >
            S<span className="text-secondary">-</span>CUA
          </div>
          <div className="text-light text-[9px] tracking-[0.25em] uppercase mt-0.5">
            Control de Calidad
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 flex flex-col gap-0.5 px-2">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
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
        </nav>

        {/* User */}
        <div className="border-t border-white/10 p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {getInitials(currentUser.name, currentUser.apellido)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{currentUser.name}</p>
            <p className="text-light text-[10px] truncate">{currentUser.role}</p>
          </div>
          <button
            onClick={handleSignOut}
            title="Cerrar sesión"
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
    </div>
  );
}
