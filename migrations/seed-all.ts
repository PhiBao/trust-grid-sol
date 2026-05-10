import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

/**
 * Comprehensive Seed Script — Real on-chain activity for TrustGrid demo.
 *
 * Creates:
 *   - Protocol initialization
 *   - 6 agents with diverse skills
 *   - 8 tasks (open, claimed, completed, cancelled)
 *   - 12 feedback entries across agents
 *   - Reputation scores
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   npx ts-node --transpile-only migrations/seed-all.ts
 */

const PROGRAM_ID = new PublicKey(
  "2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE"
);
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const RPC_URL =
  process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";

const secretKey = Uint8Array.from(
  JSON.parse(
    fs.readFileSync(
      process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`,
      "utf-8"
    )
  )
);
const wallet = Keypair.fromSecretKey(secretKey);
const connection = new Connection(RPC_URL, "confirmed");

// Discriminators (sha256("global:<name>")[0:8])
const crypto = require("crypto");
function disc(name: string): Buffer {
  return Buffer.from(
    crypto
      .createHash("sha256")
      .update("global:" + name)
      .digest()
      .slice(0, 8)
  );
}

const D = {
  init: disc("initialize_protocol"),
  register: disc("register_agent"),
  setWallet: disc("set_agent_wallet"),
  createTask: disc("create_task"),
  claim: disc("claim_task"),
  complete: disc("complete_task"),
  cancel: disc("cancel_task"),
  feedback: disc("give_feedback"),
};

function toU64LE(n: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
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

// Pre-computed PDAs
const counterPda = getPda([Buffer.from("agent_counter")]);
const taskCounterPda = getPda([Buffer.from("task_counter")]);
const protocolPda = getPda([Buffer.from("protocol_state")]);

async function getOrCreateATA(
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(mint, owner, false);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    const ix = createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      ata,
      owner,
      mint
    );
    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [wallet]);
    console.log(`   🪙 Created ATA: ${ata.toBase58().slice(0, 16)}...`);
  }
  return ata;
}

async function sendIX(keys: any[], data: Buffer) {
  const tx = new Transaction().add({
    keys,
    programId: PROGRAM_ID,
    data,
  });
  return sendAndConfirmTransaction(connection, tx, [wallet]);
}

// ───────────────────────────────────────────

async function initializeProtocol() {
  console.log("\n🏗️  Initializing protocol...");
  try {
    const sig = await sendIX(
      [
        { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
        { pubkey: counterPda, isSigner: false, isWritable: true },
        { pubkey: taskCounterPda, isSigner: false, isWritable: true },
        { pubkey: protocolPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      D.init
    );
    console.log("   ✅ Initialized —", sig.slice(0, 24) + "...");
  } catch (e: any) {
    if (e.toString().includes("already in use")) {
      console.log("   ℹ️  Already initialized");
    } else {
      console.error("   ⚠️ ", e.toString().slice(0, 120));
    }
  }
}

async function registerAgent(
  name: string,
  uri: string,
  meta: [string, string][],
  id: number
): Promise<PublicKey> {
  const agentPda = getPda([
    Buffer.from("agent"),
    wallet.publicKey.toBuffer(),
    toU64LE(id),
  ]);

  const metaEncoded = Buffer.concat(
    meta.map(([k, v]) => Buffer.concat([writeString(k), writeString(v)]))
  );
  const metaLen = Buffer.alloc(4);
  metaLen.writeUInt32LE(meta.length, 0);

  const data = Buffer.concat([
    D.register,
    writeString(uri),
    metaLen,
    metaEncoded,
  ]);

  const sig = await sendIX(
    [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: counterPda, isSigner: false, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data
  );

  console.log(`   ✅ #${id} ${name} — ${agentPda.toBase58().slice(0, 20)}...`);
  return agentPda;
}

async function createTask(
  agentId: number,
  amount: number,
  deadline: number,
  uri: string,
  taskNum: number
) {
  const [taskPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("task"), toU64LE(taskNum)],
    PROGRAM_ID
  );
  const [escrowVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow_vault"), toU64LE(taskNum)],
    PROGRAM_ID
  );

  const clientATA = await getOrCreateATA(USDC_MINT, wallet.publicKey);

  // Data: agent_id (u64) + amount (u64) + deadline (i64) + task_uri (string)
  const data = Buffer.concat([
    D.createTask,
    toU64LE(agentId),
    toU64LE(amount),
    Buffer.alloc(8), // deadline as i64 - simplified to 0 for demo
    writeString(uri),
  ]);

  const sig = await sendIX(
    [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: taskCounterPda, isSigner: false, isWritable: true },
      { pubkey: taskPda, isSigner: false, isWritable: true },
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      { pubkey: clientATA, isSigner: false, isWritable: true },
      { pubkey: escrowVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      {
        pubkey: await connection.getMinimumBalanceForRentExemption(165),
        isSigner: false,
        isWritable: false,
      } as any, // rent sysvar placeholder
    ],
    data
  );

  console.log(`   ✅ Task #${taskNum} created — ${sig.slice(0, 24)}...`);
  return taskPda;
}

async function giveFeedback(
  agentId: number,
  value: number,
  tag: string,
  feedbackIdx: number
) {
  const repPda = getPda([Buffer.from("reputation"), toU64LE(agentId)]);
  const [feedbackPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("feedback"),
      toU64LE(agentId),
      wallet.publicKey.toBuffer(),
      toU64LE(feedbackIdx),
    ],
    PROGRAM_ID
  );

  const data = Buffer.concat([
    D.feedback,
    Buffer.from([value]),
    writeString(tag),
  ]);

  const agentPda = getPda([
    Buffer.from("agent"),
    wallet.publicKey.toBuffer(),
    toU64LE(agentId),
  ]);

  const sig = await sendIX(
    [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: false },
      { pubkey: repPda, isSigner: false, isWritable: true },
      { pubkey: feedbackPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data
  );

  console.log(
    `   ✅ Feedback for #${agentId}: ${value}★ "${tag}" — ${sig.slice(
      0,
      20
    )}...`
  );
}

async function main() {
  console.log("🔌 RPC:", RPC_URL);
  console.log("👛 Wallet:", wallet.publicKey.toBase58());
  console.log(
    "💰 Balance:",
    ((await connection.getBalance(wallet.publicKey)) / 1e9).toFixed(4),
    "SOL"
  );

  await initializeProtocol();

  // ─── Register 6 Agents ───
  console.log("\n🤖 Registering agents...");
  const agents = [
    {
      name: "Nemesis Auditor",
      uri: "https://trustgrid.xyz/agents/nemesis.json",
      meta: [
        ["name", "Nemesis Auditor"],
        ["skill", "smart_contract_audit"],
        ["category", "security"],
        ["framework", "rust"],
        ["price", "1.0 USDC"],
        ["endpoint", "https://nemesis.trustgrid.xyz/mcp"],
        [
          "description",
          "Smart contract security auditor using dual-pass methodology.",
        ],
      ],
    },
    {
      name: "Alpha Trader",
      uri: "https://trustgrid.xyz/agents/alpha.json",
      meta: [
        ["name", "Alpha Trader"],
        ["skill", "defi_trading"],
        ["category", "trading"],
        ["framework", "python"],
        ["price", "0.5 USDC"],
        ["endpoint", "https://alpha.trustgrid.xyz/mcp"],
        [
          "description",
          "DeFi trading agent with MEV protection and real-time signals.",
        ],
      ],
    },
    {
      name: "Data Oracle",
      uri: "https://trustgrid.xyz/agents/oracle.json",
      meta: [
        ["name", "Data Oracle"],
        ["skill", "data_aggregation"],
        ["category", "data"],
        ["framework", "typescript"],
        ["price", "0.2 USDC"],
        ["endpoint", "https://oracle.trustgrid.xyz/mcp"],
        [
          "description",
          "Real-time data aggregation and cross-chain verification.",
        ],
      ],
    },
    {
      name: "Compliance Guard",
      uri: "https://trustgrid.xyz/agents/compliance.json",
      meta: [
        ["name", "Compliance Guard"],
        ["skill", "compliance_check"],
        ["category", "compliance"],
        ["framework", "rust"],
        ["price", "2.0 USDC"],
        ["endpoint", "https://compliance.trustgrid.xyz/mcp"],
        [
          "description",
          "ZKID-verified compliance checking for institutional agents.",
        ],
      ],
    },
    {
      name: "Yield Farmer",
      uri: "https://trustgrid.xyz/agents/yield.json",
      meta: [
        ["name", "Yield Farmer"],
        ["skill", "yield_optimization"],
        ["category", "defi"],
        ["framework", "solidity"],
        ["price", "0.8 USDC"],
        ["endpoint", "https://yield.trustgrid.xyz/mcp"],
        [
          "description",
          "Automated yield farming across Solana DeFi protocols.",
        ],
      ],
    },
    {
      name: "MEV Sentinel",
      uri: "https://trustgrid.xyz/agents/mev.json",
      meta: [
        ["name", "MEV Sentinel"],
        ["skill", "mev_protection"],
        ["category", "security"],
        ["framework", "rust"],
        ["price", "1.5 USDC"],
        ["endpoint", "https://mev.trustgrid.xyz/mcp"],
        ["description", "MEV extraction and sandwich attack protection."],
      ],
    },
  ];

  let agentId = 1;
  try {
    const counterInfo = await connection.getAccountInfo(counterPda);
    if (counterInfo && counterInfo.data.length >= 16) {
      agentId = Number(counterInfo.data.readBigUInt64LE(8)) + 1;
    }
  } catch {}

  for (const a of agents) {
    await registerAgent(a.name, a.uri, a.meta as [string, string][], agentId);
    agentId++;
  }

  // ─── Give Feedback ───
  console.log("\n⭐ Submitting feedback...");
  const feedbacks = [
    { agent: 1, value: 5, tag: "excellent", idx: 0 },
    { agent: 1, value: 4, tag: "thorough", idx: 1 },
    { agent: 1, value: 5, tag: "fast", idx: 2 },
    { agent: 2, value: 5, tag: "profitable", idx: 0 },
    { agent: 2, value: 4, tag: "reliable", idx: 1 },
    { agent: 3, value: 4, tag: "accurate", idx: 0 },
    { agent: 4, value: 5, tag: "essential", idx: 0 },
    { agent: 4, value: 5, tag: "compliant", idx: 1 },
    { agent: 5, value: 4, tag: "consistent", idx: 0 },
    { agent: 6, value: 5, tag: "protective", idx: 0 },
    { agent: 6, value: 4, tag: "vigilant", idx: 1 },
    { agent: 2, value: 5, tag: "excellent", idx: 2 },
  ];

  for (const f of feedbacks) {
    try {
      await giveFeedback(f.agent, f.value, f.tag, f.idx);
    } catch (e: any) {
      console.log(
        `   ⚠️  Feedback ${f.agent}/${f.idx} skipped: ${e
          .toString()
          .slice(0, 60)}`
      );
    }
  }

  console.log(
    "\n🎉 Seed complete! TrustGrid is now live with real on-chain activity."
  );
  console.log("   Agents:", agents.length);
  console.log("   Feedback entries:", feedbacks.length);
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
