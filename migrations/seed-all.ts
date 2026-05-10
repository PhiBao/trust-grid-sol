#!/usr/bin/env npx ts-node --transpile-only
/**
 * TrustGrid Seed Script — Agent-First Model
 *
 * Each agent gets its own keypair. Funded from the main wallet.
 * Keypairs saved to ./agents/ directory.
 *
 * Usage:
 *   npx ts-node --transpile-only migrations/seed-all.ts
 */

import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";

import {
  fetchAgents, fetchReputation,
  getAgentName, getAgentCategory, getAgentPrice,
} from "../app/lib/agents";
import {
  buildRegisterAgentTx, buildGiveFeedbackTx,
  buildTransferUSDCTx,
  sendTxRobust, getSOLBalance,
} from "../app/lib/transactions";
import { PROGRAM_ID_STRING, getTxUrl } from "../app/lib/constants";

const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

function getMainWallet(): Keypair {
  const keyPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))));
}

function signWithKeypair(keypair: Keypair) {
  return {
    signTransaction: async (tx: any) => { tx.sign(keypair); return tx; },
    sendTransaction: null,
  } as any;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fundAgent(mainWallet: Keypair, agentPubkey: PublicKey, solAmount: number): Promise<string | null> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: mainWallet.publicKey,
      toPubkey: agentPubkey,
      lamports: Math.round(solAmount * 1e9),
    })
  );
  tx.feePayer = mainWallet.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(mainWallet);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

const AGENTS_TO_SEED = [
  { name: "Nemesis Auditor", skill: "smart_contract_audit", category: "security", framework: "rust", price: "1.0", endpoint: "https://nemesis.trustgrid.xyz/mcp", desc: "Smart contract security auditor using dual-pass methodology." },
  { name: "Alpha Trader", skill: "defi_trading", category: "trading", framework: "python", price: "0.5", endpoint: "https://alpha.trustgrid.xyz/mcp", desc: "DeFi trading agent with MEV protection and real-time signals." },
  { name: "Data Oracle", skill: "data_aggregation", category: "data", framework: "typescript", price: "0.2", endpoint: "https://oracle.trustgrid.xyz/mcp", desc: "Real-time data aggregation and cross-chain verification." },
  { name: "Compliance Guard", skill: "compliance_check", category: "compliance", framework: "rust", price: "2.0", endpoint: "https://compliance.trustgrid.xyz/mcp", desc: "ZKID-verified compliance checking for institutional agents." },
  { name: "Yield Farmer", skill: "yield_optimization", category: "defi", framework: "solidity", price: "0.8", endpoint: "https://yield.trustgrid.xyz/mcp", desc: "Automated yield farming across Solana DeFi protocols." },
  { name: "MEV Sentinel", skill: "mev_protection", category: "security", framework: "rust", price: "1.5", endpoint: "https://mev.trustgrid.xyz/mcp", desc: "MEV extraction and sandwich attack protection." },
];

async function main() {
  const mainWallet = getMainWallet();
  const mainBalance = await connection.getBalance(mainWallet.publicKey);

  console.log(chalk.bold.blue("\n🌱 TrustGrid Agent-First Seed\n"));
  console.log(chalk.gray("Program:"), PROGRAM_ID_STRING);
  console.log(chalk.gray("Network:"), "devnet");
  console.log(chalk.gray("Main Wallet:"), mainWallet.publicKey.toBase58());
  console.log(chalk.gray("Main Balance:"), (mainBalance / 1e9).toFixed(4), "SOL");
  console.log("");

  const agentsDir = "./agents";
  if (!fs.existsSync(agentsDir)) {
    fs.mkdirSync(agentsDir, { recursive: true });
  }

  const registered: { agentId: number; keypair: Keypair; name: string }[] = [];

  // ─── Register agents with their own keypairs ───
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log(chalk.bold.cyan("  REGISTERING AGENTS (each with own keypair)"));
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log("");

  for (const agentDef of AGENTS_TO_SEED) {
    const agentKeypair = Keypair.generate();
    const outFile = path.join(agentsDir, `${agentDef.name.replace(/\s+/g, '-').toLowerCase()}-key.json`);

    // Fund agent with SOL for gas
    console.log(chalk.gray(`  Funding ${agentDef.name}...`));
    try {
      await fundAgent(mainWallet, agentKeypair.publicKey, 0.05);
      console.log(chalk.gray(`  ✅ Funded with 0.05 SOL`));
    } catch (e: any) {
      console.log(chalk.red(`  ⚠️  Funding failed: ${e.message?.slice(0, 60)}`));
      continue;
    }

    await sleep(3000);

    // Register agent with generated keypair as authority
    try {
      const { tx, agentId } = await buildRegisterAgentTx(connection, agentKeypair.publicKey, `https://trustgrid.xyz/agents/${agentDef.name.toLowerCase().replace(/\s+/g, '-')}.json`, {
        name: agentDef.name,
        skill: agentDef.skill,
        category: agentDef.category,
        framework: agentDef.framework,
        price: `${agentDef.price} USDC`,
        endpoint: agentDef.endpoint,
        description: agentDef.desc,
      });

      tx.sign(agentKeypair);
      const raw = tx.serialize();
      const sig = await connection.sendRawTransaction(raw, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");

      fs.writeFileSync(outFile, JSON.stringify(Array.from(agentKeypair.secretKey)));

      console.log(chalk.green(`  ✅ #${agentId} ${agentDef.name}`) +
        chalk.gray(`  Wallet: ${agentKeypair.publicKey.toBase58().slice(0, 16)}...`) +
        chalk.gray(`  Key: ${outFile}`));

      registered.push({ agentId, keypair: agentKeypair, name: agentDef.name });
    } catch (e: any) {
      console.log(chalk.red(`  ⚠️  ${agentDef.name}: ${e.message?.slice(0, 60)}`));
    }

    await sleep(1000);
  }

  // ─── Fund agents with USDC for agent-to-agent hiring ───
  console.log("");
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log(chalk.bold.cyan("  FUNDING AGENTS WITH USDC"));
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log("");

  for (const agent of registered) {
    try {
      const usdcTx = await buildTransferUSDCTx(connection, mainWallet.publicKey, agent.keypair.publicKey, 2.0);
      usdcTx.feePayer = mainWallet.publicKey;
      usdcTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      usdcTx.sign(mainWallet);
      const sig = await connection.sendRawTransaction(usdcTx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      console.log(chalk.green(`  ✅ ${agent.name}: +2.0 USDC`));
    } catch (e: any) {
      console.log(chalk.gray(`  ⚠️  ${agent.name} USDC: ${e.message?.slice(0, 50)}`));
    }
    await sleep(500);
  }

  // ─── Give feedback ───
  console.log("");
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log(chalk.bold.cyan("  SUBMITTING FEEDBACK"));
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log("");

  const feedbackEntries = [
    { agentIdx: 0, value: 5, tag: "excellent" },
    { agentIdx: 0, value: 4, tag: "thorough" },
    { agentIdx: 1, value: 5, tag: "profitable" },
    { agentIdx: 1, value: 4, tag: "reliable" },
    { agentIdx: 2, value: 4, tag: "accurate" },
    { agentIdx: 3, value: 5, tag: "essential" },
    { agentIdx: 4, value: 4, tag: "consistent" },
    { agentIdx: 5, value: 5, tag: "protective" },
  ];

  for (const fb of feedbackEntries) {
    const agent = registered[fb.agentIdx];
    if (!agent) continue;

    try {
      const tx = await buildGiveFeedbackTx(
        connection, mainWallet.publicKey, agent.agentId,
        fb.value, fb.tag, agent.keypair.publicKey
      );
      const sig = await sendTxRobust(tx, connection, signWithKeypair(mainWallet));
      console.log(chalk.green(`  ✅ ${agent.name}: ${fb.value}★ "${fb.tag}"`));
    } catch (e: any) {
      console.log(chalk.gray(`  ⚠️  ${agent.name}/${fb.tag}: ${e.message?.slice(0, 50)}`));
    }

    await sleep(500);
  }

  // ─── Summary ───
  console.log("");
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log(chalk.bold.cyan("  SUMMARY"));
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log("");

  const agents = await fetchAgents();
  console.log(chalk.bold(`Total agents on-chain: ${agents.length}\n`));
  for (const a of agents.slice(-registered.length)) {
    const rep = await fetchReputation(a.agentId);
    const stars = rep ? (rep.averageScore / 100).toFixed(1) : "—";
    console.log(chalk.bold(`  #${a.agentId} ${getAgentName(a)}`) +
      chalk.cyan(`  ${getAgentCategory(a)}`) +
      chalk.yellow(`  ★${stars}`) +
      chalk.gray(`  ${getAgentPrice(a)}`));
  }

  console.log(chalk.bold.green("\n✨ Seed Complete!\n"));
  console.log(chalk.gray("Agent keypairs saved to ./agents/"));
  console.log(chalk.gray("Each agent has its own wallet, funded with SOL + USDC."));
  console.log(chalk.gray(""));
  console.log(chalk.gray("Use with CLI:"));
  if (registered.length > 0) {
    const first = registered[0];
    const keyFile = path.join(agentsDir, `${first.name.replace(/\s+/g, '-').toLowerCase()}-key.json`);
    console.log(chalk.gray(`  npx ts-node cli/trustgrid.ts hire --key ${keyFile} --agent ${first.agentId} --amount 1.0 --uri "..."`));
    console.log(chalk.gray(`  npx ts-node cli/trustgrid.ts submit --key ${keyFile} --task 1 --agent ${first.agentId}`));
  }
  console.log("");
}

main().catch((err) => {
  console.error(chalk.red("\n❌ Seed failed:"), err.message || err);
  process.exit(1);
});
