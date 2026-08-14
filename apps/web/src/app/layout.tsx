import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Projeto Isaura',
  description: 'Registro de aulas com alarmes.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Aulas',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icons/icone-192.png',
    apple: '/icons/icone-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2F4A9C',
  // `viewportFit: cover` é o que faz a área segura do iPhone valer — sem ele o
  // env(safe-area-inset-*) do CSS devolve zero.
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
