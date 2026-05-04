import type {Metadata} from 'next';
import './globals.css'; // Global styles
import { AuthProvider } from '@/hooks/use-auth';

export const metadata: Metadata = {
  title: 'Lista Plus',
  description: 'Gerencie suas listas de compras de forma inteligente.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lista Plus',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#000000',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body suppressHydrationWarning className="bg-slate-50 text-slate-900 font-sans min-h-screen">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
