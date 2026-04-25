// Type declarations to fix Solana wallet adapter compatibility with React 18

declare module '@solana/wallet-adapter-react' {
  import { ReactNode } from 'react';
  import { Connection, PublicKey } from '@solana/web3.js';
  import { Wallet } from '@solana/wallet-adapter-base';

  interface ConnectionProviderProps {
    children: ReactNode;
    endpoint: string;
    config?: any;
  }

  export function ConnectionProvider(props: ConnectionProviderProps): JSX.Element;

  interface WalletProviderProps {
    children: ReactNode;
    wallets: any[];
    autoConnect?: boolean;
    onError?: (error: Error) => void;
  }

  export function WalletProvider(props: WalletProviderProps): JSX.Element;

  export function useWallet(): {
    publicKey: PublicKey | null;
    wallet: Wallet | null;
    wallets: Wallet[];
    signMessage: ((message: Uint8Array) => Promise<Uint8Array>) | undefined;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    connected: boolean;
    connecting: boolean;
  };
}

declare module '@solana/wallet-adapter-react-ui' {
  import { ReactNode } from 'react';

  interface WalletModalProviderProps {
    children: ReactNode;
  }

  export function WalletModalProvider(props: WalletModalProviderProps): JSX.Element;

  export function WalletMultiButton(props: any): JSX.Element;
}
