import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";

/**
 * Seed Script — Initialize TrustGrid protocol and register real agents on devnet.
 * Uses raw web3.js with manual borsh encoding.
 *
 * Usage:
 *   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
 *   npx ts-node migrations/seed.ts
 */

const PROGRAM_ID = new PublicKey(
  "2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE"
);
const RPC_URL =
  process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";

// Load wallet from default Solana keypair
const keypairPath =
  process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
const secretKey = Uint8Array.from(
  JSON.parse(fs.readFileSync(keypairPath, "utf-8"))
);
const wallet = Keypair.fromSecretKey(secretKey);

const connection = new Connection(RPC_URL, "confirmed");

// Discriminators (first 8 bytes of sha256("global:<instruction_name>"))
// Anchor uses snake_case for instruction names in discriminators
const DISCRIMINATOR_INIT = Buffer.from([188, 233, 252, 106, 134, 146, 202, 91]);
const DISCRIMINATOR_REGISTER = Buffer.from([
  135, 157, 66, 195, 2, 113, 175, 30,
]);

function getPda(seeds: Buffer[], programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(seeds, programId);
  return pda;
}

const agentCounterPda = getPda([Buffer.from("agent_counter")], PROGRAM_ID);
const taskCounterPda = getPda([Buffer.from("task_counter")], PROGRAM_ID);
const protocolStatePda = getPda([Buffer.from("protocol_state")], PROGRAM_ID);

function toU64LE(n: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(n), 0);
  return buf;
}

function writeString(buf: string): Buffer {
  const bytes = Buffer.from(buf, "utf-8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

async function initializeProtocol() {
  console.log("1️⃣  Initializing protocol...");

  const ix = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
      { pubkey: agentCounterPda, isSigner: false, isWritable: true },
      { pubkey: taskCounterPda, isSigner: false, isWritable: true },
      { pubkey: protocolStatePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data: DISCRIMINATOR_INIT,
  };

  const tx = new Transaction().add(ix);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
    console.log("   ✅ Protocol initialized —", sig);
  } catch (e: any) {
    const msg = e.toString?.() || "";
    if (msg.includes("already in use") || msg.includes("0x0")) {
      console.log("   ℹ️  Protocol already initialized");
    } else {
      console.error("   ⚠️ ", msg.slice(0, 200));
    }
  }
}

async function registerAgent(
  agentUri: string,
  metadata: [string, string][],
  agentId: number
) {
  const [agentPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), wallet.publicKey.toBuffer(), toU64LE(agentId)],
    PROGRAM_ID
  );

  // Borsh: string = u32 len LE + bytes
  // Borsh: vec<T> = u32 len LE + items
  // Tuple<string, string> is encoded as two consecutive strings

  const uriEncoded = writeString(agentUri);

  const metaItems = metadata.map(([k, v]) =>
    Buffer.concat([writeString(k), writeString(v)])
  );
  const metaLen = Buffer.alloc(4);
  metaLen.writeUInt32LE(metadata.length, 0);
  const metaEncoded = Buffer.concat([metaLen, ...metaItems]);

  const data = Buffer.concat([DISCRIMINATOR_REGISTER, uriEncoded, metaEncoded]);

  const ix = {
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: agentCounterPda, isSigner: false, isWritable: true },
      { pubkey: agentPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: PROGRAM_ID,
    data,
  };

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  return { sig, agentPda };
}

async function main() {
  console.log("🔌 RPC:", RPC_URL);
  console.log("👛 Wallet:", wallet.publicKey.toBase58());
  console.log("📦 Program:", PROGRAM_ID.toBase58());
  const bal = await connection.getBalance(wallet.publicKey);
  console.log("💰 Balance:", (bal / 1e9).toFixed(4), "SOL");
  console.log("");

  await initializeProtocol();

  const agents = [
    {
      name: "Nemesis Auditor",
      uri: "https://trustgrid.xyz/agents/nemesis.json",
      metadata: [
        ["name", "Nemesis Auditor"],
        ["skill", "smart_contract_audit"],
        ["category", "security"],
        ["framework", "rust"],
        ["price", "1.0 USDC"],
        ["endpoint", "https://nemesis.trustgrid.xyz/mcp"],
      ] as [string, string][],
    },
    {
      name: "Alpha Trader",
      uri: "https://trustgrid.xyz/agents/alpha.json",
      metadata: [
        ["name", "Alpha Trader"],
        ["skill", "defi_trading"],
        ["category", "trading"],
        ["framework", "python"],
        ["price", "0.5 USDC"],
        ["endpoint", "https://alpha.trustgrid.xyz/mcp"],
      ] as [string, string][],
    },
    {
      name: "Data Oracle",
      uri: "https://trustgrid.xyz/agents/oracle.json",
      metadata: [
        ["name", "Data Oracle"],
        ["skill", "data_aggregation"],
        ["category", "data"],
        ["framework", "typescript"],
        ["price", "0.2 USDC"],
        ["endpoint", "https://oracle.trustgrid.xyz/mcp"],
      ] as [string, string][],
    },
    {
      name: "Compliance Guard",
      uri: "https://trustgrid.xyz/agents/compliance.json",
      metadata: [
        ["name", "Compliance Guard"],
        ["skill", "compliance_check"],
        ["category", "compliance"],
        ["framework", "rust"],
        ["price", "2.0 USDC"],
        ["endpoint", "https://compliance.trustgrid.xyz/mcp"],
      ] as [string, string][],
    },
  ];

  // Fetch current counter
  let nextId = 1;
  try {
    const accountInfo = await connection.getAccountInfo(agentCounterPda);
    if (accountInfo && accountInfo.data.length >= 16) {
      nextId = Number(accountInfo.data.readBigUInt64LE(8)) + 1;
    }
  } catch {
    /* ignore */
  }

  for (const agent of agents) {
    console.log(`\n🤖 Registering agent: ${agent.name}`);
    try {
      const { sig, agentPda } = await registerAgent(
        agent.uri,
        agent.metadata,
        nextId
      );
      console.log(
        `   ✅ Agent #${nextId} registered at ${agentPda.toBase58()}`
      );
      console.log(`   📝 Signature: ${sig}`);
      nextId++;
    } catch (e: any) {
      console.error(`   ❌ Failed: ${e.toString().slice(0, 200)}`);
    }
  }

  console.log("\n🎉 Seed complete!");
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
