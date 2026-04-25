import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { WalletProviders } from '../components/WalletProviders';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <WalletProviders>
      <Component {...pageProps} />
    </WalletProviders>
  );
}
