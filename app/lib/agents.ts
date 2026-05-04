import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, RPC_URL } from "./constants";

export interface OnChainAgent {
  agentId: number;
  authority: string;
  agentUri: string;
  metadata: Record<string, string>;
  wallet: string;
  active: boolean;
  createdAt: number;
  pda: string;
}

export interface AgentReputation {
  agentId: number;
  totalFeedback: number;
  averageScore: number; // scaled by 100
  feedbackCount: number;
}

export interface Feedback {
  agentId: number;
  client: string;
  value: number;
  tag: string;
  responseUri: string | null;
  createdAt: number;
  index: number;
  pda: string;
}

interface RawFeedback {
  agentId: number;
  client: string;
  value: number;
  tag: string;
  responseUri: string | null;
  createdAt: number;
  index: number;
}

export type TaskStatus = 'open' | 'claimed' | 'submitted' | 'completed' | 'cancelled' | 'expired' | 'disputed';

export interface Task {
  taskId: number;
  client: string;
  agentId: number;
  tokenMint: string;
  amount: number;
  deadline: number;
  taskUri: string;
  status: TaskStatus;
  claimedBy: string | null;
  escrowVault: string;
  submittedAt: number;
  disputeReason: string | null;
}

function readString(data: Buffer, offset: number): { value: string; nextOffset: number } {
  const len = data.readUInt32LE(offset);
  const value = data.slice(offset + 4, offset + 4 + len).toString("utf-8");
  return { value, nextOffset: offset + 4 + len };
}

function decodeAgent(data: Buffer, pda: PublicKey): OnChainAgent | null {
  try {
    let offset = 8;
    const agentId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const authority = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    const uriResult = readString(data, offset);
    const agentUri = uriResult.value;
    offset = uriResult.nextOffset;
    const metaCount = data.readUInt32LE(offset);
    offset += 4;
    const metadata: Record<string, string> = {};
    for (let i = 0; i < metaCount; i++) {
      const keyResult = readString(data, offset);
      const key = keyResult.value;
      offset = keyResult.nextOffset;
      const valResult = readString(data, offset);
      metadata[key] = valResult.value;
      offset = valResult.nextOffset;
    }
    const wallet = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    const active = data[offset] !== 0;
    offset += 1;
    const createdAt = Number(data.readBigInt64LE(offset));
    return { agentId, authority, agentUri, metadata, wallet, active, createdAt, pda: pda.toBase58() };
  } catch (e) {
    console.error("Failed to decode agent:", e);
    return null;
  }
}

function decodeReputation(data: Buffer): AgentReputation | null {
  try {
    let offset = 8;
    const agentId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const totalFeedback = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const averageScore = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const feedbackCount = Number(data.readBigUInt64LE(offset));
    return { agentId, totalFeedback, averageScore, feedbackCount };
  } catch (e) {
    console.error("Failed to decode reputation:", e);
    return null;
  }
}

function decodeTask(data: Buffer): Task | null {
  try {
    let offset = 8;
    const taskId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const client = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    const agentId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const tokenMint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    const amount = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const deadline = Number(data.readBigInt64LE(offset));
    offset += 8;
    const uriResult = readString(data, offset);
    const taskUri = uriResult.value;
    offset = uriResult.nextOffset;
    const statusCode = data[offset];
    offset += 1;
    const statusMap: Record<number, TaskStatus> = { 
      0: 'open', 1: 'claimed', 2: 'submitted', 3: 'completed', 
      4: 'cancelled', 5: 'expired', 6: 'disputed' 
    };
    const status = statusMap[statusCode] || 'open';
    const claimedByDisc = data[offset];
    offset += 1;
    const claimedBy = claimedByDisc === 1 ? new PublicKey(data.slice(offset, offset + 32)).toBase58() : null;
    offset += claimedByDisc === 1 ? 32 : 0;
    const escrowVault = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    const submittedAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const hasDispute = data[offset] === 1;
    offset += 1;
    let disputeReason: string | null = null;
    if (hasDispute) {
      const reasonResult = readString(data, offset);
      disputeReason = reasonResult.value;
      offset = reasonResult.nextOffset;
    }
    return { taskId, client, agentId, tokenMint, amount, deadline, taskUri, status, claimedBy, escrowVault, submittedAt, disputeReason };
  } catch (e) {
    console.error("Failed to decode task:", e);
    return null;
  }
}

function tryDecodeFeedback(data: Buffer): RawFeedback | null {
  try {
    if (data.length < 60) return null;
    let offset = 8;
    const agentId = Number(data.readBigUInt64LE(offset));
    offset += 8;
    const client = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    const value = data[offset];
    offset += 1;
    const tagResult = readString(data, offset);
    const tag = tagResult.value;
    offset = tagResult.nextOffset;
    const hasResponse = data[offset] === 1;
    offset += 1;
    let responseUri: string | null = null;
    if (hasResponse) {
      const respResult = readString(data, offset);
      responseUri = respResult.value;
      offset = respResult.nextOffset;
    }
    const createdAt = Number(data.readBigInt64LE(offset));
    offset += 8;
    const index = Number(data.readBigUInt64LE(offset));
    return { agentId, client, value, tag, responseUri, createdAt, index };
  } catch {
    return null;
  }
}

export async function fetchAgentCounter(): Promise<number> {
  const connection = new Connection(RPC_URL, "confirmed");
  const [counterPda] = PublicKey.findProgramAddressSync([Buffer.from("agent_counter")], PROGRAM_ID);
  const account = await connection.getAccountInfo(counterPda);
  if (!account) return 0;
  return Number(account.data.readBigUInt64LE(8));
}

export async function fetchTaskCounter(): Promise<number> {
  const connection = new Connection(RPC_URL, "confirmed");
  const [counterPda] = PublicKey.findProgramAddressSync([Buffer.from("task_counter")], PROGRAM_ID);
  const account = await connection.getAccountInfo(counterPda);
  if (!account) return 0;
  return Number(account.data.readBigUInt64LE(8));
}

export async function fetchAgents(authority?: PublicKey): Promise<OnChainAgent[]> {
  const connection = new Connection(RPC_URL, "confirmed");
  const auth = authority || new PublicKey("FzjHztL4TYQaNKQGVHV5VRAG1MVp2cvHuSN6mmduBcL3");
  const counter = await fetchAgentCounter();
  if (counter === 0) return [];
  const agents: OnChainAgent[] = [];
  for (let i = 1; i <= counter; i++) {
    const [agentPda] = PublicKey.findProgramAddressSync([
      Buffer.from("agent"), auth.toBuffer(), Buffer.from(new Uint8Array(new BigUint64Array([BigInt(i)]).buffer)),
    ], PROGRAM_ID);
    try {
      const account = await connection.getAccountInfo(agentPda);
      if (account && account.data.length > 8) {
        const agent = decodeAgent(account.data, agentPda);
        if (agent && agent.active) agents.push(agent);
      }
    } catch { /* skip */ }
  }
  return agents;
}

export async function fetchReputation(agentId: number): Promise<AgentReputation | null> {
  const connection = new Connection(RPC_URL, "confirmed");
  const [repPda] = PublicKey.findProgramAddressSync([
    Buffer.from("reputation"), Buffer.from(new Uint8Array(new BigUint64Array([BigInt(agentId)]).buffer)),
  ], PROGRAM_ID);
  const account = await connection.getAccountInfo(repPda);
  if (!account || account.data.length <= 8) return null;
  return decodeReputation(account.data);
}

export async function fetchFeedbacksForAgent(agentId: number): Promise<Feedback[]> {
  const connection = new Connection(RPC_URL, "confirmed");
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: 8 + 8 + 32 + 1 + 4 + 50 + 1 + 4 + 200 + 8 + 8 }],
  });
  const feedbacks: Feedback[] = [];
  for (const { pubkey, account } of accounts) {
    const fb = tryDecodeFeedback(account.data);
    if (fb && fb.agentId === agentId) {
      feedbacks.push({ ...fb, pda: pubkey.toBase58() });
    }
  }
  return feedbacks.sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchTasks(): Promise<Task[]> {
  const connection = new Connection(RPC_URL, "confirmed");
  const counter = await fetchTaskCounter();
  if (counter === 0) return [];
  const tasks: Task[] = [];
  for (let i = 1; i <= counter; i++) {
    const [taskPda] = PublicKey.findProgramAddressSync([
      Buffer.from("task"), Buffer.from(new Uint8Array(new BigUint64Array([BigInt(i)]).buffer)),
    ], PROGRAM_ID);
    try {
      const account = await connection.getAccountInfo(taskPda);
      if (account && account.data.length > 8) {
        const task = decodeTask(account.data);
        if (task) tasks.push(task);
      }
    } catch { /* skip */ }
  }
  return tasks;
}

export function getAgentPrice(agent: OnChainAgent): string {
  return agent.metadata["price"] || "0 USDC";
}

export function getAgentCategory(agent: OnChainAgent): string {
  return agent.metadata["category"] || "General";
}

export function getAgentName(agent: OnChainAgent): string {
  return agent.metadata["name"] || `Agent #${agent.agentId}`;
}

export function getAgentSkill(agent: OnChainAgent): string {
  return agent.metadata["skill"] || "";
}

export function getAgentFramework(agent: OnChainAgent): string {
  return agent.metadata["framework"] || "";
}

export function getAgentEndpoint(agent: OnChainAgent): string {
  return agent.metadata["endpoint"] || "";
}
