import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@lib/auth-context';
import { QueryProvider } from '@lib/query-client';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Flow-QA/QC',
  description: 'La calidad puesta en cada detalle',
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
