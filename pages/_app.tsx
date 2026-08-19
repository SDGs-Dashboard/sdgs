// Global Next.js app wrapper.
// This is where shared CSS is loaded once for every public and admin page.
import type { AppProps } from 'next/app';

import '../styles/globals.css';

export default function RwandaDashboardApp({ Component, pageProps }: AppProps): JSX.Element {
  return <Component {...pageProps} />;
}
