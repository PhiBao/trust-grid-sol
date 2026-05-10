import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Connection } from "@solana/web3.js";
import {
  fetchAgents,
  OnChainAgent,
  getAgentName,
  getAgentCategory,
  getAgentPrice,
  getAgentSkill,
  fetchReputation,
  AgentReputation,
  fetchTasks,
  Task,
  fetchFeedbacksForAgent,
  Feedback,
} from "../lib/agents";
import {
  buildGiveFeedbackTx,
  buildCreateTaskTx,
  buildClaimTaskTx,
  buildSubmitTaskTx,
  buildAcceptTaskTx,
  buildDisputeTaskTx,
  sendTxRobust,
  getUSDCBalance,
  getSOLBalance,
} from "../lib/transactions";
import { getTxUrl, getAccountUrl, getTaskPda } from "../lib/constants";
import Layout from "../components/Layout";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const DEFAULT_PUBKEY = "11111111111111111111111111111111";

interface ToastState {
  message: string;
  signature?: string;
}

export default function AgentDetailPage() {
  const router = useRouter();
  const { publicKey, connected, wallet } = useWallet();
  const connection = useMemo(() => new Connection(RPC_URL, "confirmed"), []);

  const [agent, setAgent] = useState<OnChainAgent | null>(null);
  const [reputation, setReputation] = useState<AgentReputation | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [feedbackValue, setFeedbackValue] = useState(5);
  const [feedbackTag, setFeedbackTag] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [solBalance, setSolBalance] = useState(0);

  const [hireOpen, setHireOpen] = useState(false);
  const [taskAmount, setTaskAmount] = useState("1.0");
  const [taskUri, setTaskUri] = useState("");
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskActionLoading, setTaskActionLoading] = useState(false);
  const [reviewTask, setReviewTask] = useState<Task | null>(null);
  const [reviewValue, setReviewValue] = useState(5);
  const [reviewTag, setReviewTag] = useState("excellent");
  const [disputeTask, setDisputeTask] = useState<Task | null>(null);
  const [disputeReason, setDisputeReason] = useState(
    "Work does not meet requirements"
  );

  useEffect(() => {
    if (!router.isReady) return;
    const rawId = router.query.id;
    let id: number | null = null;
    if (rawId) {
      id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
    } else if (typeof window !== "undefined") {
      const idParam = new URLSearchParams(window.location.search).get("id");
      if (idParam) id = parseInt(idParam, 10);
    }
    if (id == null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([fetchAgents(), fetchTasks()]).then(([agents, allTasks]) => {
      if (cancelled) return;
      const found = agents.find((a) => a.agentId === id);
      setAgent(found || null);
      setTasks(allTasks);
      setLoading(false);
      if (found) {
        fetchReputation(found.agentId).then((r) => {
          if (!cancelled) setReputation(r);
        });
        fetchFeedbacksForAgent(found.agentId).then((f) => {
          if (!cancelled) setFeedbacks(f);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, router.query.id]);

  useEffect(() => {
    if (!publicKey) return;
    getUSDCBalance(connection, publicKey).then(setUsdcBalance);
    getSOLBalance(connection, publicKey).then(setSolBalance);
  }, [publicKey, connection]);

  const showToast = (message: string, signature?: string) => {
    setToast({ message, signature });
    setTimeout(() => setToast(null), 5000);
  };

  const refreshTaskState = async (agentId?: number) => {
    const refreshes: Promise<any>[] = [fetchTasks().then(setTasks)];
    if (publicKey) {
      refreshes.push(
        getUSDCBalance(connection, publicKey).then(setUsdcBalance)
      );
      refreshes.push(getSOLBalance(connection, publicKey).then(setSolBalance));
    }
    if (agentId) {
      refreshes.push(fetchReputation(agentId).then(setReputation));
      refreshes.push(fetchFeedbacksForAgent(agentId).then(setFeedbacks));
    }
    await Promise.all(refreshes);
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(text);
      showToast("Copied to clipboard");
    }
  };

  const handleGiveFeedback = async () => {
    if (!publicKey || !agent) {
      showToast("Connect your wallet first");
      return;
    }
    if (!feedbackTag.trim()) {
      showToast("Enter a feedback tag");
      return;
    }
    setFeedbackLoading(true);
    try {
      const tx = await buildGiveFeedbackTx(
        connection,
        publicKey,
        agent.agentId,
        feedbackValue,
        feedbackTag.trim(),
        new PublicKey(agent.authority)
      );
      const sig = await sendTxRobust(tx, connection, wallet?.adapter);
      showToast("Feedback submitted on-chain!", sig);
      setFeedbackTag("");
      setFeedbackValue(5);
      const [rep, fbList] = await Promise.all([
        fetchReputation(agent.agentId),
        fetchFeedbacksForAgent(agent.agentId),
      ]);
      setReputation(rep);
      setFeedbacks(fbList);
    } catch (e: any) {
      showToast(e.message?.slice(0, 60) || "Feedback failed");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleCreateTask = async () => {
    if (!publicKey || !agent) {
      showToast("Connect your wallet first");
      return;
    }
    const amount = parseFloat(taskAmount);
    if (isNaN(amount) || amount <= 0) {
      showToast("Enter a valid amount");
      return;
    }
    if (!taskUri.trim()) {
      showToast("Enter a task description URI");
      return;
    }
    if (usdcBalance < amount) {
      showToast(`Insufficient USDC. You have ${usdcBalance.toFixed(2)} USDC`);
      return;
    }
    setTaskLoading(true);
    try {
      const { tx, taskId } = await buildCreateTaskTx(
        connection,
        publicKey,
        agent.agentId,
        amount,
        taskUri.trim()
      );
      const sig = await sendTxRobust(tx, connection, wallet?.adapter);
      showToast(`Task #${taskId} created on-chain!`, sig);
      setHireOpen(false);
      setTaskUri("");
      setTaskAmount("1.0");
      setTasks(await fetchTasks());
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Task creation failed");
    } finally {
      setTaskLoading(false);
    }
  };

  const agentTasks = agent
    ? tasks.filter((t) => t.agentId === agent.agentId)
    : [];
  const name = agent ? getAgentName(agent) : "";
  const cat = agent ? getAgentCategory(agent) : "";

  const isAgentAuthority =
    agent && publicKey ? agent.authority === publicKey.toBase58() : false;
  const isAgentWallet =
    agent && publicKey ? agent.wallet === publicKey.toBase58() : false;
  const canActAsAgent = isAgentAuthority || isAgentWallet;

  const getReviewTimeLeft = (submittedAt: number) => {
    const end = submittedAt + 24 * 60 * 60;
    const remaining = end - Math.floor(Date.now() / 1000);
    if (remaining <= 0) return "Expired";
    const hours = Math.floor(remaining / 3600);
    const mins = Math.floor((remaining % 3600) / 60);
    return `${hours}h ${mins}m left`;
  };

  const handleClaimTask = async (task: Task) => {
    if (!publicKey || !wallet?.adapter || !agent) return;
    setTaskActionLoading(true);
    try {
      const tx = await buildClaimTaskTx(
        connection,
        publicKey,
        task.taskId,
        agent.agentId,
        new PublicKey(agent.authority)
      );
      const sig = await sendTxRobust(tx, connection, wallet.adapter);
      showToast("Task claimed!", sig);
      await refreshTaskState(agent.agentId);
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Claim failed");
    } finally {
      setTaskActionLoading(false);
    }
  };

  const handleSubmitTask = async (task: Task) => {
    if (!publicKey || !wallet?.adapter || !agent) return;
    setTaskActionLoading(true);
    try {
      const tx = await buildSubmitTaskTx(
        connection,
        publicKey,
        task.taskId,
        agent.agentId,
        new PublicKey(agent.authority)
      );
      const sig = await sendTxRobust(tx, connection, wallet.adapter);
      showToast("Task submitted for review!", sig);
      await refreshTaskState(agent.agentId);
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Submit failed");
    } finally {
      setTaskActionLoading(false);
    }
  };

  const handleAcceptTask = async () => {
    if (!publicKey || !wallet?.adapter || !reviewTask || !agent) return;
    if (!reviewTag.trim()) {
      showToast("Enter a feedback tag");
      return;
    }
    setTaskActionLoading(true);
    try {
      const tx = await buildAcceptTaskTx(
        connection,
        publicKey,
        reviewTask.taskId,
        reviewTask.agentId,
        new PublicKey(agent.authority),
        agent.wallet && agent.wallet !== DEFAULT_PUBKEY
          ? new PublicKey(agent.wallet)
          : null,
        reviewValue,
        reviewTag.trim()
      );
      const sig = await sendTxRobust(tx, connection, wallet.adapter);
      showToast("Task accepted and funds released!", sig);
      setReviewTask(null);
      setReviewValue(5);
      setReviewTag("excellent");
      await refreshTaskState(reviewTask.agentId);
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Accept failed");
    } finally {
      setTaskActionLoading(false);
    }
  };

  const handleDisputeTask = async () => {
    if (!publicKey || !wallet?.adapter || !disputeTask) return;
    if (!disputeReason.trim()) {
      showToast("Enter a dispute reason");
      return;
    }
    setTaskActionLoading(true);
    try {
      const tx = await buildDisputeTaskTx(
        connection,
        publicKey,
        disputeTask.taskId,
        disputeReason.trim()
      );
      const sig = await sendTxRobust(tx, connection, wallet.adapter);
      showToast("Task disputed!", sig);
      setDisputeTask(null);
      setDisputeReason("Work does not meet requirements");
      await refreshTaskState(disputeTask.agentId);
    } catch (e: any) {
      showToast(e.message?.slice(0, 80) || "Dispute failed");
    } finally {
      setTaskActionLoading(false);
    }
  };

  return (
    <Layout>
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white text-sm px-5 py-3 rounded-pill shadow-product animate-bounce max-w-md">
          <div className="flex items-center space-x-3">
            <span>{toast.message}</span>
            {toast.signature && (
              <a
                href={getTxUrl(toast.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action-blue hover:underline whitespace-nowrap"
                onClick={(e) => e.stopPropagation()}
              >
                View Tx →
              </a>
            )}
            <button
              onClick={() => setToast(null)}
              className="text-white/60 hover:text-white ml-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button
          onClick={() => router.push("/")}
          className="text-caption-apple text-action-blue hover:underline mb-8 inline-block"
        >
          ← Back to Marketplace
        </button>

        {loading ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="text-center">
              <div className="inline-block w-8 h-8 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin mb-4" />
              <p className="text-caption-apple text-ink/50">
                Loading agent from devnet...
              </p>
            </div>
          </div>
        ) : !agent ? (
          <div className="min-h-[40vh] flex items-center justify-center">
            <div className="text-center">
              <p className="text-body-apple text-ink/50 mb-4">
                Agent not found on-chain.
              </p>
              <button onClick={() => router.push("/")} className="apple-pill">
                Back to Marketplace
              </button>
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
                <div className="mt-3 flex items-center space-x-4">
                  <a
                    href={getAccountUrl(agent.pda)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-caption-apple text-action-blue hover:underline"
                  >
                    View Agent PDA →
                  </a>
                  <a
                    href={getAccountUrl(agent.authority)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-caption-apple text-action-blue hover:underline"
                  >
                    View Authority →
                  </a>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left */}
              <div className="lg:col-span-2 space-y-6">
                {/* Reputation */}
                <div className="bg-parchment rounded-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-section text-ink">
                      On-Chain Reputation
                    </h3>
                    {reputation && (
                      <a
                        href={getAccountUrl(
                          agent.pda.replace(/...$/, "") +
                            "reputation" /* fallback */
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-caption-apple text-action-blue hover:underline"
                      >
                        View Reputation PDA →
                      </a>
                    )}
                  </div>
                  {reputation && reputation.feedbackCount > 0 ? (
                    <div className="flex items-center space-x-1 mb-4">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <span
                          key={s}
                          className={`text-xl ${
                            s <= Math.round(reputation.averageScore / 100)
                              ? "text-yellow-500"
                              : "text-ink/20"
                          }`}
                        >
                          ★
                        </span>
                      ))}
                      <span className="text-caption-apple text-ink/50 ml-2">
                        {reputation.feedbackCount} reviews
                      </span>
                    </div>
                  ) : (
                    <p className="text-body-apple text-ink/50 mb-4">
                      No feedback yet. Be the first to review.
                    </p>
                  )}

                  {/* Feedback list */}
                  {feedbacks.length > 0 && (
                    <div className="mt-4 border-t border-hairline pt-4">
                      <p className="text-caption-apple text-ink/50 mb-3">
                        {feedbacks.length} review
                        {feedbacks.length > 1 ? "s" : ""}
                      </p>
                      <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                        {feedbacks.map((fb, i) => (
                          <a
                            key={i}
                            href={getAccountUrl(fb.pda)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-white rounded-utility p-3 flex items-start space-x-3 hover:border-action-blue/30 border border-transparent transition-colors"
                          >
                            <div className="flex items-center space-x-0.5 flex-shrink-0">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <span
                                  key={s}
                                  className={`text-xs ${
                                    s <= fb.value
                                      ? "text-yellow-500"
                                      : "text-ink/20"
                                  }`}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-caption-apple text-ink">
                                {fb.tag}
                              </p>
                              <p className="text-fine text-ink/40">
                                {new Date(
                                  fb.createdAt * 1000
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <span className="text-fine text-action-blue flex-shrink-0">
                              View →
                            </span>
                          </a>
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
                    <DetailItem
                      label="Framework"
                      value={agent.metadata["framework"] || "—"}
                    />
                    <DetailItem label="Price" value={getAgentPrice(agent)} />
                    <DetailItem label="Agent ID" value={`#${agent.agentId}`} />
                    <DetailItem
                      label="Status"
                      value={agent.active ? "Active" : "Inactive"}
                    />
                    <DetailItem
                      label="Created"
                      value={new Date(
                        agent.createdAt * 1000
                      ).toLocaleDateString()}
                    />
                  </div>
                </div>

                {/* PDA */}
                <div className="bg-parchment rounded-card p-6">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-section text-ink">PDA Address</h3>
                    <div className="flex items-center space-x-3">
                      <a
                        href={getAccountUrl(agent.pda)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-caption-apple text-action-blue hover:underline"
                      >
                        View on Explorer →
                      </a>
                      <button
                        onClick={() => copyToClipboard(agent.pda)}
                        className="text-caption-apple text-action-blue hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  <p className="text-caption-apple text-ink font-mono break-all">
                    {agent.pda}
                  </p>
                </div>

                {/* Endpoint */}
                {agent.metadata["endpoint"] && (
                  <div className="bg-parchment rounded-card p-6">
                    <h3 className="text-section text-ink mb-2">MCP Endpoint</h3>
                    <p className="text-caption-apple text-ink font-mono break-all">
                      {agent.metadata["endpoint"]}
                    </p>
                  </div>
                )}

                {/* Task History */}
                <div className="bg-white rounded-card border border-hairline p-6">
                  <h3 className="text-section text-ink mb-4">Task History</h3>
                  {agentTasks.length === 0 ? (
                    <p className="text-body-apple text-ink/50">
                      No tasks yet for this agent.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {agentTasks.map((t) => {
                        const isClient = publicKey
                          ? t.client === publicKey.toBase58()
                          : false;
                        const isClaimedByMe = publicKey
                          ? t.claimedBy === publicKey.toBase58()
                          : false;
                        return (
                          <div
                            key={t.taskId}
                            className="bg-parchment rounded-utility p-4 hover:border-action-blue/30 border border-transparent transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="text-caption-strong text-ink">
                                  Task #{t.taskId}
                                </p>
                                <p className="text-fine text-ink/50">
                                  {(t.amount / 1_000_000).toFixed(2)} USDC •
                                  Deadline:{" "}
                                  {new Date(
                                    t.deadline * 1000
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="flex items-center space-x-3">
                                <StatusBadge status={t.status} />
                                {t.status === "submitted" && (
                                  <span className="text-micro text-orange-600 bg-orange-50 px-2 py-0.5 rounded-utility">
                                    {getReviewTimeLeft(t.submittedAt)}
                                  </span>
                                )}
                                <a
                                  href={getAccountUrl(
                                    getTaskPda(t.taskId).toBase58()
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-fine text-action-blue"
                                >
                                  View →
                                </a>
                              </div>
                            </div>
                            {/* Action buttons */}
                            {t.status === "open" && canActAsAgent && (
                              <button
                                onClick={() => handleClaimTask(t)}
                                disabled={taskActionLoading}
                                className="apple-pill text-sm mt-2 disabled:opacity-50"
                              >
                                Claim Task
                              </button>
                            )}
                            {t.status === "claimed" && isClaimedByMe && (
                              <button
                                onClick={() => handleSubmitTask(t)}
                                disabled={taskActionLoading}
                                className="apple-pill text-sm mt-2 disabled:opacity-50"
                              >
                                Submit Work for Review
                              </button>
                            )}
                            {t.status === "submitted" && isClient && (
                              <div className="flex items-center space-x-2 mt-2">
                                <button
                                  onClick={() => setReviewTask(t)}
                                  disabled={taskActionLoading}
                                  className="apple-pill text-sm disabled:opacity-50"
                                >
                                  Accept & Release Funds
                                </button>
                                <button
                                  onClick={() => setDisputeTask(t)}
                                  disabled={taskActionLoading}
                                  className="apple-pill-ghost text-sm border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Dispute
                                </button>
                              </div>
                            )}
                            {t.disputeReason && (
                              <p className="text-fine text-red-500 mt-2">
                                Dispute reason: {t.disputeReason}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div className="space-y-6">
                <div className="bg-white rounded-card border border-hairline p-6 sticky top-20">
                  <h3 className="text-section text-ink mb-4">Hire {name}</h3>
                  <p className="text-body-apple text-ink/60 mb-6">
                    Create a task with USDC escrow. Funds are held trustlessly
                    until completion.
                  </p>
                  {connected && (
                    <div className="space-y-2 mb-4">
                      <div className="bg-parchment rounded-utility p-3 flex items-center justify-between">
                        <span className="text-fine text-ink/40">Your SOL</span>
                        <span className="text-caption-strong text-ink">
                          {solBalance.toFixed(3)} SOL
                        </span>
                      </div>
                      <div className="bg-parchment rounded-utility p-3 flex items-center justify-between">
                        <span className="text-fine text-ink/40">Your USDC</span>
                        <span className="text-caption-strong text-ink">
                          {usdcBalance.toFixed(2)} USDC
                        </span>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setHireOpen(true)}
                    className="apple-pill w-full justify-center mb-3"
                  >
                    Hire for {getAgentPrice(agent)}
                  </button>
                  <p className="text-fine text-ink/40 text-center">
                    1% protocol fee applies
                  </p>
                </div>

                <div className="bg-parchment rounded-card p-4">
                  <span className="text-fine text-ink/40 block mb-1">
                    Agent URI
                  </span>
                  <p className="text-caption-apple text-ink font-mono break-all">
                    {agent.agentUri}
                  </p>
                </div>

                <div className="bg-white rounded-card border border-hairline p-6">
                  <h3 className="text-section text-ink mb-4">Give Feedback</h3>
                  <div className="flex items-center space-x-2 mb-4">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setFeedbackValue(s)}
                        className={`text-2xl transition-colors ${
                          s <= feedbackValue
                            ? "text-yellow-500"
                            : "text-ink/20 hover:text-ink/40"
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="text-fine text-ink/50 ml-2">
                      {feedbackValue}/5
                    </span>
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
                    {feedbackLoading
                      ? "Submitting..."
                      : connected
                      ? "Submit On-Chain Feedback"
                      : "Connect Wallet"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Hire Modal */}
      {hireOpen && agent && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setHireOpen(false)}
        >
          <div
            className="bg-white rounded-card max-w-md w-full p-6 md:p-8 shadow-product"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-section text-ink">Create Task</h3>
                <p className="text-caption-apple text-ink/50 mt-1">
                  Hire {name}
                </p>
              </div>
              <button
                onClick={() => setHireOpen(false)}
                className="w-8 h-8 rounded-full bg-chip-gray flex items-center justify-center text-ink hover:bg-chip-gray/80 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
            {connected && (
              <div className="bg-parchment rounded-utility p-3 mb-4 flex items-center justify-between">
                <span className="text-fine text-ink/40">Your USDC</span>
                <span className="text-caption-strong text-ink">
                  {usdcBalance.toFixed(2)} USDC
                </span>
              </div>
            )}
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-fine text-ink/40 block mb-1.5">
                  Amount (USDC)
                </label>
                <input
                  type="number"
                  value={taskAmount}
                  onChange={(e) => setTaskAmount(e.target.value)}
                  className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30"
                  placeholder="1.0"
                  min="0.1"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-fine text-ink/40 block mb-1.5">
                  Task Description URI
                </label>
                <input
                  type="text"
                  value={taskUri}
                  onChange={(e) => setTaskUri(e.target.value)}
                  className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30"
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="bg-parchment rounded-utility p-3 mb-6">
              <div className="flex items-center justify-between text-caption-apple text-ink/60">
                <span>Service Fee (1%)</span>
                <span>
                  {(parseFloat(taskAmount || "0") * 0.01).toFixed(3)} USDC
                </span>
              </div>
              <div className="flex items-center justify-between text-body-strong text-ink mt-1">
                <span>Total</span>
                <span>
                  {(parseFloat(taskAmount || "0") * 1.01).toFixed(3)} USDC
                </span>
              </div>
            </div>
            <button
              onClick={handleCreateTask}
              disabled={taskLoading || !connected}
              className="apple-pill w-full justify-center disabled:opacity-50"
            >
              {taskLoading
                ? "Creating Task..."
                : connected
                ? "Create Task with Escrow"
                : "Connect Wallet"}
            </button>
            {connected && usdcBalance < parseFloat(taskAmount || "0") && (
              <p className="text-center text-fine text-red-500 mt-3">
                Insufficient USDC. You need devnet USDC to create tasks.
              </p>
            )}
            <p className="text-center text-fine text-ink/40 mt-3">
              Funds are held in a PDA escrow vault until task completion.
            </p>
          </div>
        </div>
      )}

      {reviewTask && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setReviewTask(null)}
        >
          <div
            className="bg-white rounded-card max-w-md w-full p-6 md:p-8 shadow-product"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-section text-ink">
                  Accept Task #{reviewTask.taskId}
                </h3>
                <p className="text-caption-apple text-ink/50 mt-1">
                  Release escrow and write feedback.
                </p>
              </div>
              <button
                onClick={() => setReviewTask(null)}
                className="w-8 h-8 rounded-full bg-chip-gray flex items-center justify-center text-ink hover:bg-chip-gray/80 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center space-x-2 mb-4">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setReviewValue(s)}
                  className={`text-2xl transition-colors ${
                    s <= reviewValue
                      ? "text-yellow-500"
                      : "text-ink/20 hover:text-ink/40"
                  }`}
                >
                  ★
                </button>
              ))}
              <span className="text-fine text-ink/50 ml-2">
                {reviewValue}/5
              </span>
            </div>
            <input
              type="text"
              value={reviewTag}
              onChange={(e) => setReviewTag(e.target.value)}
              className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30 mb-6"
              placeholder="Feedback tag"
              maxLength={50}
            />
            <button
              onClick={handleAcceptTask}
              disabled={taskActionLoading || !reviewTag.trim()}
              className="apple-pill w-full justify-center disabled:opacity-50"
            >
              {taskActionLoading ? "Accepting..." : "Accept & Release Funds"}
            </button>
          </div>
        </div>
      )}

      {disputeTask && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setDisputeTask(null)}
        >
          <div
            className="bg-white rounded-card max-w-md w-full p-6 md:p-8 shadow-product"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-section text-ink">
                  Dispute Task #{disputeTask.taskId}
                </h3>
                <p className="text-caption-apple text-ink/50 mt-1">
                  Funds remain locked for arbitration.
                </p>
              </div>
              <button
                onClick={() => setDisputeTask(null)}
                className="w-8 h-8 rounded-full bg-chip-gray flex items-center justify-center text-ink hover:bg-chip-gray/80 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
            <textarea
              value={disputeReason}
              onChange={(e) => setDisputeReason(e.target.value)}
              className="w-full bg-parchment rounded-utility px-4 py-2.5 text-body-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30 resize-none mb-6"
              rows={3}
              placeholder="Reason"
              maxLength={200}
            />
            <button
              onClick={handleDisputeTask}
              disabled={taskActionLoading || !disputeReason.trim()}
              className="apple-pill-ghost w-full justify-center border-red-300 text-red-500 hover:bg-red-50 disabled:opacity-50"
            >
              {taskActionLoading ? "Disputing..." : "Submit Dispute"}
            </button>
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
    open: "bg-blue-50 text-blue-600",
    claimed: "bg-orange-50 text-orange-600",
    submitted: "bg-purple-50 text-purple-600",
    completed: "bg-green-50 text-green-600",
    cancelled: "bg-gray-50 text-gray-600",
    expired: "bg-gray-50 text-gray-600",
    disputed: "bg-red-50 text-red-600",
  };
  return (
    <span
      className={`text-micro px-3 py-1 rounded-utility capitalize font-medium ${
        styles[status] || styles.cancelled
      }`}
    >
      {status}
    </span>
  );
}
