import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey } from '@solana/web3.js';
import { fetchTasks, Task, fetchAgents, OnChainAgent, getAgentName, getAgentCategory, fetchReputation, AgentReputation } from '../lib/agents';
import { buildAcceptTaskTx, buildDisputeTaskTx, sendTxRobust } from '../lib/transactions';
import { getTxUrl, getAccountUrl, getTaskPda } from '../lib/constants';
import Layout from '../components/Layout';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_PUBKEY = "11111111111111111111111111111111";

async function fetchVaultTx(connection: Connection, vaultAddress: string): Promise<string | null> {
  try {
    const sigs = await connection.getSignaturesForAddress(new PublicKey(vaultAddress), { limit: 3 });
    if (sigs.length > 0) return sigs[0].signature;
    return null;
  } catch { return null; }
}

interface ToastState {
  message: string;
  signature?: string;
}

export default function TaskDetailPage() {
  const router = useRouter();
  const { publicKey, connected, wallet } = useWallet();
  const connection = new Connection(RPC_URL, "confirmed");

  const [task, setTask] = useState<Task | null>(null);
  const [agent, setAgent] = useState<OnChainAgent | null>(null);
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackValue, setFeedbackValue] = useState(5);
  const [feedbackTag, setFeedbackTag] = useState("excellent");
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [actionSignature, setActionSignature] = useState<string | null>(null);

  const refreshData = async () => {
    if (!router.isReady) return;
    const rawId = router.query.id;
    let id: number | null = null;
    if (rawId) {
      id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
    } else if (typeof window !== 'undefined') {
      const idParam = new URLSearchParams(window.location.search).get('id');
      if (idParam) id = parseInt(idParam, 10);
    }
    if (id == null) { setLoading(false); return; }

    const [tasks, agents] = await Promise.all([fetchTasks(), fetchAgents()]);
    const found = tasks.find(t => t.taskId === id);
    setTask(found || null);
    if (found) {
      const ag = agents.find(a => a.agentId === found.agentId);
      setAgent(ag || null);
      if (ag) {
        const rep = await fetchReputation(ag.agentId);
        setReputation(rep);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, [router.isReady, router.query.id]);

  useEffect(() => {
    if (task && (task.status === 'completed' || task.status === 'disputed') && !actionSignature) {
      fetchVaultTx(connection, task.escrowVault).then(sig => {
        if (sig) setActionSignature(sig);
      });
    }
  }, [task?.taskId, task?.status]);

  const showToast = (message: string, signature?: string) => {
    setToast({ message, signature });
    setTimeout(() => setToast(null), 5000);
  };

  const isClient = task && publicKey ? task.client === publicKey.toBase58() : false;

  const getReviewTimeLeft = (submittedAt: number) => {
    const end = submittedAt + 24 * 60 * 60;
    const remaining = end - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return "Expired";
    const hours = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    return `${hours}h ${mins}m remaining`;
  };

  const handleAccept = async () => {
    if (!publicKey || !wallet?.adapter || !task || !agent) return;
    setActionLoading(true);
    try {
      const agentAuthority = new PublicKey(agent.authority);
      const agentWallet = agent.wallet && agent.wallet !== DEFAULT_PUBKEY ? new PublicKey(agent.wallet) : null;
      const tx = await buildAcceptTaskTx(connection, publicKey, task.taskId, task.agentId, agentAuthority, agentWallet, feedbackValue, feedbackTag);
      const sig = await sendTxRobust(tx, connection, wallet.adapter);
      setActionSignature(sig);
      showToast("Task accepted! Funds released to agent.", sig);
      await refreshData();
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Accept failed");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDispute = async () => {
    if (!publicKey || !wallet?.adapter || !task) return;
    if (!disputeReason.trim()) { showToast("Enter a dispute reason"); return; }
    setActionLoading(true);
    try {
      const tx = await buildDisputeTaskTx(connection, publicKey, task.taskId, disputeReason.trim());
      const sig = await sendTxRobust(tx, connection, wallet.adapter);
      setActionSignature(sig);
      showToast("Task disputed! Funds locked.", sig);
      setShowDispute(false);
      await refreshData();
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Dispute failed");
    } finally {
      setActionLoading(false);
    }
  };

  const statusStyles: Record<string, string> = {
    open: 'bg-blue-50 text-blue-700 border-blue-200',
    claimed: 'bg-orange-50 text-orange-700 border-orange-200',
    submitted: 'bg-purple-50 text-purple-700 border-purple-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
    expired: 'bg-gray-50 text-gray-700 border-gray-200',
    disputed: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <Layout>
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white text-sm px-5 py-3 rounded-pill shadow-product animate-bounce max-w-md">
          <div className="flex items-center space-x-3">
            <span>{toast.message}</span>
            {toast.signature && (
              <a href={getTxUrl(toast.signature)} target="_blank" rel="noopener noreferrer" className="text-action-blue hover:underline whitespace-nowrap">View Tx →</a>
            )}
            <button onClick={() => setToast(null)} className="text-white/60 hover:text-white ml-1">✕</button>
          </div>
        </div>
      )}

      <main className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button onClick={() => router.push('/tasks')} className="text-caption-apple text-action-blue hover:underline mb-8 inline-block">← Back to Tasks</button>

        {loading ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin mb-4" />
              <p className="text-caption-apple text-ink/50">Loading task from devnet...</p>
            </div>
          </div>
        ) : !task ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="text-center">
              <p className="text-body-apple text-ink/50 mb-4">Task not found on-chain.</p>
              <button onClick={() => router.push('/tasks')} className="apple-pill">Back to Tasks</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Task header */}
              <div className="bg-white rounded-card border border-hairline p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h1 className="text-hero text-ink mb-2">Task #{task.taskId}</h1>
                    <div className="flex items-center space-x-3">
                      <span className={`text-sm px-3 py-1 rounded-pill border font-medium capitalize ${statusStyles[task.status] || statusStyles.cancelled}`}>
                        {task.status}
                      </span>
                      {task.status === 'submitted' && (
                        <span className="text-fine text-orange-600 bg-orange-50 px-3 py-1 rounded-pill">
                          {getReviewTimeLeft(task.submittedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                  <a href={getAccountUrl(getTaskPda(task.taskId).toBase58())} target="_blank" rel="noopener noreferrer" className="text-caption-apple text-action-blue hover:underline">View on Explorer →</a>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div>
                    <span className="text-fine text-ink/40 block mb-1">Amount</span>
                    <p className="text-body-strong text-ink">{(task.amount / 1_000_000).toFixed(2)} USDC</p>
                  </div>
                  <div>
                    <span className="text-fine text-ink/40 block mb-1">Deadline</span>
                    <p className="text-body-strong text-ink">{new Date(task.deadline * 1000).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="text-fine text-ink/40 block mb-1">Agent</span>
                    <p className="text-body-strong text-action-blue cursor-pointer hover:underline" onClick={() => agent && router.push(`/agent?id=${agent.agentId}`)}>
                      {agent ? getAgentName(agent) : `#${task.agentId}`}
                    </p>
                  </div>
                  <div>
                    <span className="text-fine text-ink/40 block mb-1">Client</span>
                    <p className="text-caption-apple text-ink font-mono">{task.client.slice(0, 8)}...{task.client.slice(-4)}</p>
                  </div>
                </div>

                {task.taskUri && (
                  <div className="mt-4 pt-4 border-t border-hairline">
                    <span className="text-fine text-ink/40 block mb-1">Task URI</span>
                    <p className="text-caption-apple text-ink font-mono break-all">{task.taskUri}</p>
                  </div>
                )}

                {task.disputeReason && (
                  <div className="mt-4 pt-4 border-t border-hairline">
                    <span className="text-fine text-red-500 block mb-1">Dispute Reason</span>
                    <p className="text-body-apple text-red-600">{task.disputeReason}</p>
                  </div>
                )}
              </div>

              {/* Agent info */}
              {agent && (
                <div className="bg-parchment rounded-card p-6">
                  <h3 className="text-section text-ink mb-4">Agent Details</h3>
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-utility flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-bold text-lg">{getAgentName(agent)[0]}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <p className="text-body-strong text-ink">{getAgentName(agent)}</p>
                        <span className="text-micro text-action-blue bg-action-blue/5 px-2 py-0.5 rounded-utility capitalize">{getAgentCategory(agent)}</span>
                      </div>
                      <p className="text-caption-apple text-ink/50 mb-2">{agent.metadata["skill"] || ""}</p>
                      {reputation && reputation.feedbackCount > 0 && (
                        <div className="flex items-center space-x-1">
                          {[1,2,3,4,5].map(s => (
                            <span key={s} className={`text-sm ${s <= Math.round(reputation.averageScore / 100) ? 'text-yellow-500' : 'text-ink/15'}`}>★</span>
                          ))}
                          <span className="text-fine text-ink/40 ml-1">{reputation.feedbackCount} reviews</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => router.push(`/agent?id=${agent.agentId}`)} className="apple-pill-ghost text-sm">View Agent →</button>
                  </div>
                </div>
              )}

              {/* Escrow info */}
              <div className="bg-white rounded-card border border-hairline p-6">
                <h3 className="text-section text-ink mb-4">Escrow Vault</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-fine text-ink/40 block mb-1">Vault Address</span>
                    <p className="text-caption-apple text-ink font-mono break-all">{task.escrowVault}</p>
                  </div>
                  <a href={getAccountUrl(task.escrowVault)} target="_blank" rel="noopener noreferrer" className="text-caption-apple text-action-blue hover:underline">View →</a>
                </div>
                <div className="mt-3 flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full ${task.status === 'completed' ? 'bg-green-500' : task.status === 'disputed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                  <span className="text-fine text-ink/60">
                    {task.status === 'completed' ? 'Funds released to agent' :
                     task.status === 'disputed' ? 'Funds locked for arbitration' :
                     task.status === 'submitted' ? 'Funds held — awaiting client review' :
                     task.status === 'open' ? 'Funds held — awaiting agent claim' :
                     'Funds held in escrow'}
                  </span>
                </div>
                {(task.status === 'completed' || task.status === 'disputed') && actionSignature && (
                  <a href={getTxUrl(actionSignature)} target="_blank" rel="noopener noreferrer" className="text-sm text-action-blue hover:underline font-mono mt-2 block">
                    View Distribution Tx →
                  </a>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Accept / Dispute (only for client when task is submitted) */}
              {task.status === 'submitted' && isClient && (
                <div className="bg-white rounded-card border border-hairline p-6 sticky top-20">
                  <h3 className="text-section text-ink mb-4">Review Work</h3>
                  <p className="text-body-apple text-ink/50 mb-4">
                    The agent has submitted their work. You have {getReviewTimeLeft(task.submittedAt)} to accept or dispute.
                  </p>

                  {/* Feedback rating */}
                  <div className="mb-4">
                    <label className="text-fine text-ink/40 block mb-2">Rating</label>
                    <div className="flex items-center space-x-1">
                      {[1,2,3,4,5].map(s => (
                        <button key={s} onClick={() => setFeedbackValue(s)} className={`text-2xl transition-colors ${s <= feedbackValue ? 'text-yellow-500' : 'text-ink/20 hover:text-ink/40'}`}>★</button>
                      ))}
                      <span className="text-fine text-ink/50 ml-2">{feedbackValue}/5</span>
                    </div>
                  </div>

                  {/* Feedback tag */}
                  <div className="mb-6">
                    <label className="text-fine text-ink/40 block mb-1.5">Feedback Tag</label>
                    <input
                      type="text"
                      value={feedbackTag}
                      onChange={(e) => setFeedbackTag(e.target.value)}
                      className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30"
                      placeholder="e.g. excellent, fast"
                      maxLength={50}
                    />
                  </div>

                  {/* Accept button */}
                  <button
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="apple-pill w-full justify-center mb-3 disabled:opacity-50"
                  >
                    {actionLoading ? 'Processing...' : 'Accept & Release Funds'}
                  </button>

                  {/* Dispute toggle */}
                  {!showDispute ? (
                    <button
                      onClick={() => setShowDispute(true)}
                      className="apple-pill-ghost w-full justify-center border-red-300 text-red-500 hover:bg-red-50"
                    >
                      Dispute This Task
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-red-300 resize-none"
                        rows={3}
                        placeholder="Why are you disputing this task?"
                      />
                      <div className="flex space-x-2">
                        <button onClick={() => setShowDispute(false)} className="apple-pill-ghost flex-1 justify-center text-sm">Cancel</button>
                        <button
                          onClick={handleDispute}
                          disabled={actionLoading || !disputeReason.trim()}
                          className="apple-pill flex-1 justify-center bg-red-500 hover:bg-red-600 text-sm disabled:opacity-50"
                        >
                          {actionLoading ? 'Processing...' : 'Confirm Dispute'}
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-fine text-ink/40 text-center mt-3">1% protocol fee deducted on acceptance.</p>
                </div>
              )}

              {/* Status info for non-clients or other statuses */}
              {task.status === 'submitted' && !isClient && (
                <div className="bg-purple-50 rounded-card p-6 border border-purple-200">
                  <h3 className="text-body-strong text-purple-700 mb-2">Awaiting Client Review</h3>
                  <p className="text-fine text-purple-600">
                    The agent has submitted work. The client has {getReviewTimeLeft(task.submittedAt)} to accept or dispute.
                  </p>
                </div>
              )}

              {task.status === 'completed' && (
                <div className="bg-green-50 rounded-card p-6 border border-green-200">
                  <h3 className="text-body-strong text-green-700 mb-2">Task Completed — Funds Distributed</h3>
                  <p className="text-fine text-green-600 mb-3">
                    Funds released to agent. Feedback written on-chain.
                  </p>
                  {(actionSignature) && (
                    <a href={getTxUrl(actionSignature)} target="_blank" rel="noopener noreferrer" className="text-sm text-action-blue hover:underline font-mono break-all bg-white/60 rounded-utility px-3 py-2 block">
                      Fund Distribution Tx: {actionSignature.slice(0, 20)}...{actionSignature.slice(-8)} →
                    </a>
                  )}
                </div>
              )}

              {task.status === 'disputed' && (
                <div className="bg-red-50 rounded-card p-6 border border-red-200">
                  <h3 className="text-body-strong text-red-700 mb-2">Task Disputed — Funds Locked</h3>
                  <p className="text-fine text-red-600 mb-3">
                    Funds locked for arbitration. Dispute reason recorded on-chain.
                  </p>
                  {actionSignature && (
                    <a href={getTxUrl(actionSignature)} target="_blank" rel="noopener noreferrer" className="text-sm text-action-blue hover:underline font-mono break-all bg-white/60 rounded-utility px-3 py-2 block">
                      Dispute Tx: {actionSignature.slice(0, 20)}...{actionSignature.slice(-8)} →
                    </a>
                  )}
                </div>
              )}

              {/* Quick links */}
              <div className="bg-parchment rounded-card p-4 space-y-2">
                <a href={getAccountUrl(getTaskPda(task.taskId).toBase58())} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-caption-apple text-action-blue hover:underline">
                  <span>View Task PDA</span>
                  <span>→</span>
                </a>
                <a href={getAccountUrl(task.escrowVault)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-caption-apple text-action-blue hover:underline">
                  <span>View Escrow Vault</span>
                  <span>→</span>
                </a>
                {agent && (
                  <a href={getAccountUrl(agent.pda)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-caption-apple text-action-blue hover:underline">
                    <span>View Agent PDA</span>
                    <span>→</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </Layout>
  );
}
