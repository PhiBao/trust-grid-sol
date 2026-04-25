import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Connection } from '@solana/web3.js';
import {
  fetchAgents, OnChainAgent, getAgentName, getAgentCategory, getAgentPrice, getAgentSkill,
  fetchReputation, AgentReputation, fetchTasks, Task, fetchFeedbacksForAgent, Feedback
} from '../lib/agents';
import { buildGiveFeedbackTx, buildCreateTaskTx, sendTxRobust, getUSDCBalance, getSOLBalance } from '../lib/transactions';
import Layout from '../components/Layout';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

export default function AgentDetailPage() {
  const router = useRouter();
  const { publicKey, connected, wallet } = useWallet();
  const connection = new Connection(RPC_URL, "confirmed");

  // Data state
  const [agent, setAgent] = useState<OnChainAgent | null>(null);
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [toast, setToast] = useState<string | null>(null);
  const [feedbackValue, setFeedbackValue] = useState(5);
  const [feedbackTag, setFeedbackTag] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);

  // Hire modal state
  const [hireOpen, setHireOpen] = useState(false);
  const [taskAmount, setTaskAmount] = useState("1.0");
  const [taskUri, setTaskUri] = useState("");
  const [taskLoading, setTaskLoading] = useState(false);

  // Load everything once router is ready
  useEffect(() => {
    if (!router.isReady) return;

    const rawId = router.query.id;
    let id: number | null = null;
    if (rawId) {
      id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
    } else if (typeof window !== 'undefined') {
      const idParam = new URLSearchParams(window.location.search).get('id');
      if (idParam) id = parseInt(idParam, 10);
    }

    if (id == null) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      fetchAgents(),
      fetchTasks(),
    ]).then(([agents, allTasks]) => {
      if (cancelled) return;
      const found = agents.find((a) => a.agentId === id);
      setAgent(found || null);
      setTasks(allTasks);
      setLoading(false);

      if (found) {
        fetchReputation(found.agentId).then((r) => { if (!cancelled) setReputation(r); });
        fetchFeedbacksForAgent(found.agentId).then((f) => { if (!cancelled) setFeedbacks(f); });
      }
    });

    return () => { cancelled = true; };
  }, [router.isReady, router.query.id]);

  // Load wallet balances
  useEffect(() => {
    if (!publicKey) return;
    getUSDCBalance(connection, publicKey).then(setUsdcBalance);
    getSOLBalance(connection, publicKey).then(setSolBalance);
  }, [publicKey, connection]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    }
  };

  const handleGiveFeedback = async () => {
    if (!publicKey || !agent) { showToast("Connect your wallet first"); return; }
    if (!feedbackTag.trim()) { showToast("Enter a feedback tag"); return; }
    setFeedbackLoading(true);
    try {
      const tx = await buildGiveFeedbackTx(connection, publicKey, agent.agentId, feedbackValue, feedbackTag.trim(), new PublicKey(agent.authority));
      const sig = await sendTxRobust(tx, connection, wallet?.adapter);
      showToast(`Feedback submitted! Tx: ${sig.slice(0, 16)}...`);
      setFeedbackTag(""); setFeedbackValue(5);
      const [rep, fbList] = await Promise.all([
        fetchReputation(agent.agentId),
        fetchFeedbacksForAgent(agent.agentId)
      ]);
      setReputation(rep); setFeedbacks(fbList);
    } catch (e: any) {
      showToast(e.message?.slice(0, 60) || "Feedback failed");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!publicKey || !agent) { showToast("Connect your wallet first"); return; }
    const amount = parseFloat(taskAmount);
    if (isNaN(amount) || amount <= 0) { showToast("Enter a valid amount"); return; }
    if (!taskUri.trim()) { showToast("Enter a task description URI"); return; }
    if (usdcBalance < amount) { showToast(`Insufficient USDC. You have ${usdcBalance.toFixed(2)} USDC`); return; }
    setTaskLoading(true);
    try {
      const { tx, taskId } = await buildCreateTaskTx(connection, publicKey, agent.agentId, amount, taskUri.trim());
      const sig = await sendTxRobust(tx, connection, wallet?.adapter);
      showToast(`Task #${taskId} created! Tx: ${sig.slice(0, 16)}...`);
      setHireOpen(false); setTaskUri(""); setTaskAmount("1.0");
      const newTasks = await fetchTasks();
      setTasks(newTasks);
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Task creation failed");
    } finally {
      setTaskLoading(false);
    }
  };

  const agentTasks = agent ? tasks.filter((t) => t.agentId === agent.agentId) : [];
  const name = agent ? getAgentName(agent) : "";
  const cat = agent ? getAgentCategory(agent) : "";

  return (
    <Layout>
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white text-sm px-5 py-2.5 rounded-pill shadow-product animate-bounce">
          {toast}
        </div>
      )}

      <main className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back */}
        <button onClick={() => router.push('/')} className="text-caption-apple text-action-blue hover:underline mb-8 inline-block">
          ← Back to Marketplace
        </button>

        {loading ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin mb-4" />
              <p className="text-caption-apple text-ink/50">Loading agent from devnet...</p>
            </div>
          </div>
        ) : !agent ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="text-center">
              <p className="text-body-apple text-ink/50 mb-4">Agent not found on-chain.</p>
              <button onClick={() => router.push('/')} className="apple-pill">Back to Marketplace</button>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start md:space-x-6 mb-10">
              <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-utility flex items-center justify-center flex-shrink-0 mb-4 md:mb-0">
                <span className="text-white font-bold text-3xl">{name[0]}</span>
              </div>
              <div className="flex-1">
                <h1 className="text-hero text-ink mb-2">{name}</h1>
                <span className="inline-block text-micro text-action-blue bg-action-blue/5 px-3 py-1 rounded-utility capitalize mb-3">
                  {cat}
                </span>
                <p className="text-body-apple text-ink/60 max-w-2xl">
                  {agent.metadata["description"] || getAgentSkill(agent)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left: details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Reputation */}
                <div className="bg-parchment rounded-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-section text-ink">On-Chain Reputation</h3>
                    {reputation && reputation.feedbackCount > 0 && (
                      <span className="text-caption-strong text-ink">{(reputation.averageScore / 100).toFixed(1)} / 5.0</span>
                    )}
                  </div>
                  {reputation && reputation.feedbackCount > 0 ? (
                    <div className="flex items-center space-x-1 mb-4">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className={`text-xl ${star <= Math.round(reputation.averageScore / 100) ? 'text-yellow-500' : 'text-ink/20'}`}>★</span>
                      ))}
                      <span className="text-caption-apple text-ink/50 ml-2">{reputation.feedbackCount} reviews</span>
                    </div>
                  ) : (
                    <p className="text-body-apple text-ink/50 mb-4">No feedback yet. Be the first to review.</p>
                  )}

                  {/* Feedback list */}
                  {feedbacks.length > 0 && (
                    <div className="mt-4 border-t border-hairline pt-4">
                      <p className="text-caption-apple text-ink/50 mb-3">{feedbacks.length} review{feedbacks.length > 1 ? 's' : ''}</p>
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {feedbacks.map((fb, i) => (
                          <div key={i} className="bg-white rounded-utility p-3 flex items-start space-x-3">
                            <div className="flex items-center space-x-0.5 flex-shrink-0">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <span key={s} className={`text-xs ${s <= fb.value ? 'text-yellow-500' : 'text-ink/20'}`}>★</span>
                              ))}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-caption-apple text-ink">{fb.tag}</p>
                              <p className="text-fine text-ink/40">{new Date(fb.createdAt * 1000).toLocaleDateString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="bg-white rounded-card border border-hairline p-6">
                  <h3 className="text-section text-ink mb-4">Agent Details</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <DetailItem label="Skill" value={getAgentSkill(agent)} />
                    <DetailItem label="Framework" value={agent.metadata["framework"] || "—"} />
                    <DetailItem label="Price" value={getAgentPrice(agent)} />
                    <DetailItem label="Agent ID" value={`#${agent.agentId}`} />
                    <DetailItem label="Status" value={agent.active ? "Active" : "Inactive"} />
                    <DetailItem label="Created" value={new Date(agent.createdAt * 1000).toLocaleDateString()} />
                  </div>
                </div>

                {/* PDA */}
                <div className="bg-parchment rounded-card p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-section text-ink">PDA Address</h3>
                    <button onClick={() => copyToClipboard(agent.pda)} className="text-caption-apple text-action-blue hover:underline">Copy</button>
                  </div>
                  <p className="text-caption-apple text-ink font-mono break-all">{agent.pda}</p>
                </div>

                {/* Endpoint */}
                {agent.metadata["endpoint"] && (
                  <div className="bg-parchment rounded-card p-6">
                    <h3 className="text-section text-ink mb-2">MCP Endpoint</h3>
                    <p className="text-caption-apple text-ink font-mono break-all">{agent.metadata["endpoint"]}</p>
                  </div>
                )}

                {/* Task History */}
                <div className="bg-white rounded-card border border-hairline p-6">
                  <h3 className="text-section text-ink mb-4">Task History</h3>
                  {agentTasks.length === 0 ? (
                    <p className="text-body-apple text-ink/50">No tasks yet for this agent.</p>
                  ) : (
                    <div className="space-y-3">
                      {agentTasks.map((t) => (
                        <div key={t.taskId} className="bg-parchment rounded-utility p-4 flex items-center justify-between">
                          <div>
                            <p className="text-caption-strong text-ink">Task #{t.taskId}</p>
                            <p className="text-fine text-ink/50">{(t.amount / 1_000_000).toFixed(2)} USDC • Deadline: {new Date(t.deadline * 1000).toLocaleDateString()}</p>
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right: actions */}
              <div className="space-y-6">
                {/* Hire card */}
                <div className="bg-white rounded-card border border-hairline p-6 sticky top-20">
                  <h3 className="text-section text-ink mb-4">Hire {name}</h3>
                  <p className="text-body-apple text-ink/60 mb-6">
                    Create a task with USDC escrow. Funds are held trustlessly until completion.
                  </p>

                  {connected && (
                    <div className="space-y-2 mb-4">
                      <div className="bg-parchment rounded-utility p-3 flex items-center justify-between">
                        <span className="text-fine text-ink/40">Your SOL</span>
                        <span className="text-caption-strong text-ink">{solBalance.toFixed(3)} SOL</span>
                      </div>
                      <div className="bg-parchment rounded-utility p-3 flex items-center justify-between">
                        <span className="text-fine text-ink/40">Your USDC</span>
                        <span className="text-caption-strong text-ink">{usdcBalance.toFixed(2)} USDC</span>
                      </div>
                    </div>
                  )}

                  <button onClick={() => setHireOpen(true)} className="apple-pill w-full justify-center mb-3">
                    Hire for {getAgentPrice(agent)}
                  </button>
                  <p className="text-fine text-ink/40 text-center">1% protocol fee applies</p>
                </div>

                {/* Agent URI */}
                <div className="bg-parchment rounded-card p-4">
                  <span className="text-fine text-ink/40 block mb-1">Agent URI</span>
                  <p className="text-caption-apple text-ink font-mono break-all">{agent.agentUri}</p>
                </div>

                {/* Feedback card */}
                <div className="bg-white rounded-card border border-hairline p-6">
                  <h3 className="text-section text-ink mb-4">Give Feedback</h3>
                  <div className="flex items-center space-x-2 mb-4">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button key={star} onClick={() => setFeedbackValue(star)} className={`text-2xl transition-colors ${star <= feedbackValue ? 'text-yellow-500' : 'text-ink/20 hover:text-ink/40'}`}>★</button>
                    ))}
                    <span className="text-fine text-ink/50 ml-2">{feedbackValue}/5</span>
                  </div>
                  <input
                    type="text"
                    value={feedbackTag}
                    onChange={(e) => setFeedbackTag(e.target.value)}
                    placeholder="Tag (e.g. excellent, fast)"
                    className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30 mb-3"
                    maxLength={50}
                  />
                  <button
                    onClick={handleGiveFeedback}
                    disabled={feedbackLoading || !connected}
                    className="apple-pill-ghost w-full justify-center disabled:opacity-50"
                  >
                    {feedbackLoading ? 'Submitting...' : connected ? 'Submit On-Chain Feedback' : 'Connect Wallet'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Hire Modal */}
      {hireOpen && agent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setHireOpen(false)}>
          <div className="bg-white rounded-card max-w-md w-full p-6 md:p-8 shadow-product" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-section text-ink">Create Task</h3>
                <p className="text-caption-apple text-ink/50 mt-1">Hire {name}</p>
              </div>
              <button onClick={() => setHireOpen(false)} className="w-8 h-8 rounded-full bg-chip-gray flex items-center justify-center text-ink hover:bg-chip-gray/80 transition-colors text-sm">✕</button>
            </div>

            {connected && (
              <div className="bg-parchment rounded-utility p-3 mb-4 flex items-center justify-between">
                <span className="text-fine text-ink/40">Your USDC</span>
                <span className="text-caption-strong text-ink">{usdcBalance.toFixed(2)} USDC</span>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-fine text-ink/40 block mb-1.5">Amount (USDC)</label>
                <input type="number" value={taskAmount} onChange={(e) => setTaskAmount(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="1.0" min="0.1" step="0.1" />
              </div>
              <div>
                <label className="text-fine text-ink/40 block mb-1.5">Task Description URI</label>
                <input type="text" value={taskUri} onChange={(e) => setTaskUri(e.target.value)} className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30" placeholder="https://..." />
              </div>
            </div>

            <div className="bg-parchment rounded-utility p-3 mb-6">
              <div className="flex items-center justify-between text-caption-apple text-ink/60">
                <span>Service Fee (1%)</span>
                <span>{(parseFloat(taskAmount || "0") * 0.01).toFixed(3)} USDC</span>
              </div>
              <div className="flex items-center justify-between text-body-strong text-ink mt-1">
                <span>Total</span>
                <span>{(parseFloat(taskAmount || "0") * 1.01).toFixed(3)} USDC</span>
              </div>
            </div>

            <button onClick={handleCreateTask} disabled={taskLoading || !connected} className="apple-pill w-full justify-center disabled:opacity-50">
              {taskLoading ? 'Creating Task...' : connected ? 'Create Task with Escrow' : 'Connect Wallet'}
            </button>

            {connected && usdcBalance < parseFloat(taskAmount || "0") && (
              <p className="text-center text-fine text-red-500 mt-3">Insufficient USDC. You need devnet USDC to create tasks.</p>
            )}

            <p className="text-center text-fine text-ink/40 mt-3">Funds are held in a PDA escrow vault until task completion.</p>
          </div>
        </div>
      )}
    </Layout>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-fine text-ink/40 block mb-1">{label}</span>
      <p className="text-body-strong text-ink">{value}</p>
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
