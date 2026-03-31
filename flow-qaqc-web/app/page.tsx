import { redirect } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  redirect('/login');
}

// ── Página de marketing (referencia visual, no exportada por Next.js) ─────────
function _LandingPage() {
  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: 'linear-gradient(160deg, #0D2B45 0%, #0E3D5C 50%, #0A2540 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 40px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(14,116,144,0.07) 1px,transparent 1px), linear-gradient(90deg,rgba(14,116,144,0.07) 1px,transparent 1px)',
        backgroundSize: '48px 48px',
        pointerEvents: 'none',
      }} />
      {/* Glow */}
      <div style={{
        position: 'absolute', top: '-100px', right: '-100px',
        width: '500px', height: '500px',
        background: 'radial-gradient(circle, rgba(14,116,144,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', textAlign: 'center', maxWidth: '700px' }}>
        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          background: 'rgba(14,116,144,0.2)', border: '1px solid rgba(14,116,144,0.5)',
          borderRadius: '20px', padding: '5px 18px', marginBottom: '24px',
          fontSize: '11px', fontWeight: 700, letterSpacing: '2px',
          textTransform: 'uppercase', color: '#22D3EE',
        }}>
          <span style={{ width: 7, height: 7, background: '#22D3EE', borderRadius: '50%', display: 'inline-block' }} />
          Sistema Digital QA/QC · Construcción 4.0
        </div>

        {/* Title */}
        <h1 style={{
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: 'clamp(42px, 8vw, 64px)',
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1,
          marginBottom: '8px',
        }}>
          Flow-<span style={{ color: '#22D3EE' }}>QA/QC</span>
        </h1>

        <p style={{
          fontSize: '13px', fontWeight: 700, letterSpacing: '3px',
          textTransform: 'uppercase', color: '#CBD5E1', marginBottom: '20px',
        }}>
          Modernización del Aseguramiento de Calidad en Obra
        </p>

        <p style={{
          fontSize: '16px', color: 'rgba(255,255,255,0.65)',
          lineHeight: 1.7, marginBottom: '48px',
        }}>
          Gestión Digital Integral. Cero Papel. Trazabilidad Absoluta.<br />
          Diseñado para Ingenieros, Supervisores QA/QC y Gerentes de Proyecto.
        </p>

        {/* Cards */}
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/infografia" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'rgba(14,116,144,0.12)',
              border: '1px solid rgba(14,116,144,0.3)',
              borderRadius: '16px',
              padding: '32px 36px',
              width: '240px',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>📊</div>
              <div style={{
                fontFamily: 'Arial Black, Arial, sans-serif',
                fontSize: '16px', fontWeight: 900, color: '#fff', marginBottom: '8px',
              }}>
                Infografía
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                Las 7 funcionalidades estratégicas del sistema
              </div>
              <div style={{
                marginTop: '16px', display: 'inline-block',
                background: 'rgba(14,116,144,0.3)', borderRadius: '6px',
                padding: '5px 14px', fontSize: '11px', fontWeight: 700,
                color: '#22D3EE', letterSpacing: '1px',
              }}>
                VER →
              </div>
            </div>
          </Link>

          <Link href="/walkthrough" style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'rgba(249,115,22,0.1)',
              border: '1px solid rgba(249,115,22,0.3)',
              borderRadius: '16px',
              padding: '32px 36px',
              width: '240px',
              textAlign: 'center',
              cursor: 'pointer',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '14px' }}>📱</div>
              <div style={{
                fontFamily: 'Arial Black, Arial, sans-serif',
                fontSize: '16px', fontWeight: 900, color: '#fff', marginBottom: '8px',
              }}>
                Flujo de Uso
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
                Walkthrough completo con pantallas reales de la app
              </div>
              <div style={{
                marginTop: '16px', display: 'inline-block',
                background: 'rgba(249,115,22,0.25)', borderRadius: '6px',
                padding: '5px 14px', fontSize: '11px', fontWeight: 700,
                color: '#FB923C', letterSpacing: '1px',
              }}>
                VER →
              </div>
            </div>
          </Link>
        </div>

        {/* Pills */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '40px' }}>
          {['📱 Móvil + Web', '🔌 Offline-First', '📍 GPS + Timestamp', '⚡ Tiempo Real', '🛡️ Auditoría Blindada'].map(p => (
            <div key={p} style={{
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '20px', padding: '5px 14px', fontSize: '11px',
              color: 'rgba(255,255,255,0.6)', fontWeight: 600,
            }}>{p}</div>
          ))}
        </div>
      </div>
    </div>
  )
}
