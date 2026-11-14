import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";

const siteUrl = "https://kkaif4.github.io/lemon-drop";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Lemon Drop | Fast & Secure P2P File Transfer",
    template: "%s | Lemon Drop",
  },
  description:
    "Transfer large files directly peer-to-peer with zero size limits, end-to-end encryption (AES-256-GCM), and no cloud uploads or storage middleman.",
  keywords: [
    "P2P file transfer",
    "peer to peer",
    "WebRTC file transfer",
    "encrypted file sharing",
    "end to end encryption",
    "send large files free",
    "direct file transfer",
    "E2EE file transfer",
    "browser file transfer",
    "Lemon Drop",
  ],
  authors: [{ name: "Lemon Drop Team" }],
  creator: "Lemon Drop",
  publisher: "Lemon Drop",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Lemon Drop",
    title: "Lemon Drop | Fast & Secure P2P File Transfer",
    description:
      "Transfer files of any size directly between devices over encrypted WebRTC. Zero cloud storage, 100% private.",
    images: [
      {
        url: "/icon.png",
        width: 512,
        height: 512,
        alt: "Lemon Drop Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Lemon Drop | Fast & Secure P2P File Transfer",
    description:
      "Transfer files of any size directly between devices over encrypted WebRTC. Zero cloud storage, 100% private.",
    images: ["/icon.png"],
  },
  verification: {
    google: "oOA_X9Q4PfrMq-Nj16XWTZcf4zm29sHTwKSN_0vKw5A",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="./icon.png" />
        <meta
          name="google-site-verification"
          content="oOA_X9Q4PfrMq-Nj16XWTZcf4zm29sHTwKSN_0vKw5A"
        />
      </head>
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased selection:bg-yellow-400/30 selection:text-yellow-200 flex flex-col justify-between">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10 md:py-12 w-full">
          <div className="w-full max-w-xl mx-auto">{children}</div>
        </main>
        <footer className="py-6 px-4 text-xs text-neutral-500 border-t border-neutral-900/60 bg-neutral-950/80">
          <div className="max-w-xl mx-auto flex flex-col gap-3">
            <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-neutral-400">
              <Link
                href="/how-it-works"
                className="hover:text-yellow-400 transition-colors"
              >
                How It Works
              </Link>
              <span>&bull;</span>
              <Link
                href="/security"
                className="hover:text-yellow-400 transition-colors"
              >
                Security
              </Link>
              <span>&bull;</span>
              <Link
                href="/privacy"
                className="hover:text-yellow-400 transition-colors"
              >
                Privacy
              </Link>
              <span>&bull;</span>
              <Link
                href="/about"
                className="hover:text-yellow-400 transition-colors"
              >
                About
              </Link>
            </nav>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-[11px] text-neutral-500 pt-2 border-t border-neutral-900/40">
              <span>Lemon Drop &bull; Peer-to-Peer</span>
              <span className="text-neutral-600">
                End-to-End Encrypted (AES-256-GCM)
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
