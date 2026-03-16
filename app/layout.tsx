import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Math Whiteboard',
  description: 'Interactive whiteboard for mathematics teaching',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
