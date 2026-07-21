import type { Metadata } from 'next';
import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@lib/auth-context';
import { QueryProvider } from '@lib/query-client';
import { LanguageProvider } from '@lib/i18n';

const inter = Inter({ subsets: ['latin'] });
// v100l — Tipografía geométrica SOLO para los gráficos del Dashboard (espejo del
// móvil, que usa Poppins como sustituta libre de Century Gothic). Se expone como
// variable CSS y se aplica con la clase .chart-font.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '700'], style: ['normal', 'italic'], variable: '--font-chart' });

export const metadata: Metadata = {
  title: 'Flow-QA/QC',
  description: 'La calidad puesta en cada detalle',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} ${poppins.variable}`} style={{ margin: 0, padding: 0 }}>
        <QueryProvider>
          <LanguageProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
          </LanguageProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
