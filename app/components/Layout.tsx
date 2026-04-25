import { useState } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { PROGRAM_ID_STRING } from '../lib/constants';
import WalletButton from './WalletButton';

interface LayoutProps {
  children: React.ReactNode;
}

const NAV = [
  { label: "Marketplace", path: "/" },
  { label: "Tasks", path: "/tasks" },
  { label: "Network", path: "/network" },
  { label: "Dashboard", path: "/dashboard" },
];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);

  const currentPath = router.pathname;

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Nav */}
      <nav className="apple-nav-global sticky top-0 z-50">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-11">
            {/* Logo */}
            <button
              onClick={() => router.push('/')}
              className="text-white font-display text-sm font-semibold tracking-tight-micro"
            >
              TrustGrid
            </button>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center space-x-1">
              {NAV.map((item) => {
                const active = currentPath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => router.push(item.path)}
                    className={`px-3 py-1.5 rounded-utility text-xs tracking-tight-micro transition-colors ${
                      active
                        ? 'text-white bg-white/10'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-3">
              <span className="hidden sm:inline text-micro text-white/40 tracking-tight-micro">Devnet</span>
              {connected && publicKey ? (
                <button
                  onClick={() => copyToClipboard(publicKey.toBase58())}
                  className="hidden sm:block text-white/80 text-xs tracking-tight-micro font-mono hover:text-white transition-colors"
                  title={publicKey.toBase58()}
                >
                  {publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}
                </button>
              ) : null}
              <div className="scale-90 origin-right">
                <WalletButton />
              </div>

              {/* Mobile hamburger */}
              <button
                className="md:hidden text-white p-1"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileOpen && (
            <div className="md:hidden pb-3 space-y-1">
              {NAV.map((item) => {
                const active = currentPath === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => { router.push(item.path); setMobileOpen(false); }}
                    className={`block w-full text-left px-3 py-2 rounded-utility text-xs tracking-tight-micro ${
                      active ? 'text-white bg-white/10' : 'text-white/70'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="apple-tile-parchment py-10 border-t border-hairline">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <FooterCol title="Explore" links={[
              { label: "Marketplace", href: "/", external: false },
              { label: "Task Board", href: "/tasks", external: false },
              { label: "Network", href: "/network", external: false },
            ]} />
            <FooterCol title="Developers" links={[
              { label: "GitHub", href: "https://github.com", external: true },
              { label: "x402 Spec", href: "https://x402.org", external: true },
            ]} />
            <FooterCol title="Resources" links={[
              { label: "Solana Docs", href: "https://solana.com/docs", external: true },
              { label: "Colosseum", href: "https://arena.colosseum.org", external: true },
              { label: "Anchor", href: "https://www.anchor-lang.com", external: true },
            ]} />
            <FooterCol title="Connect" links={[
              { label: "Twitter", href: "https://twitter.com", external: true },
              { label: "Discord", href: "https://discord.com", external: true },
            ]} />
          </div>
          <div className="pt-6 border-t border-hairline flex flex-col md:flex-row items-center justify-between gap-3">
            <p className="text-micro text-ink/40">
              TrustGrid — Colosseum Hackathon. On-chain at {PROGRAM_ID_STRING}.
            </p>
            <button
              onClick={() => copyToClipboard(PROGRAM_ID_STRING)}
              className="text-micro text-action-blue hover:underline"
            >
              Copy Program ID
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string; external: boolean }[] }) {
  const router = useRouter();

  return (
    <div>
      <h4 className="text-caption-strong text-ink mb-3">{title}</h4>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fine text-ink/60 hover:text-ink transition-colors"
              >
                {l.label}
              </a>
            ) : (
              <button
                onClick={() => router.push(l.href)}
                className="text-fine text-ink/60 hover:text-ink transition-colors"
              >
                {l.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
