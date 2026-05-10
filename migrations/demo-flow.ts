#!/usr/bin/env npx ts-node --transpile-only
/**
 * TrustGrid Demo Flow — Full on-chain walkthrough
 *
 * Registers an agent, creates a task, verifies state.
 * Use this at the start of the demo to show everything is live on devnet.
 *
 * Usage:
 *   npx ts-node --transpile-only migrations/demo-flow.ts
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import chalk from "chalk";

import {
  fetchAgents, fetchTasks, fetchReputation,
  getAgentName, getAgentCategory, getAgentPrice,
} from "../app/lib/agents";
import {
  buildRegisterAgentTx, buildCreateTaskTx,
  sendTxRobust, getUSDCBalance,
} from "../app/lib/transactions";
import { PROGRAM_ID_STRING, getTxUrl } from "../app/lib/constants";

const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

function getWallet(): Keypair {
  const keyPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8"))));
}

function fakeAdapter(wallet: Keypair) {
  return {
    signTransaction: async (tx: any) => { tx.sign(wallet); return tx; },
    sendTransaction: null,
  } as any;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function header(step: number, title: string) {
  console.log("");
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log(chalk.bold.cyan(`  STEP ${step}: ${title}`));
  console.log(chalk.bold.cyan("─".repeat(60)));
  console.log("");
}

async function main() {
  const wallet = getWallet();
  const adapter = fakeAdapter(wallet);

  console.log(chalk.bold.blue("\n🚀 TrustGrid Demo Flow\n"));
  console.log(chalk.gray("Program:"), PROGRAM_ID_STRING);
  console.log(chalk.gray("Network:"), "devnet");
  console.log(chalk.gray("Wallet:"), wallet.publicKey.toBase58());
  console.log(chalk.gray("SOL Balance:"), (await connection.getBalance(wallet.publicKey) / 1e9).toFixed(4));
  console.log("");

  // ──────────────────────────────────────────
  // STEP 1: Register a demo agent
  // ──────────────────────────────────────────
  header(1, "REGISTER AGENT ON-CHAIN");

  const counterInfo = await connection.getAccountInfo(
    PublicKey.findProgramAddressSync([Buffer.from("agent_counter")], new PublicKey(PROGRAM_ID_STRING))[0]
  );
  const currentCount = counterInfo && counterInfo.data.length >= 16
    ? Number(counterInfo.data.readBigUInt64LE(8))
    : 0;
  const nextId = currentCount + 1;

  console.log(chalk.blue(`Registering agent #${nextId}...`));

  try {
    const regResult = await buildRegisterAgentTx(connection, wallet.publicKey, "https://trustgrid.xyz/agents/demo.json", {
      name: "Demo Audit Agent",
      skill: "smart_contract_audit",
      category: "security",
      framework: "rust",
      price: "1.0 USDC",
      endpoint: "https://demo.trustgrid.xyz/mcp",
      description: "Smart contract security auditor for the demo.",
    });

    const sig = await sendTxRobust(regResult.tx, connection, adapter);
    console.log(chalk.green("✅ Agent registered!"));
    console.log(chalk.gray("   Tx:"), getTxUrl(sig));
    console.log(chalk.gray("   Agent ID:"), regResult.agentId);
  } catch (e: any) {
    console.log(chalk.red("⚠️  " + (e.message?.slice(0, 100) || "Registration failed")));
  }

  await sleep(2000);

  // ──────────────────────────────────────────
  // STEP 2: Create a task (hire the agent)
  // ──────────────────────────────────────────
  header(2, "HIRE AGENT — CREATE TASK WITH USDC ESCROW");

  const usdc = await getUSDCBalance(connection, wallet.publicKey);
  console.log(chalk.gray("   USDC Balance:"), usdc.toFixed(2), "USDC");

  if (usdc < 1.0) {
    console.log(chalk.yellow("   ⚠️  Insufficient USDC for task creation."));
    console.log(chalk.gray("   Get devnet USDC:"));
    console.log(chalk.gray("   → https://faucet.circle.com (select Solana Devnet)"));
    console.log(chalk.gray("   → Or use the web UI to create tasks with a funded wallet"));
    console.log(chalk.gray("   Skipping task creation — agent is registered and visible on the marketplace."));
  } else {
    try {
      const taskResult = await buildCreateTaskTx(connection, wallet.publicKey, nextId, 1.0, "https://trustgrid.xyz/tasks/demo-task.json");
      const sig = await sendTxRobust(taskResult.tx, connection, adapter);
      console.log(chalk.green("✅ Task created! USDC locked in escrow."));
      console.log(chalk.gray("   Tx:"), getTxUrl(sig));
      console.log(chalk.gray("   Task ID:"), taskResult.taskId);
      console.log(chalk.gray("   Amount:"), "1.0 USDC (locked in PDA vault)");
    } catch (e: any) {
      console.log(chalk.red("⚠️  " + (e.message?.slice(0, 100) || "Task creation failed")));
    }
  }

  await sleep(2000);

  // ──────────────────────────────────────────
  // STEP 3: Verify on-chain state
  // ──────────────────────────────────────────
  header(3, "VERIFY ON-CHAIN STATE");

  const agents = await fetchAgents();
  console.log(chalk.bold(`Registered Agents: ${agents.length}\n`));
  for (const a of agents.slice(-5)) {
    const rep = await fetchReputation(a.agentId);
    const stars = rep ? (rep.averageScore / 100).toFixed(1) : "—";
    console.log(chalk.bold(`  #${a.agentId} ${getAgentName(a)}`) +
      chalk.cyan(`  ${getAgentCategory(a)}`) +
      chalk.yellow(`  ★${stars}`) +
      chalk.gray(`  ${getAgentPrice(a)}`));
  }

  const tasks = await fetchTasks();
  console.log(chalk.bold(`\nTasks: ${tasks.length}\n`));
  for (const t of tasks.slice(-3)) {
    const agent = agents.find(a => a.agentId === t.agentId);
    const name = agent ? getAgentName(agent) : `Agent #${t.agentId}`;
    console.log(chalk.bold(`  Task #${t.taskId}`) +
      chalk.yellow(`  [${t.status}]`) +
      chalk.gray(`  ${(t.amount / 1_000_000).toFixed(2)} USDC → ${name}`));
  }

  console.log(chalk.bold.green("\n✨ Demo flow complete!\n"));
  console.log(chalk.gray("Next:"));
  console.log(chalk.gray("  • Web UI:   https://trust-grid-sol.vercel.app/"));
  console.log(chalk.gray("  • CLI list:  npx ts-node cli/trustgrid.ts agents"));
  console.log(chalk.gray("  • MCP:       npx ts-node cli/trustgrid.ts mcp"));
  console.log("");
}

main().catch((err) => {
  console.error(chalk.red("\n❌ Demo failed:"), err.message || err);
  process.exit(1);
});
