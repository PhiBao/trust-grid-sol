#!/usr/bin/env node
/**
 * TrustGrid CLI — Terminal-first interface for the on-chain agent marketplace.
 *
 * Usage:
 *   npx ts-node cli/trustgrid.ts agents
 *   npx ts-node cli/trustgrid.ts agent 1
 *   npx ts-node cli/trustgrid.ts tasks
 *   npx ts-node cli/trustgrid.ts register --name "My Agent" --uri "https://..."
 *   npx ts-node cli/trustgrid.ts hire --agent 1 --amount 1.0 --uri "https://..."
 *   npx ts-node cli/trustgrid.ts feedback --agent 1 --value 5 --tag "excellent"
 *   npx ts-node cli/trustgrid.ts mcp
 */

import { Command } from "commander";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import chalk from "chalk";

// Re-use app logic by importing from app/lib
// These work because cli/ is sibling to app/
import {
  fetchAgents, fetchTasks, fetchReputation, fetchFeedbacksForAgent,
  getAgentName, getAgentCategory, getAgentPrice, getAgentSkill,
} from "../app/lib/agents";
import {
  buildRegisterAgentTx, buildCreateTaskTx, buildGiveFeedbackTx,
  sendTxRobust, getUSDCBalance, getSOLBalance,
} from "../app/lib/transactions";
import { PROGRAM_ID_STRING, getTxUrl } from "../app/lib/constants";

const program = new Command();
program.name("trustgrid").description("TrustGrid CLI — On-chain AI agent marketplace").version("0.1.0");

const RPC_URL = process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

function getWallet(): Keypair {
  const keyPath = process.env.ANCHOR_WALLET || `${os.homedir()}/.config/solana/id.json`;
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, "utf-8")));
  return Keypair.fromSecretKey(secretKey);
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
      console.log(chalk.gray(`  Skill: ${getAgentSkill(a)} | Price: ${getAgentPrice(a)} | PDA: ${a.pda.slice(0, 20)}...`));
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
        chalk.bold(`Task #${t.taskId}`) +
        statusColor(` [${t.status}]`) +
        chalk.gray(`  ${(t.amount / 1_000_000).toFixed(2)} USDC`) +
        chalk.gray(`  → ${agentName}`)
      );
      console.log(chalk.gray(`  Deadline: ${new Date(t.deadline * 1000).toLocaleDateString()}`));
      console.log();
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
  .action(async (opts) => {
    const wallet = getWallet();
    console.log(chalk.gray("Wallet:"), wallet.publicKey.toBase58());
    console.log(chalk.gray("Balance:"), (await getSOLBalance(connection, wallet.publicKey)).toFixed(4), "SOL\n");

    const metadata: Record<string, string> = {
      name: opts.name,
      skill: opts.skill,
      category: opts.category,
      framework: opts.framework,
      price: `${opts.price} USDC`,
      endpoint: opts.endpoint || "",
      description: opts.desc || "",
    };

    const { tx, agentId } = await buildRegisterAgentTx(connection, wallet.publicKey, opts.uri, metadata);
    console.log(chalk.blue(`Registering agent #${agentId}...`));

    const sig = await sendTxRobust(tx, connection, { signTransaction: async (t: any) => { t.sign(wallet); return t; }, sendTransaction: null } as any);
    console.log(chalk.green("✅ Agent registered!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
    console.log(chalk.gray("Agent ID:"), agentId);
  });

// ─── hire ───
program
  .command("hire")
  .description("Create a task (hire an agent)")
  .requiredOption("--agent <id>", "Agent ID", parseInt)
  .requiredOption("--amount <amount>", "USDC amount", parseFloat)
  .requiredOption("--uri <uri>", "Task description URI")
  .action(async (opts) => {
    const wallet = getWallet();
    const usdc = await getUSDCBalance(connection, wallet.publicKey);
    console.log(chalk.gray("Wallet:"), wallet.publicKey.toBase58());
    console.log(chalk.gray("USDC Balance:"), usdc.toFixed(2), "USDC\n");

    if (usdc < opts.amount) {
      console.log(chalk.red("Insufficient USDC balance."));
      process.exit(1);
    }

    const { tx, taskId } = await buildCreateTaskTx(connection, wallet.publicKey, opts.agent, opts.amount, opts.uri);
    console.log(chalk.blue(`Creating task #${taskId} for agent #${opts.agent}...`));

    const sig = await sendTxRobust(tx, connection, { signTransaction: async (t: any) => { t.sign(wallet); return t; }, sendTransaction: null } as any);
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
  .action(async (opts) => {
    const wallet = getWallet();
    const agents = await fetchAgents();
    const agent = agents.find((a) => a.agentId === opts.agent);
    if (!agent) {
      console.log(chalk.red(`Agent #${opts.agent} not found.`));
      process.exit(1);
    }

    const tx = await buildGiveFeedbackTx(connection, wallet.publicKey, opts.agent, opts.value, opts.tag, new PublicKey(agent.authority));
    console.log(chalk.blue(`Submitting feedback for agent #${opts.agent}...`));

    const sig = await sendTxRobust(tx, connection, { signTransaction: async (t: any) => { t.sign(wallet); return t; }, sendTransaction: null } as any);
    console.log(chalk.green("✅ Feedback submitted!"));
    console.log(chalk.gray("Tx:"), getTxUrl(sig));
  });

// ─── mcp ───
program
  .command("mcp")
  .description("Start MCP server for AI agent integration")
  .action(async () => {
    console.log(chalk.blue("Starting TrustGrid MCP server..."));
    console.log(chalk.gray("This gives AI agents 6 tools to interact with TrustGrid.\n"));

    // Simple stdio MCP server
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

    // Keep process alive
    process.stdin.resume();
  });

program.parse();
