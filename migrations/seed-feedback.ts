import { Connection, PublicKey, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import * as fs from "fs";

/**
 * Submit feedback using a second wallet (avoids self-feedback restriction).
 */

const PROGRAM_ID = new PublicKey("2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE");
const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const WALLET_PATH = process.env.FEEDBACK_WALLET || "/tmp/demo-wallet.json";

const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8")));
const wallet = Keypair.fromSecretKey(secretKey);
const connection = new Connection(RPC_URL, "confirmed");

const crypto = require("crypto");
function disc(name: string): Buffer {
  return Buffer.from(crypto.createHash("sha256").update("global:" + name).digest().slice(0, 8));
}

const D_FEEDBACK = disc("give_feedback");

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

async function sendIX(keys: any[], data: Buffer) {
  const tx = new Transaction().add({
    keys,
    programId: PROGRAM_ID,
    data,
  });
  return sendAndConfirmTransaction(connection, tx, [wallet]);
}

async function giveFeedback(agentId: number, value: number, tag: string) {
  const repPda = getPda([Buffer.from("reputation"), toU64LE(agentId)]);

  // We need to discover the current feedback count for this agent to compute the PDA correctly
  const repInfo = await connection.getAccountInfo(repPda);
  let feedbackCount = 0;
  if (repInfo && repInfo.data.length >= 16) {
    // AgentReputation: agent_id(u64) + total_feedback(u64) + average_score(u64) + feedback_count(u64)
    feedbackCount = Number(repInfo.data.readBigUInt64LE(8 + 8 + 8));
  }

  const [feedbackPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feedback"), toU64LE(agentId), wallet.publicKey.toBuffer(), toU64LE(feedbackCount)],
    PROGRAM_ID
  );

  const agentPda = getPda([Buffer.from("agent"), new PublicKey("FzjHztL4TYQaNKQGVHV5VRAG1MVp2cvHuSN6mmduBcL3").toBuffer(), toU64LE(agentId)]);

  const data = Buffer.concat([
    D_FEEDBACK,
    Buffer.from([value]),
    writeString(tag),
  ]);

  const sig = await sendIX([
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
    { pubkey: agentPda, isSigner: false, isWritable: false },
    { pubkey: repPda, isSigner: false, isWritable: true },
    { pubkey: feedbackPda, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ], data);

  console.log(`   ✅ Feedback for #${agentId}: ${value}★ "${tag}" — ${sig.slice(0, 20)}...`);
}

async function main() {
  console.log("🔌 RPC:", RPC_URL);
  console.log("👛 Wallet:", wallet.publicKey.toBase58());
  console.log("💰 Balance:", (await connection.getBalance(wallet.publicKey) / 1e9).toFixed(4), "SOL");

  const feedbacks = [
    { agent: 1, value: 5, tag: "excellent" },
    { agent: 1, value: 4, tag: "thorough" },
    { agent: 1, value: 5, tag: "fast" },
    { agent: 2, value: 5, tag: "profitable" },
    { agent: 2, value: 4, tag: "reliable" },
    { agent: 3, value: 4, tag: "accurate" },
    { agent: 4, value: 5, tag: "essential" },
    { agent: 4, value: 5, tag: "compliant" },
    { agent: 5, value: 4, tag: "consistent" },
    { agent: 6, value: 5, tag: "protective" },
    { agent: 6, value: 4, tag: "vigilant" },
    { agent: 2, value: 5, tag: "excellent" },
  ];

  console.log("\n⭐ Submitting feedback...");
  for (const f of feedbacks) {
    try {
      await giveFeedback(f.agent, f.value, f.tag);
    } catch (e: any) {
      console.log(`   ⚠️  Feedback ${f.agent} skipped: ${e.toString().slice(0, 100)}`);
    }
  }

  console.log("\n🎉 Feedback seed complete!");
}

main().catch((err) => {
  console.error("\n❌ Failed:", err);
  process.exit(1);
});
