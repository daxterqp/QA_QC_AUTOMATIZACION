'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@lib/utils';

interface Crumb { label: string; href?: string }

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  crumbs?: Crumb[];
  syncing?: boolean;
  rightContent?: React.ReactNode;
  backHref?: string;
}

export default function PageHeader({
  title, subtitle, crumbs, syncing, rightContent, backHref,
}: PageHeaderProps) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  useEffect(() => {
    // Check if there's history to go back/forward
    setCanGoBack(window.history.length > 1);
    // Forward detection: try to track via popstate
    const check = () => {
      setCanGoBack(window.history.length > 1);
    };
    window.addEventListener('popstate', check);
    return () => window.removeEventListener('popstate', check);
  }, []);

  return (
    <div className="px-6 pt-5 pb-4 flex flex-col gap-1 relative overflow-hidden" style={{ background: 'linear-gradient(to right, #0e213d 60%, #0c3d45 100%)' }}>


      {/* Glow de fondo — aurora radial */}
      <div className="absolute top-0 right-0 w-[70%] h-full" style={{
        background: 'radial-gradient(ellipse 60% 100% at 85% 50%, rgba(0,188,180,0.07) 0%, rgba(79,195,247,0.06) 40%, transparent 70%)',
        animation: 'flowPulseGlow 8s ease-in-out infinite',
      }} />

      {/* Ondas animadas "Flow" */}
      <div className="absolute top-0 right-0 w-[50%] h-full overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 40%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 40%)' }}>

        {/* Capa A: 3 líneas hacia derecha */}
        <svg className="flow-layer flow-a1 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
          <path d="M0,15 Q50,1 100,13 Q150,27 200,17 Q250,3 300,15 Q350,29 400,13 Q450,1 500,17 Q550,31 600,15 Q650,3 700,13 Q750,27 800,17" stroke="rgba(79,195,247,0.06)" strokeWidth="6"/>
        </svg>
        <svg className="flow-layer flow-a2 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
          <path d="M0,50 Q50,34 100,48 Q150,64 200,52 Q250,36 300,50 Q350,66 400,48 Q450,34 500,52 Q550,68 600,50 Q650,36 700,48 Q750,64 800,52" stroke="rgba(0,188,180,0.05)" strokeWidth="7"/>
        </svg>
        <svg className="flow-layer flow-a3 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
          <path d="M0,90 Q50,74 100,88 Q150,104 200,92 Q250,76 300,90 Q350,106 400,88 Q450,74 500,92 Q550,108 600,90 Q650,76 700,88 Q750,104 800,92" stroke="rgba(79,195,247,0.07)" strokeWidth="6"/>
        </svg>

        {/* Capa B: 3 líneas en reversa, desfasadas verticalmente */}
        <svg className="flow-layer flow-b1 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
          <path d="M0,28 Q60,12 120,26 Q180,42 240,30 Q300,14 360,28 Q420,44 480,26 Q540,12 600,30 Q660,46 720,28 Q780,14 800,26" stroke="rgba(0,188,180,0.07)" strokeWidth="6"/>
        </svg>
        <svg className="flow-layer flow-b2 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
          <path d="M0,65 Q60,48 120,62 Q180,78 240,66 Q300,50 360,65 Q420,80 480,62 Q540,48 600,66 Q660,82 720,65 Q780,50 800,62" stroke="rgba(79,195,247,0.06)" strokeWidth="7"/>
        </svg>
        <svg className="flow-layer flow-b3 absolute inset-0 w-[200%] h-full" viewBox="0 0 800 120" preserveAspectRatio="none" fill="none" style={{ filter: 'blur(3px)' }}>
          <path d="M0,105 Q60,88 120,102 Q180,118 240,106 Q300,90 360,105 Q420,120 480,102 Q540,88 600,106 Q660,120 720,105 Q780,90 800,102" stroke="rgba(0,188,180,0.05)" strokeWidth="6"/>
        </svg>

      </div>
      {/* Breadcrumb */}
      {crumbs && crumbs.length > 0 && (
        <div className="flex items-center gap-2 mb-1 relative z-10">
          {/* Back / Forward arrows (Chrome-style) */}
          <div className="flex items-center gap-0.5 -ml-2">
            <button
              onClick={() => canGoBack && router.back()}
              className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center transition',
                canGoBack
                  ? 'text-light/80 hover:bg-white/15 hover:text-white cursor-pointer'
                  : 'text-light/15 cursor-default'
              )}
              title="Atrás"
            >
              <ArrowLeft size={16} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => window.history.forward()}
              className="w-7 h-7 rounded-full flex items-center justify-center text-light/15 cursor-default"
              title="Adelante"
            >
              <ArrowRight size={16} strokeWidth={2.5} />
            </button>
          </div>
          {/* Breadcrumb (informativo, no clickeable) */}
          <div className="flex items-center gap-1">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-light/40 text-[10px]">/</span>}
                <span className="text-light/50 text-[11px] font-medium">{c.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Title row */}
      <div className="flex items-center justify-between gap-3 relative z-10">
        <div className="flex-1 min-w-0">
          <h1 className="text-white text-lg font-black tracking-wide truncate leading-tight">{title}</h1>
          {(subtitle || syncing) && (
            <p className="text-light/80 text-xs mt-0.5 flex items-center gap-1.5">
              {syncing && <Loader2 size={11} className="animate-spin" />}
              {syncing ? 'Sincronizando...' : subtitle}
            </p>
          )}
        </div>
        {rightContent && (
          <div className="flex items-center gap-2 flex-shrink-0">{rightContent}</div>
        )}
      </div>
    </div>
  );
}
