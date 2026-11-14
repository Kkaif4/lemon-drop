import './globals.css';
import type { Metadata, Viewport } from 'next';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'Lemon Drop 🍋 | Fast & Secure P2P File Transfer',
  description: 'Transfer large files directly peer-to-peer with zero size limits, end-to-end encryption, and no cloud uploads.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased selection:bg-yellow-400/30 selection:text-yellow-200 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10 md:py-12 w-full">
          <div className="w-full max-w-xl mx-auto">
            {children}
          </div>
        </main>
        <footer className="py-5 px-4 text-center text-xs text-neutral-500 border-t border-neutral-900/60 bg-neutral-950/80">
          <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span>Lemon Drop &bull; Peer-to-Peer</span>
            <span className="text-neutral-600">End-to-End Encrypted (AES-256-GCM)</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
