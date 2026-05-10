import { Keypair, PublicKey, Transaction, Connection } from "@solana/web3.js";

const DELEGATE_KEY_STORAGE = "trustgrid_delegate_key";

export interface DelegateKey {
  publicKey: PublicKey;
  secretKey: Uint8Array;
}

/**
 * Generate or retrieve a delegated signing key for Agent Mode.
 * This key is stored in localStorage and can sign small transactions
 * on behalf of the main wallet without prompting the user.
 */
export function getOrCreateDelegateKey(): DelegateKey | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(DELEGATE_KEY_STORAGE);
    if (stored) {
      const secretKey = new Uint8Array(JSON.parse(stored));
      const keypair = Keypair.fromSecretKey(secretKey);
      return { publicKey: keypair.publicKey, secretKey };
    }

    // Generate new keypair
    const keypair = Keypair.generate();
    localStorage.setItem(
      DELEGATE_KEY_STORAGE,
      JSON.stringify(Array.from(keypair.secretKey))
    );
    return { publicKey: keypair.publicKey, secretKey: keypair.secretKey };
  } catch (e) {
    console.error("Failed to create delegate key:", e);
    return null;
  }
}

export function revokeDelegateKey(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DELEGATE_KEY_STORAGE);
}

export function isAgentModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("trustgrid_agent_mode") === "enabled";
}

export function setAgentMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    "trustgrid_agent_mode",
    enabled ? "enabled" : "disabled"
  );
}

/**
 * Sign a transaction with the delegate key.
 * This is used for MCP-initiated actions where the AI agent
 * hires another agent autonomously.
 */
export function signWithDelegate(
  tx: Transaction,
  connection: Connection
): Promise<string> | null {
  const delegate = getOrCreateDelegateKey();
  if (!delegate) return null;

  const keypair = Keypair.fromSecretKey(delegate.secretKey);
  tx.partialSign(keypair);

  return connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
}
