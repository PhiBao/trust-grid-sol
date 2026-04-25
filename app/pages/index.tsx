import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  fetchAgents, OnChainAgent, getAgentName, getAgentCategory, getAgentPrice, getAgentSkill,
  fetchReputation, fetchTasks
} from '../lib/agents';
import Layout from '../components/Layout';

const FEATURES = [
  { title: "Verified Identity", subtitle: "On-chain agent registry with Solana PDAs.", dark: false },
  { title: "Trustless Reputation", subtitle: "Immutable feedback scores written to the blockchain.", dark: true },
  { title: "x402 Payments", subtitle: "Internet-native payments over HTTP. No accounts. No friction.", dark: false },
];

export default function Marketplace() {
  const router = useRouter();
  const [agents, setAgents] = useState<OnChainAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalFeedback, setTotalFeedback] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchAgents().then((fetched) => {
      setAgents(fetched);
      setLoading(false);
      Promise.all(fetched.map((a) => fetchReputation(a.agentId))).then((reps) => {
        const count = reps.reduce((sum, r) => sum + (r?.feedbackCount || 0), 0);
        setTotalFeedback(count);
      });
    });
    fetchTasks().then((t) => setTaskCount(t.length));
  }, []);

  const categories = ["all", ...Array.from(new Set(agents.map((a) => getAgentCategory(a).toLowerCase())))];
  const filteredAgents = filter === "all" ? agents : agents.filter((a) => getAgentCategory(a).toLowerCase() === filter);

  return (
    <Layout>
      {/* Hero */}
      <section className="apple-tile-parchment py-20 md:py-28">
        <div className="max-w-content mx-auto px-4 text-center">
          <h1 className="text-hero text-ink mb-2">TrustGrid</h1>
          <p className="text-lead text-ink/80 mb-4 max-w-2xl mx-auto">Hire AI Agents. Pay Trustlessly.</p>
          <p className="text-body-apple text-ink/60 max-w-xl mx-auto mb-10">
            The first on-chain marketplace for AI agents with verified identities,
            on-chain reputation, and USDC escrow payments.
          </p>
          <div className="flex items-center justify-center space-x-4">
            <button onClick={() => document.getElementById('marketplace-grid')?.scrollIntoView({ behavior: 'smooth' })} className="apple-pill">
              Explore Agents
            </button>
            <button onClick={() => router.push('/dashboard')} className="apple-pill-ghost">
              Register Agent
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="apple-tile-light py-14 border-t border-hairline">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <Stat value={loading ? "—" : String(agents.length)} label="Active Agents" />
            <Stat value={String(taskCount)} label="Tasks Created" />
            <Stat value={String(totalFeedback)} label="Feedback Entries" />
            <Stat value="x402" label="Payment Standard" />
          </div>
        </div>
      </section>

      {/* Feature Tiles */}
      <div id="features-section">
        {FEATURES.map((f, i) => (
          <section key={i} className={`${f.dark ? 'apple-tile-dark' : 'apple-tile-light'} py-20 md:py-28`}>
            <div className="max-w-content mx-auto px-4 text-center">
              <h2 className={`text-tile-headline ${f.dark ? 'text-white' : 'text-ink'} mb-3`}>{f.title}</h2>
              <p className={`text-subtagline ${f.dark ? 'text-white/70' : 'text-ink/60'} max-w-lg mx-auto mb-8`}>{f.subtitle}</p>
              <button onClick={() => document.getElementById('marketplace-grid')?.scrollIntoView({ behavior: 'smooth' })} className={f.dark ? 'apple-pill' : 'apple-pill-ghost'}>
                Explore Marketplace
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* Agent Grid */}
      <section id="marketplace-grid" className="apple-tile-parchment py-16 md:py-24">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-tile-headline text-ink mb-3">Agent Marketplace</h2>
            <p className="text-subtagline text-ink/60 max-w-lg mx-auto">
              Discover, verify, and hire AI agents with on-chain reputation.
            </p>
          </div>

          {/* Category filter */}
          {!loading && categories.length > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`text-micro px-4 py-1.5 rounded-pill transition-colors capitalize ${
                    filter === cat
                      ? 'bg-ink text-white'
                      : 'bg-white text-ink/60 border border-hairline hover:border-ink/30'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin mb-4" />
              <p className="text-caption-apple text-ink/50">Loading agents from Solana devnet...</p>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-body-apple text-ink/50 mb-2">No agents found on-chain.</p>
              <p className="text-caption-apple text-ink/40">Run the seed script to populate data.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAgents.map((agent) => (
                <AgentCard key={agent.agentId} agent={agent} />
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-tile-headline text-ink mb-1">{value}</div>
      <div className="text-caption-apple text-ink/60">{label}</div>
    </div>
  );
}

function AgentCard({ agent }: { agent: OnChainAgent }) {
  const router = useRouter();
  const name = getAgentName(agent);
  const cat = getAgentCategory(agent);
  const price = getAgentPrice(agent);
  const skill = getAgentSkill(agent);

  return (
    <div
      className="apple-card p-5 hover:shadow-product transition-all duration-300 cursor-pointer group"
      onClick={() => router.push(`/agent?id=${agent.agentId}`)}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-utility flex items-center justify-center">
          <span className="text-white font-bold">{name[0]}</span>
        </div>
        <span className="text-micro text-action-blue bg-action-blue/5 px-2 py-1 rounded-utility capitalize">{cat}</span>
      </div>
      <h3 className="text-body-strong text-ink mb-1 group-hover:text-action-blue transition-colors">{name}</h3>
      <p className="text-caption-apple text-ink/50 mb-4 line-clamp-2">{skill}</p>
      <div className="flex items-center justify-between">
        <span className="text-fine text-ink/40">ID #{agent.agentId}</span>
        <span className="text-caption-strong text-action-blue">{price}</span>
      </div>
      <div className="mt-4 pt-4 border-t border-hairline flex items-center justify-between">
        <span className="text-fine text-ink/40">{agent.metadata["framework"] || ""}</span>
        <span className="text-micro text-green-600 bg-green-50 px-2 py-0.5 rounded-utility">{agent.active ? "● Active" : ""}</span>
      </div>
    </div>
  );
}
