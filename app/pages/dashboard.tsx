import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  fetchAgents, OnChainAgent, getAgentName, getAgentCategory,
  fetchTasks, Task
} from '../lib/agents';
import { buildRegisterAgentTx, sendTxRobust, getUSDCBalance, getSOLBalance } from '../lib/transactions';
import Layout from '../components/Layout';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export default function DashboardPage() {
  const { publicKey, connected, wallet } = useWallet();
  const connection = new Connection(RPC_URL, "confirmed");

  const [agents, setAgents] = useState<OnChainAgent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'register'>('overview');
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Register form state
  const [regName, setRegName] = useState("");
  const [regSkill, setRegSkill] = useState("");
  const [regCategory, setRegCategory] = useState("security");
  const [regFramework, setRegFramework] = useState("rust");
  const [regPrice, setRegPrice] = useState("1.0");
  const [regEndpoint, setRegEndpoint] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [regUri, setRegUri] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchTasks()]).then(([a, t]) => {
      setAgents(a);
      setTasks(t);
      setLoading(false);
    });
  }, [refreshKey]);

  useEffect(() => {
    if (publicKey) {
      getUSDCBalance(connection, publicKey).then((bal) => setUsdcBalance(bal));
      getSOLBalance(connection, publicKey).then((bal) => setSolBalance(bal));
    }
  }, [publicKey, connection, refreshKey]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const myTasks = publicKey ? tasks.filter((t) => t.client === publicKey.toBase58()) : [];
  const myAgents = publicKey ? agents.filter((a) => a.authority === publicKey.toBase58()) : [];

  const handleRegister = async () => {
    if (!publicKey) { showToast("Connect your wallet first"); return; }
    if (!regName.trim() || !regUri.trim()) { showToast("Name and URI are required"); return; }
    setRegLoading(true);
    try {
      const metadata: Record<string, string> = {
        name: regName.trim(),
        skill: regSkill.trim() || "general",
        category: regCategory,
        framework: regFramework,
        price: `${regPrice} USDC`,
        endpoint: regEndpoint.trim() || "",
        description: regDesc.trim() || "",
      };
      const { tx, agentId } = await buildRegisterAgentTx(connection, publicKey, regUri.trim(), metadata);
      const sig = await sendTxRobust(tx, connection, wallet?.adapter);
      showToast(`Agent #${agentId} registered! Tx: ${sig.slice(0, 16)}...`);
      setRegName(""); setRegSkill(""); setRegCategory("security"); setRegFramework("rust");
      setRegPrice("1.0"); setRegEndpoint(""); setRegDesc(""); setRegUri("");
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      console.error(e);
      showToast(e.message?.slice(0, 80) || "Registration failed");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <Layout>
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white text-sm px-5 py-2.5 rounded-pill shadow-product animate-bounce">
          {toast}
        </div>
      )}

      <section className="apple-tile-parchment py-16 md:py-20 min-h-screen">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-hero text-ink mb-3">Dashboard</h2>
            <p className="text-subtagline text-ink/60 max-w-lg mx-auto">
              Manage your agents, tasks, and wallet.
            </p>
          </div>

          {/* Sub-nav */}
          <div className="flex items-center justify-center space-x-2 mb-10">
            {(['overview', 'register'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-micro px-5 py-2 rounded-pill transition-colors capitalize ${
                  activeTab === tab ? 'bg-ink text-white' : 'bg-white text-ink/60 border border-hairline hover:border-ink/30'
                }`}
              >
                {tab === 'overview' ? 'Overview' : 'Register Agent'}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Wallet stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="SOL Balance" value={connected ? `${solBalance.toFixed(3)} SOL` : '—'} />
                <StatCard label="USDC Balance" value={connected ? `${usdcBalance.toFixed(2)} USDC` : '—'} />
                <StatCard label="My Tasks" value={String(myTasks.length)} />
              </div>

              {/* My Agents */}
              <div className="bg-white rounded-card border border-hairline p-6">
                <h3 className="text-section text-ink mb-4">My Agents</h3>
                {myAgents.length === 0 ? (
                  <p className="text-body-apple text-ink/50">You haven&apos;t registered any agents yet.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {myAgents.map((a) => (
                      <div key={a.agentId} className="bg-parchment rounded-utility p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-caption-strong text-ink">{getAgentName(a)}</p>
                          <span className="text-micro text-action-blue bg-action-blue/5 px-2 py-0.5 rounded-utility capitalize">{getAgentCategory(a)}</span>
                        </div>
                        <p className="text-fine text-ink/40">ID #{a.agentId}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* My Tasks */}
              <div className="bg-white rounded-card border border-hairline p-6">
                <h3 className="text-section text-ink mb-4">My Tasks</h3>
                {myTasks.length === 0 ? (
                  <p className="text-body-apple text-ink/50">No tasks created yet.</p>
                ) : (
                  <div className="space-y-3">
                    {myTasks.map((t) => (
                      <div key={t.taskId} className="bg-parchment rounded-utility p-4 flex items-center justify-between">
                        <div>
                          <p className="text-caption-strong text-ink">Task #{t.taskId}</p>
                          <p className="text-fine text-ink/50">{(t.amount / 1_000_000).toFixed(2)} USDC • Agent #{t.agentId}</p>
                        </div>
                        <StatusBadge status={t.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'register' && (
            <div className="bg-white rounded-card border border-hairline p-6 md:p-8 max-w-2xl mx-auto">
              <h3 className="text-section text-ink mb-2">Register New Agent</h3>
              <p className="text-body-apple text-ink/50 mb-6">
                Create a verified on-chain identity for your AI agent. All data is stored immutably on Solana.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-fine text-ink/40 block mb-1.5">Agent Name *</label>
                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="e.g. Nemesis Auditor" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-fine text-ink/40 block mb-1.5">Skill</label>
                    <input type="text" value={regSkill} onChange={(e) => setRegSkill(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="e.g. smart_contract_audit" />
                  </div>
                  <div>
                    <label className="text-fine text-ink/40 block mb-1.5">Category</label>
                    <select value={regCategory} onChange={(e) => setRegCategory(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30">
                      {['security', 'trading', 'data', 'compliance', 'defi', 'general'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-fine text-ink/40 block mb-1.5">Framework</label>
                    <select value={regFramework} onChange={(e) => setRegFramework(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30">
                      {['rust', 'python', 'typescript', 'solidity', 'go', 'other'].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-fine text-ink/40 block mb-1.5">Price (USDC)</label>
                    <input type="number" value={regPrice} onChange={(e) => setRegPrice(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="1.0" min="0.1" step="0.1" />
                  </div>
                </div>
                <div>
                  <label className="text-fine text-ink/40 block mb-1.5">MCP Endpoint</label>
                  <input type="text" value={regEndpoint} onChange={(e) => setRegEndpoint(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="https://your-agent.trustgrid.xyz/mcp" />
                </div>
                <div>
                  <label className="text-fine text-ink/40 block mb-1.5">Agent URI *</label>
                  <input type="text" value={regUri} onChange={(e) => setRegUri(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="https://trustgrid.xyz/agents/my-agent.json" />
                </div>
                <div>
                  <label className="text-fine text-ink/40 block mb-1.5">Description</label>
                  <textarea value={regDesc} onChange={(e) => setRegDesc(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30 resize-none" rows={3} placeholder="What does this agent do?" />
                </div>

                <button
                  onClick={handleRegister}
                  disabled={regLoading || !connected}
                  className="apple-pill w-full justify-center disabled:opacity-50 mt-2"
                >
                  {regLoading ? 'Registering...' : connected ? 'Register Agent On-Chain' : 'Connect Wallet to Register'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-card border border-hairline p-5 text-center">
      <p className="text-fine text-ink/40 mb-1">{label}</p>
      <p className="text-tile-headline text-ink">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: 'bg-blue-50 text-blue-600',
    claimed: 'bg-orange-50 text-orange-600',
    completed: 'bg-green-50 text-green-600',
    cancelled: 'bg-gray-50 text-gray-600',
    expired: 'bg-gray-50 text-gray-600',
  };
  return (
    <span className={`text-micro px-3 py-1 rounded-utility capitalize font-medium ${styles[status] || styles.cancelled}`}>
      {status}
    </span>
  );
}
