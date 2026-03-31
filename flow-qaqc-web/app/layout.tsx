import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@lib/auth-context';
import { QueryProvider } from '@lib/query-client';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'S-CUA — Sistema de Control de Calidad',
  description: 'Sistema digital QA/QC para construcción',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={inter.className} style={{ margin: 0, padding: 0 }}>
        <QueryProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
