import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Deriv Trading Agent',
  description: 'Autonomous AI forex trading agent powered by Claude + Deriv demo API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
