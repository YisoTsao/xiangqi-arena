import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/Toaster';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Xiangqi Arena 象棋競技場', template: '%s · Xiangqi Arena' },
  description: '精緻 2.5D 線上象棋與暗棋對戰，免註冊建立私人房間與朋友即時對弈。',
  applicationName: 'Xiangqi Arena',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#0f1420',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant-TW">
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
