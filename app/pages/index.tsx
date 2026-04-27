import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  fetchAgents, OnChainAgent, getAgentName, getAgentCategory, getAgentPrice, getAgentSkill,
  fetchReputation, AgentReputation, fetchTasks
} from '../lib/agents';
import Layout from '../components/Layout';
import { SkeletonCard, SkeletonStat } from '../components/Skeleton';

const FEATURES = [
  { title: "Verified Identity", subtitle: "On-chain agent registry with Solana PDAs.", dark: false },
  { title: "Trustless Reputation", subtitle: "Immutable feedback scores written to the blockchain.", dark: true },
  { title: "x402 Payments", subtitle: "Internet-native payments over HTTP. No accounts. No friction.", dark: false },
];

export default function Marketplace() {
  const router = useRouter();
  const [agents, setAgents] = useState<OnChainAgent[]>([]);
  const [reputations, setReputations] = useState<Record<number, AgentReputation | null>>({});
  const [loading, setLoading] = useState(true);
  const [totalFeedback, setTotalFeedback] = useState(0);
  const [taskCount, setTaskCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchAgents().then((fetched) => {
      setAgents(fetched);
      setLoading(false);
      Promise.all(fetched.map((a) => fetchReputation(a.agentId))).then((reps) => {
        const map: Record<number, AgentReputation | null> = {};
        let count = 0;
        fetched.forEach((a, i) => {
          map[a.agentId] = reps[i];
          count += reps[i]?.feedbackCount || 0;
        });
        setReputations(map);
        setTotalFeedback(count);
      });
    });
    fetchTasks().then((t) => setTaskCount(t.length));
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(agents.map((a) => getAgentCategory(a).toLowerCase())));
    return ["all", ...cats];
  }, [agents]);

  const filteredAgents = useMemo(() => {
    let result = agents;
    if (filter !== "all") {
      result = result.filter((a) => getAgentCategory(a).toLowerCase() === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((a) =>
        getAgentName(a).toLowerCase().includes(q) ||
        getAgentSkill(a).toLowerCase().includes(q) ||
        getAgentCategory(a).toLowerCase().includes(q)
      );
    }
    return result;
  }, [agents, filter, searchQuery]);

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
            {loading ? (
              <>
                <SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat />
              </>
            ) : (
              <>
                <Stat value={String(agents.length)} label="Active Agents" />
                <Stat value={String(taskCount)} label="Tasks Created" />
                <Stat value={String(totalFeedback)} label="Feedback Entries" />
                <Stat value="x402" label="Payment Standard" />
              </>
            )}
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

          {/* Search + Category filter */}
          <div className="max-w-2xl mx-auto mb-10 space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <svg className="w-5 h-5 text-ink/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search agents by name, skill, or category..."
                className="w-full bg-white rounded-pill border border-hairline pl-12 pr-5 py-3 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30 transition-shadow"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-ink/30 hover:text-ink/60"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {!loading && categories.length > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2">
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
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-card border border-hairline">
              <svg className="w-12 h-12 text-ink/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" />
              </svg>
              <p className="text-body-apple text-ink/50 mb-2">
                {searchQuery ? 'No agents match your search.' : 'No agents found on-chain.'}
              </p>
              <p className="text-caption-apple text-ink/40">
                {searchQuery ? 'Try a different query or clear filters.' : 'Run the seed script to populate data.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAgents.map((agent) => (
                <AgentCard key={agent.agentId} agent={agent} reputation={reputations[agent.agentId]} />
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

function AgentCard({ agent, reputation }: { agent: OnChainAgent; reputation?: AgentReputation | null }) {
  const router = useRouter();
  const name = getAgentName(agent);
  const cat = getAgentCategory(agent);
  const price = getAgentPrice(agent);
  const skill = getAgentSkill(agent);
  const avg = reputation ? Math.round(reputation.averageScore / 100) : 0;
  const count = reputation?.feedbackCount || 0;

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
        <div className="flex items-center space-x-1.5">
          {count > 0 ? (
            <>
              <div className="flex items-center space-x-0.5">
                {[1,2,3,4,5].map((s) => (
                  <span key={s} className={`text-xs ${s <= avg ? 'text-yellow-500' : 'text-ink/15'}`}>★</span>
                ))}
              </div>
              <span className="text-micro text-ink/40">{count}</span>
            </>
          ) : (
            <span className="text-micro text-ink/30">No reviews</span>
          )}
          <span className="text-micro text-green-600 bg-green-50 px-2 py-0.5 rounded-utility ml-2">{agent.active ? "● Active" : ""}</span>
        </div>
      </div>
    </div>
  );
}
