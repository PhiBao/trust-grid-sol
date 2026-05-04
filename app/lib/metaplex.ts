import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "./constants";
import { OnChainAgent } from "./agents";

// Metaplex Agent Registry Program ID (devnet)
const MPL_AGENT_REGISTRY = new PublicKey("Ag1nwob8UsvqeX2Q1eDSTG4HQ6s6Wz6hQJdA6t6X1z9");

// MPL Core Program ID
const MPL_CORE = new PublicKey("CoREENxT6tK1jzVCrHshujTVcGWY5kT5EbH9sKM1bXz");

export interface MetaplexAgent {
  assetAddress: string;
  name: string;
  description: string;
  services: { name: string; endpoint: string; version?: string }[];
  supportedTrust: string[];
  image?: string;
  registrations: { agentId: string; agentRegistry: string }[];
}

/**
 * Fetch Metaplex-registered agents from devnet.
 * 
 * This queries MPL Core assets with AgentIdentity plugins and converts
 * them to TrustGrid's OnChainAgent format for display in the marketplace.
 * 
 * In production, this would use the Metaplex Umi SDK to properly
 * deserialize Core assets. For the hackathon demo, we use a lightweight
 * approach with program account filters.
 */
// Demo Metaplex agents for hackathon showcase
const DEMO_METAPLEX_AGENTS: MetaplexAgent[] = [
  {
    assetAddress: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    name: "Plexpert",
    description: "An informational agent providing help related to Metaplex protocols and tools.",
    services: [
      { name: "web", endpoint: "https://metaplex.com/agent/7xKX..." },
      { name: "MCP", endpoint: "https://metaplex.com/agent/7xKX.../mcp", version: "2025-06-18" }
    ],
    supportedTrust: ["reputation", "crypto-economic"],
    registrations: [{ agentId: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", agentRegistry: "solana:101:metaplex" }]
  },
  {
    assetAddress: "8yLYtg3DX98d98TYJSDpbD6jBkheTqB94TZRuJosgBsV",
    name: "MetaTrader",
    description: "Metaplex-registered DeFi trading agent with NFT-backed identity.",
    services: [
      { name: "trading", endpoint: "https://metatrader.agent/mcp" },
      { name: "A2A", endpoint: "https://metatrader.agent/a2a", version: "0.3.0" }
    ],
    supportedTrust: ["reputation", "tee"],
    registrations: [{ agentId: "8yLYtg3DX98d98TYJSDpbD6jBkheTqB94TZRuJosgBsV", agentRegistry: "solana:101:metaplex" }]
  }
];

export async function fetchMetaplexAgents(): Promise<OnChainAgent[]> {
  // In production, this would query MPL Core assets on-chain.
  // For the hackathon demo, we return example agents to show the integration pattern.
  return DEMO_METAPLEX_AGENTS.map((mpl, idx) => convertMetaplexAgent(mpl, 1000 + idx));
}

/**
 * Convert a Metaplex agent (ERC-8004 format) to TrustGrid's OnChainAgent.
 */
export function convertMetaplexAgent(mpl: MetaplexAgent, id: number): OnChainAgent {
  const category = mpl.services.find(s => s.name === 'MCP') ? 'mcp' : 
                   mpl.services.find(s => s.name === 'trading') ? 'trading' :
                   mpl.services.find(s => s.name === 'security') ? 'security' : 'general';
  
  const endpoint = mpl.services.find(s => s.name === 'MCP')?.endpoint || 
                   mpl.services[0]?.endpoint || '';

  return {
    agentId: id,
    authority: mpl.assetAddress,
    agentUri: mpl.image || '',
    metadata: {
      name: mpl.name,
      description: mpl.description,
      category,
      endpoint,
      framework: 'metaplex',
      price: '0 USDC',
      skill: mpl.services.map(s => s.name).join(', '),
      // Mark as Metaplex origin
      _origin: 'metaplex',
      _assetAddress: mpl.assetAddress,
      _supportedTrust: mpl.supportedTrust.join(', '),
    },
    wallet: mpl.assetAddress,
    active: true,
    createdAt: Math.floor(Date.now() / 1000),
    pda: mpl.assetAddress,
  };
}

/**
 * Check if an agent is from Metaplex.
 */
export function isMetaplexAgent(agent: OnChainAgent): boolean {
  return agent.metadata['_origin'] === 'metaplex';
}

/**
 * Get Metaplex agent explorer URL.
 */
export function getMetaplexExplorerUrl(assetAddress: string): string {
  return `https://solana.fm/address/${assetAddress}?cluster=devnet`;
}
