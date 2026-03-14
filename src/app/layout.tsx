import type { Metadata } from 'next';
import { ThemeProvider } from '../components/ThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'ARG0N · Creative Generation Engine · Renzo',
  description: 'AI-powered creative generation — video, image, audio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Fragment+Mono&display=swap" rel="stylesheet" />
        <link href="https://fonts.cdnfonts.com/css/opendyslexic" rel="stylesheet" />
      </head>
      <body className="font-sans min-h-screen bg-surface-0 text-white/90 antialiased">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
