import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE"
);

export const PROGRAM_ID_STRING = PROGRAM_ID.toBase58();

export const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
