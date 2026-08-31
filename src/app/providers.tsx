'use client';

import { Provider } from 'react-redux';
import { store } from '@/store';

/**
 * Client-side Redux Provider wrapper.
 * Next.js App Router's RootLayout is a server component, so the Redux
 * Provider must be isolated in a client component and composed here.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
}
