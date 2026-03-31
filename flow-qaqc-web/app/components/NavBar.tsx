'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function NavBar() {
  const pathname = usePathname()

  const links = [
    { href: '/infografia', label: '📊 Infografía' },
    { href: '/walkthrough', label: '📱 Flujo de Uso' },
  ]

  return (
    <nav style={{
      background: '#080F1A',
      borderBottom: '1px solid rgba(14,116,144,0.3)',
      padding: '0 40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      height: '56px',
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none' }}>
        <span style={{
          fontFamily: 'Arial Black, Arial, sans-serif',
          fontSize: '18px',
          fontWeight: 900,
          color: '#FFFFFF',
          letterSpacing: '-0.5px',
        }}>
          Flow-<span style={{ color: '#22D3EE' }}>QA/QC</span>
        </span>
      </Link>

      {/* Nav links */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {links.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link key={href} href={href} style={{
              textDecoration: 'none',
              padding: '6px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.3px',
              background: active ? 'rgba(14,116,144,0.25)' : 'transparent',
              color: active ? '#22D3EE' : 'rgba(255,255,255,0.5)',
              border: active ? '1px solid rgba(14,116,144,0.4)' : '1px solid transparent',
              transition: 'all 0.2s',
            }}>
              {label}
            </Link>
          )
        })}
      </div>

      {/* CTA button */}
      <a
        href="mailto:contacto@flowqaqc.com"
        style={{
          background: '#F97316',
          color: '#fff',
          padding: '7px 20px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 900,
          letterSpacing: '1px',
          textTransform: 'uppercase',
          textDecoration: 'none',
          fontFamily: 'Arial Black, Arial, sans-serif',
        }}
      >
        Solicitar Demo
      </a>
    </nav>
  )
}
