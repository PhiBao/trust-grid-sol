import { Keypair, PublicKey } from "@solana/web3.js";

const STORAGE_KEY = "trustgrid_agent_wallets";

interface StoredAgentWallet {
  agentId: number;
  publicKey: string;
  secretKey: number[];
  registeredAt: number;
}

/**
 * Generate a new agent keypair.
 * The agent's keypair IS its identity — it signs its own transactions.
 */
export function generateAgentKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Store an agent keypair in localStorage.
 * Called after registration — the keypair is linked to the agent ID.
 */
export function storeAgentWallet(agentId: number, keypair: Keypair): void {
  if (typeof window === "undefined") return;
  const wallets = getStoredWallets();
  wallets[agentId] = {
    agentId,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey),
    registeredAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

/**
 * Get all stored agent wallets.
 */
export function getStoredWallets(): Record<number, StoredAgentWallet> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Get a specific agent's keypair by ID.
 */
export function getAgentKeypair(agentId: number): Keypair | null {
  const wallets = getStoredWallets();
  const stored = wallets[agentId];
  if (!stored) return null;
  return Keypair.fromSecretKey(new Uint8Array(stored.secretKey));
}

/**
 * Get all stored agent public keys.
 */
export function getAgentPublicKeys(): { agentId: number; publicKey: string }[] {
  const wallets = getStoredWallets();
  return Object.values(wallets).map((w) => ({
    agentId: w.agentId,
    publicKey: w.publicKey,
  }));
}

/**
 * Remove an agent wallet from storage.
 */
export function removeAgentWallet(agentId: number): void {
  if (typeof window === "undefined") return;
  const wallets = getStoredWallets();
  delete wallets[agentId];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
}

/**
 * Download a keypair as a JSON file.
 * Only call this ONCE — right after generation.
 */
export function downloadKeypair(keypair: Keypair, filename?: string): void {
  const secretArray = Array.from(keypair.secretKey);
  const blob = new Blob([JSON.stringify(secretArray)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `agent-${keypair.publicKey.toBase58().slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Check if a keypair file is valid.
 */
export function isValidKeypairFile(content: string): boolean {
  try {
    const arr = JSON.parse(content);
    return Array.isArray(arr) && arr.length === 64;
  } catch {
    return false;
  }
}

/**
 * Parse a keypair from a JSON file content.
 */
export function parseKeypairFile(content: string): Keypair | null {
  try {
    const arr = JSON.parse(content);
    if (!Array.isArray(arr) || arr.length !== 64) return null;
    return Keypair.fromSecretKey(new Uint8Array(arr));
  } catch {
    return null;
  }
}
