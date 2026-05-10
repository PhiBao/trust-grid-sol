#!/usr/bin/env node
/**
 * TrustGrid CLI — Terminal-first interface for the on-chain agent marketplace.
 *
 * Two modes:
 *   Default: uses your own wallet (ANCHOR_WALLET env or ~/.config/solana/id.json)
 *   Agent-first: --key <file> uses an agent's own keypair for autonomous operation
 *
 * Usage:
 *   npx ts-node cli/trustgrid.ts agents
 *   npx ts-node cli/trustgrid.ts agent 1
 *   npx ts-node cli/trustgrid.ts tasks
 *   npx ts-node cli/trustgrid.ts register --name "My Agent" --uri "https://..." [--generate-key]
 *   npx ts-node cli/trustgrid.ts hire --agent 1 --amount 1.0 --uri "https://..." [--key agents/my-agent.json]
 *   npx ts-node cli/trustgrid.ts claim --task 1 --agent 1 [--key agents/my-agent.json]
 *   npx ts-node cli/trustgrid.ts submit --task 1 --agent 1 [--key agents/my-agent.json]
 *   npx ts-node cli/trustgrid.ts accept --task 1 --agent 1 --value 5 --tag "excellent" [--key client.json]
 *   npx ts-node cli/trustgrid.ts dispute --task 1 --reason "..." [--key client.json]
 *   npx ts-node cli/trustgrid.ts feedback --agent 1 --value 5 --tag "excellent" [--key client.json]
 *   npx ts-node cli/trustgrid.ts mcp [--key agents/my-agent.json]
 */

import { Command } from "commander";
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import chalk from "chalk";

import {
  fetchAgents,
  fetchTasks,
  fetchReputation,
  fetchFeedbacksForAgent,
  getAgentName,
  getAgentCategory,
  getAgentPrice,
  getAgentSkill,
} from "../app/lib/agents";
import {
  buildRegisterAgentTx,
  buildCreateTaskTx,
  buildGiveFeedbackTx,
  buildClaimTaskTx,
  buildSubmitTaskTx,
  buildAcceptTaskTx,
  buildDisputeTaskTx,
  sendTxRobust,
  getUSDCBalance,
  getSOLBalance,
  buildTransferUSDCTx,
} from "../app/lib/transactions";
import { PROGRAM_ID_STRING, getTxUrl } from "../app/lib/constants";

const program = new Command();
program
  .name("trustgrid")
  .description("TrustGrid CLI — On-chain AI agent marketplace")
  .version("0.1.0");
const DEFAULT_PUBKEY = "11111111111111111111111111111111";

const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

function getWallet(): Keypair {
  const keyPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")));
  return Keypair.fromSecretKey(secretKey);
}

function getWalletFromKey(keyFile: string): Keypair {
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keyFile, "utf-8")));
  return Keypair.fromSecretKey(secretKey);
}

function resolveSigner(opts: { key?: string }): Keypair {
  return opts.key ? getWalletFromKey(opts.key) : getWallet();
}

function fakeAdapter(wallet: Keypair) {
  return {
    signTransaction: async (tx: any) => { tx.sign(wallet); return tx; },
    sendTransaction: null,
  } as any;
}

// ─── agents ───
program
  .command("agents")
  .description("List all registered agents")
  .action(async () => {
    const agents = await fetchAgents();
    console.log(chalk.bold.blue(`\nTrustGrid Agents (${agents.length})\n`));
    console.log(chalk.gray("Program:"), PROGRAM_ID_STRING);
    console.log(chalk.gray("Network:"), "devnet\n");
    for (const a of agents) {
      const rep = await fetchReputation(a.agentId);
      const stars = rep ? (rep.averageScore / 100).toFixed(1) : "—";
      const reviews = rep ? rep.feedbackCount : 0;
      console.log(
        chalk.bold(`#${a.agentId} ${getAgentName(a)}`) +
          chalk.cyan(`  ${getAgentCategory(a)}`) +
          chalk.yellow(`  ★${stars}`) +
          chalk.gray(` (${reviews} reviews)`)
      );
      console.log(
        chalk.gray(`  Skill: ${getAgentSkill(a)} | Price: ${getAgentPrice(a)} | PDA: ${a.pda.slice(0, 20)}...`)
      );
      console.log();
    }
  });

// ─── agent ───
program
  .command("agent <id>")
  .description("Show agent details, reputation, and feedback")
  .action(async (idStr: string) => {
    const agentId = parseInt(idStr, 10);
    const agents = await fetchAgents();
    const agent = agents.find((a) => a.agentId === agentId);
    if (!agent) {
      console.log(chalk.red(`Agent #${agentId} not found.`));
      process.exit(1);
    }

    console.log(chalk.bold.blue(`\nAgent #${agent.agentId}: ${getAgentName(agent)}\n`));
    console.log(chalk.gray("Category:"), getAgentCategory(agent));
    console.log(chalk.gray("Skill:"), getAgentSkill(agent));
    console.log(chalk.gray("Framework:"), agent.metadata.framework || "—");
    console.log(chalk.gray("Price:"), getAgentPrice(agent));
    console.log(chalk.gray("Status:"), agent.active ? chalk.green("Active") : chalk.red("Inactive"));
    console.log(chalk.gray("Authority:"), agent.authority);
    console.log(chalk.gray("PDA:"), agent.pda);
    console.log(chalk.gray("URI:"), agent.agentUri);
    if (agent.metadata.endpoint) console.log(chalk.gray("Endpoint:"), agent.metadata.endpoint);

    const rep = await fetchReputation(agentId);
    if (rep && rep.feedbackCount > 0) {
      console.log(chalk.bold(`\nReputation: ${(rep.averageScore / 100).toFixed(1)}/5.0  (${rep.feedbackCount} reviews)\n`));
    } else {
      console.log(chalk.gray("\nNo reputation yet.\n"));
    }

    const feedbacks = await fetchFeedbacksForAgent(agentId);
    if (feedbacks.length > 0) {
      console.log(chalk.bold("Recent Feedback:"));
      for (const fb of feedbacks.slice(0, 10)) {
        const stars = "★".repeat(fb.value) + "☆".repeat(5 - fb.value);
        console.log(`  ${chalk.yellow(stars)}  "${fb.tag}"  ${chalk.gray(new Date(fb.createdAt * 1000).toLocaleDateString())}`);
      }
    }
  });

// ─── tasks ───
program
  .command("tasks")
  .description("List all tasks")
  .action(async () => {
    const tasks = await fetchTasks();
    const agents = await fetchAgents();
    console.log(chalk.bold.blue(`\nTasks (${tasks.length})\n`));
    for (const t of tasks.reverse()) {
      const agent = agents.find((a) => a.agentId === t.agentId);
      const agentName = agent ? getAgentName(agent) : `Agent #${t.agentId}`;
      const statusColor = t.status === "open" ? chalk.blue : t.status === "completed" ? chalk.green : t.status === "claimed" ? chalk.yellow : chalk.gray;
      console.log(
        chalk.bold(`Task #${t.taskId}`) + statusColor(` [${t.status}]`) + chalk.gray(`  ${(t.amount / 1_000_000).toFixed(2)} USDC → ${agentName}`)
      );
    }
  });

// ─── register ───
program
  .command("register")
  .description("Register a new agent on-chain")
  .requiredOption("--name <name>", "Agent name")
  .requiredOption("--uri <uri>", "Agent metadata URI")
  .option("--skill <skill>", "Skill", "general")
  .option("--category <category>", "Category", "general")
  .option("--framework <framework>", "Framework", "rust")
  .option("--price <price>", "Price in USDC", "1.0")
  .option("--endpoint <endpoint>", "MCP endpoint")
  .option("--desc <description>", "Description")
  .option("--generate-key", "Generate a dedicated agent keypair (agent-first mode)")
  .option("--key <file>", "Use this keypair file as signer (overrides ANCHOR_WALLET)")
  .action(async (opts) => {
    const shouldGenerate = !!opts.generateKey;
    const signer = opts.key ? getWalletFromKey(opts.key) : getWallet();
    let agentKeypair: Keypair | null = null;

    if (shouldGenerate) {
      agentKeypair = Keypair.generate();
      console.log(chalk.gray("Generated agent keypair:"), agentKeypair.publicKey.toBase58());
      console.log(chalk.gray("Balance (signer):"), (await getSOLBalance(connection, signer.publicKey)).toFixed(4), "SOL\n");
    } else {
      console.log(chalk.gray("Wallet:"), signer.publicKey.toBase58());
      console.log(chalk.gray("Balance:"), (await getSOLBalance(connection, signer.publicKey)).toFixed(4), "SOL\n");
    }

    const authority = shouldGenerate ? agentKeypair!.publicKey : signer.publicKey;

    // Fund agent keypair with SOL for gas
    if (shouldGenerate) {
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: authority,
          lamports: Math.round(0.05 * 1e9),
        })
      );
      fundTx.feePayer = signer.publicKey;
      fundTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      fundTx.sign(signer);
      const fundSig = await connection.sendRawTransaction(fundTx.serialize());
      await connection.confirmTransaction(fundSig, "confirmed");
      console.log(chalk.gray("Funded agent with 0.05 SOL"));
    }

    const metadata: Record<string, string> = {
      name: opts.name,
      skill: opts.skill,
      category: opts.category,
      framework: opts.framework,
      price: `${opts.price} USDC`,
      endpoint: opts.endpoint || "",
      description: opts.desc || "",
    };

    const { tx, agentId } = await buildRegisterAgentTx(connection, authority, opts.uri, metadata);
    console.log(chalk.blue(`Registering agent #${agentId}...`));

    // Sign with agent keypair if generated, otherwise signer
    const signForKey = shouldGenerate ? agentKeypair! : signer;
    const sig = await sendTxRobust(tx, connection, fakeAdapter(signForKey));
    console.log(chalk.green("✅ Agent registered!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
    console.log(chalk.gray("Agent ID:"), agentId);
    console.log(chalk.gray("Authority:"), authority.toBase58());
    if (shouldGenerate) {
      const agentsDir = "./agents";
      if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });
      const keyFile = path.join(agentsDir, `${opts.name.replace(/\s+/g, "-").toLowerCase()}-key.json`);
      fs.writeFileSync(keyFile, JSON.stringify(Array.from(agentKeypair!.secretKey)));
      console.log(chalk.green(`\n✅ Agent keypair saved to ${keyFile}`));
      console.log(chalk.yellow("⚠️  This keypair IS your agent's identity. Keep it safe!"));
      console.log(chalk.gray(`Agent wallet: ${authority.toBase58()}`));
      console.log(chalk.gray("Fund this wallet with USDC for agent-to-agent hiring."));
    }
  });

// ─── hire ───
program
  .command("hire")
  .description("Create a task (hire an agent)")
  .requiredOption("--agent <id>", "Agent ID", parseInt)
  .requiredOption("--amount <amount>", "USDC amount", parseFloat)
  .requiredOption("--uri <uri>", "Task description URI")
  .option("--key <file>", "Sign with this keypair (agent-first mode)")
  .action(async (opts) => {
    const wallet = resolveSigner(opts);
    const usdc = await getUSDCBalance(connection, wallet.publicKey);
    console.log(chalk.gray("Wallet:"), wallet.publicKey.toBase58());
    console.log(chalk.gray("USDC Balance:"), usdc.toFixed(2), "USDC\n");

    if (usdc < opts.amount) {
      console.log(chalk.red("Insufficient USDC balance."));
      process.exit(1);
    }

    const { tx, taskId } = await buildCreateTaskTx(connection, wallet.publicKey, opts.agent, opts.amount, opts.uri);
    console.log(chalk.blue(`Creating task #${taskId} for agent #${opts.agent}...`));

    const sig = await sendTxRobust(tx, connection, fakeAdapter(wallet));
    console.log(chalk.green("✅ Task created!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
    console.log(chalk.gray("Task ID:"), taskId);
  });

// ─── feedback ───
program
  .command("feedback")
  .description("Give feedback to an agent")
  .requiredOption("--agent <id>", "Agent ID", parseInt)
  .requiredOption("--value <value>", "Rating 1-5", parseInt)
  .requiredOption("--tag <tag>", "Feedback tag")
  .option("--key <file>", "Sign with this keypair (agent-first mode)")
  .action(async (opts) => {
    const wallet = resolveSigner(opts);
    const agents = await fetchAgents();
    const agent = agents.find((a) => a.agentId === opts.agent);
    if (!agent) {
      console.log(chalk.red(`Agent #${opts.agent} not found.`));
      process.exit(1);
    }

    const tx = await buildGiveFeedbackTx(connection, wallet.publicKey, opts.agent, opts.value, opts.tag, new PublicKey(agent.authority));
    console.log(chalk.blue(`Submitting feedback for agent #${opts.agent}...`));

    const sig = await sendTxRobust(tx, connection, fakeAdapter(wallet));
    console.log(chalk.green("✅ Feedback submitted!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
  });

// ─── claim ───
program
  .command("claim")
  .description("Agent claims an open task")
  .requiredOption("--task <id>", "Task ID", parseInt)
  .requiredOption("--agent <id>", "Agent ID", parseInt)
  .option("--key <file>", "Sign with agent keypair (agent-first mode)")
  .action(async (opts) => {
    const wallet = resolveSigner(opts);
    const agents = await fetchAgents();
    const agent = agents.find((a) => a.agentId === opts.agent);
    if (!agent) {
      console.log(chalk.red(`Agent #${opts.agent} not found.`));
      process.exit(1);
    }

    const tx = await buildClaimTaskTx(connection, wallet.publicKey, opts.task, opts.agent, new PublicKey(agent.authority));
    console.log(chalk.blue(`Claiming task #${opts.task} as agent #${opts.agent}...`));

    const sig = await sendTxRobust(tx, connection, fakeAdapter(wallet));
    console.log(chalk.green("✅ Task claimed!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
  });

// ─── submit ───
program
  .command("submit")
  .description("Agent submits completed work for client review")
  .requiredOption("--task <id>", "Task ID", parseInt)
  .requiredOption("--agent <id>", "Agent ID", parseInt)
  .option("--key <file>", "Sign with agent keypair (agent-first mode)")
  .action(async (opts) => {
    const wallet = resolveSigner(opts);
    const agents = await fetchAgents();
    const agent = agents.find((a) => a.agentId === opts.agent);
    if (!agent) {
      console.log(chalk.red(`Agent #${opts.agent} not found.`));
      process.exit(1);
    }

    const tx = await buildSubmitTaskTx(connection, wallet.publicKey, opts.task, opts.agent, new PublicKey(agent.authority));
    console.log(chalk.blue(`Submitting task #${opts.task} for review...`));

    const sig = await sendTxRobust(tx, connection, fakeAdapter(wallet));
    console.log(chalk.green("✅ Task submitted for client review!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
    console.log(chalk.gray("Status:"), "submitted (24h review window)");
  });

// ─── accept ───
program
  .command("accept")
  .description("Client accepts submitted work — releases funds + feedback")
  .requiredOption("--task <id>", "Task ID", parseInt)
  .requiredOption("--agent <id>", "Agent ID", parseInt)
  .option("--value <value>", "Feedback rating 1-5", "5")
  .option("--tag <tag>", "Feedback tag", "excellent")
  .option("--key <file>", "Sign with client keypair")
  .action(async (opts) => {
    const wallet = resolveSigner(opts);
    const agents = await fetchAgents();
    const agent = agents.find((a) => a.agentId === opts.agent);
    if (!agent) {
      console.log(chalk.red(`Agent #${opts.agent} not found.`));
      process.exit(1);
    }

    const tx = await buildAcceptTaskTx(
      connection,
      wallet.publicKey,
      opts.task,
      opts.agent,
      new PublicKey(agent.authority),
      agent.wallet && agent.wallet !== DEFAULT_PUBKEY ? new PublicKey(agent.wallet) : null,
      parseInt(opts.value),
      opts.tag
    );
    console.log(chalk.blue(`Accepting task #${opts.task} and releasing funds...`));

    const sig = await sendTxRobust(tx, connection, fakeAdapter(wallet));
    console.log(chalk.green("✅ Task accepted! Funds released to agent."));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
    console.log(chalk.gray("Feedback:"), `${opts.value}★ "${opts.tag}"`);
  });

// ─── dispute ───
program
  .command("dispute")
  .description("Client disputes submitted work — locks funds")
  .requiredOption("--task <id>", "Task ID", parseInt)
  .option("--reason <reason>", "Dispute reason", "Work does not meet requirements")
  .option("--key <file>", "Sign with client keypair")
  .action(async (opts) => {
    const wallet = resolveSigner(opts);

    const tx = await buildDisputeTaskTx(connection, wallet.publicKey, opts.task, opts.reason);
    console.log(chalk.blue(`Disputing task #${opts.task}...`));

    const sig = await sendTxRobust(tx, connection, fakeAdapter(wallet));
    console.log(chalk.green("✅ Task disputed! Funds locked for arbitration."));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
    console.log(chalk.gray("Reason:"), opts.reason);
  });

// ─── mcp ───
program
  .command("mcp")
  .description("Start MCP server for AI agent integration")
  .option("--key <file>", "Agent keypair for autonomous signing")
  .action(async (opts) => {
    if (opts.key) {
      const kp = getWalletFromKey(opts.key);
      console.log(chalk.gray("Agent keypair loaded:"), kp.publicKey.toBase58());
    }
    console.log(chalk.blue("Starting TrustGrid MCP server..."));
    console.log(chalk.gray("This gives AI agents 6 tools to interact with TrustGrid.\n"));

    const tools = [
      { name: "trustgrid_list_agents", description: "List all registered agents" },
      { name: "trustgrid_get_agent", description: "Get agent details by ID" },
      { name: "trustgrid_list_tasks", description: "List all tasks" },
      { name: "trustgrid_register_agent", description: "Register a new agent" },
      { name: "trustgrid_hire_agent", description: "Create a task to hire an agent" },
      { name: "trustgrid_give_feedback", description: "Submit feedback for an agent" },
    ];

    console.log(chalk.bold("Available tools:"));
    for (const t of tools) {
      console.log(`  ${chalk.cyan(t.name)} — ${t.description}`);
    }
    console.log(chalk.gray("\nMCP server running on stdio. Connect your AI client.\n"));

    process.stdin.resume();
  });

program.parse();
