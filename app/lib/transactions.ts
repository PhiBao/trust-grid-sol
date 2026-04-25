import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PROGRAM_ID, USDC_MINT } from "./constants";

// Anchor discriminators (sha256("global:<name>")[0:8])
const DISC = {
  giveFeedback: Buffer.from([0x91, 0x88, 0x7b, 0x03, 0xd7, 0xa5, 0x62, 0x29]),
  createTask: Buffer.from([0xc2, 0x50, 0x06, 0xb4, 0xe8, 0x7f, 0x30, 0xab]),
  registerAgent: Buffer.from([0x87, 0x9d, 0x42, 0xc3, 0x02, 0x71, 0xaf, 0x1e]),
};

function toU64LE(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function toI64LE(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(BigInt(n), 0);
  return b;
}

function writeString(buf: string): Buffer {
  const bytes = Buffer.from(buf, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function getPda(seeds: Buffer[]): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(seeds, PROGRAM_ID);
  return pda;
}

// ───────────────────────────────────────────
// REGISTER AGENT
// ───────────────────────────────────────────

export async function buildRegisterAgentTx(
  connection: Connection,
  authority: PublicKey,
  agentUri: string,
  metadata: Record<string, string>
): Promise<{ tx: Transaction; agentId: number }> {
  const counterPda = getPda([Buffer.from("agent_counter")]);
  const counterInfo = await connection.getAccountInfo(counterPda);
  let currentCount = 0;
  if (counterInfo && counterInfo.data.length >= 16) {
    currentCount = Number(counterInfo.data.readBigUInt64LE(8));
  }
  const nextAgentId = currentCount + 1;

  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), authority.toBuffer(), toU64LE(nextAgentId)],
    PROGRAM_ID
  );

  // Encode metadata as Vec<(String, String)>
  const metaEntries = Object.entries(metadata);
  const metaEncoded = Buffer.concat(
    metaEntries.map(([k, v]) => Buffer.concat([writeString(k), writeString(v)]))
  );
  const metaLen = Buffer.alloc(4);
  metaLen.writeUInt32LE(metaEntries.length, 0);

  const data = Buffer.concat([
    DISC.registerAgent,
    writeString(agentUri),
    metaLen,
    metaEncoded,
  ]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: counterPda, isSigner: false, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = authority;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  return { tx, agentId: nextAgentId };
}

// ───────────────────────────────────────────
// FEEDBACK
// ───────────────────────────────────────────

export async function buildGiveFeedbackTx(
  connection: Connection,
  client: PublicKey,
  agentId: number,
  value: number,
  tag: string,
  authority: PublicKey
): Promise<Transaction> {
  const agentPda = getPda([
    Buffer.from("agent"),
    authority.toBuffer(),
    toU64LE(agentId),
  ]);

  const repPda = getPda([Buffer.from("reputation"), toU64LE(agentId)]);

  let feedbackCount = 0;
  const repInfo = await connection.getAccountInfo(repPda);
  if (repInfo && repInfo.data.length >= 40) {
    feedbackCount = Number(repInfo.data.readBigUInt64LE(32));
  }

  const [feedbackPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("feedback"),
      toU64LE(agentId),
      client.toBuffer(),
      toU64LE(feedbackCount),
    ],
    PROGRAM_ID
  );

  const data = Buffer.concat([DISC.giveFeedback, Buffer.from([value]), writeString(tag)]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: client, isSigner: true, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: false },
      { pubkey: repPda, isSigner: false, isWritable: true },
      { pubkey: feedbackPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = client;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  return tx;
}

// ───────────────────────────────────────────
// TASK CREATION
// ───────────────────────────────────────────

export async function buildCreateTaskTx(
  connection: Connection,
  client: PublicKey,
  agentId: number,
  amountUSDC: number,
  taskUri: string
): Promise<{ tx: Transaction; taskId: number; instructions: string[] }> {
  const tokenMint = USDC_MINT;

  const counterPda = getPda([Buffer.from("task_counter")]);
  const counterInfo = await connection.getAccountInfo(counterPda);
  let currentCount = 0;
  if (counterInfo && counterInfo.data.length >= 16) {
    currentCount = Number(counterInfo.data.readBigUInt64LE(8));
  }
  const nextTaskId = currentCount + 1;

  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), toU64LE(nextTaskId)],
    PROGRAM_ID
  );
  const [escrowVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_vault"), toU64LE(nextTaskId)],
    PROGRAM_ID
  );

  const clientATA = await getAssociatedTokenAddress(tokenMint, client, false);
  const ataInfo = await connection.getAccountInfo(clientATA);

  const tx = new Transaction();
  const instructions: string[] = [];

  // Create ATA if needed
  if (!ataInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        client,
        clientATA,
        client,
        tokenMint
      )
    );
    instructions.push("Create USDC token account");
  }

  const rawAmount = Math.round(amountUSDC * 1_000_000);
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const data = Buffer.concat([
    DISC.createTask,
    toU64LE(agentId),
    toU64LE(rawAmount),
    toI64LE(deadline),
    writeString(taskUri),
  ]);

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: client, isSigner: true, isWritable: true },
      { pubkey: counterPda, isSigner: false, isWritable: true },
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: tokenMint, isSigner: false, isWritable: true },
      { pubkey: clientATA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  });

  tx.add(ix);
  instructions.push("Create task with USDC escrow");

  tx.feePayer = client;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  return { tx, taskId: nextTaskId, instructions };
}

// ───────────────────────────────────────────
// ROBUST SEND (simulation + fallback)
// ───────────────────────────────────────────

export async function sendTxRobust(
  tx: Transaction,
  connection: Connection,
  walletAdapter: any
): Promise<string> {
  // 1. Simulate first to catch errors before wallet sees them
  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      const logs = sim.value.logs || [];
      const errLine = logs.find((l: string) => l.includes("Error") || l.includes("failed"));
      throw new Error(errLine || `Simulation failed: ${JSON.stringify(sim.value.err)}`);
    }
  } catch (e: any) {
    if (!e.message?.includes("Simulation failed")) {
      throw e;
    }
  }

  // 2. Try wallet adapter sendTransaction
  try {
    if (walletAdapter && typeof walletAdapter.sendTransaction === "function") {
      return await walletAdapter.sendTransaction(tx, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
    }
  } catch (e: any) {
    console.warn("wallet.adapter.sendTransaction failed:", e.message);
  }

  // 3. Fallback: sign manually + send raw
  if (!walletAdapter || typeof walletAdapter.signTransaction !== "function") {
    throw new Error("Wallet does not support signing transactions");
  }
  const signed = await walletAdapter.signTransaction(tx);
  const raw = signed.serialize();
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export async function getUSDCBalance(
  connection: Connection,
  owner: PublicKey
): Promise<number> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner, false);
  try {
    const info = await connection.getTokenAccountBalance(ata);
    return parseFloat(info.value.uiAmountString || "0");
  } catch {
    return 0;
  }
}

export async function getSOLBalance(
  connection: Connection,
  owner: PublicKey
): Promise<number> {
  try {
    const lamports = await connection.getBalance(owner);
    return lamports / 1e9;
  } catch {
    return 0;
  }
}

export async function getOrCreateUSDCATA(
  connection: Connection,
  owner: PublicKey
): Promise<{ ata: PublicKey; exists: boolean }> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner, false);
  const info = await connection.getAccountInfo(ata);
  return { ata, exists: !!info };
}
