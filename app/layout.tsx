import type { Metadata } from 'next';
import './globals.css';
import { ServiceWorkerRegistrar } from './components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: 'Whiteboard',
  description: 'Interactive whiteboard',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
