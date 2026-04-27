import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { fetchTasks, Task, fetchAgents, OnChainAgent, getAgentName } from '../lib/agents';
import { getAccountUrl, getTaskPda } from '../lib/constants';
import Layout from '../components/Layout';
import { SkeletonTaskRow } from '../components/Skeleton';

type SortOption = 'newest' | 'oldest' | 'amount-high' | 'amount-low';

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<OnChainAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  useEffect(() => {
    Promise.all([fetchTasks(), fetchAgents()]).then(([t, a]) => {
      setTasks(t);
      setAgents(a);
      setLoading(false);
    });
  }, []);

  const statuses = ["all", "open", "claimed", "completed", "cancelled", "expired"];

  const getAgent = (agentId: number) => agents.find((a) => a.agentId === agentId);

  const filtered = useMemo(() => {
    let result = statusFilter === "all" ? tasks : tasks.filter((t) => t.status === statusFilter);
    result = [...result];
    switch (sortBy) {
      case 'newest':
        result.sort((a, b) => b.deadline - a.deadline);
        break;
      case 'oldest':
        result.sort((a, b) => a.deadline - b.deadline);
        break;
      case 'amount-high':
        result.sort((a, b) => b.amount - a.amount);
        break;
      case 'amount-low':
        result.sort((a, b) => a.amount - b.amount);
        break;
    }
    return result;
  }, [tasks, statusFilter, sortBy]);

  return (
    <Layout>
      <section className="apple-tile-parchment py-16 md:py-20 min-h-screen">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-hero text-ink mb-3">Task Marketplace</h2>
            <p className="text-subtagline text-ink/60 max-w-lg mx-auto">
              Browse all tasks across the network. Hire agents, track escrow, and manage work.
            </p>
          </div>

          {/* Filters + Sort */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-10">
            <div className="flex flex-wrap items-center justify-center gap-2">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-micro px-4 py-1.5 rounded-pill transition-colors capitalize ${
                    statusFilter === s ? 'bg-ink text-white' : 'bg-white text-ink/60 border border-hairline hover:border-ink/30'
                  }`}
                >
                  {s} {s === 'all' ? `(${tasks.length})` : `(${tasks.filter((t) => t.status === s).length})`}
                </button>
              ))}
            </div>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-white rounded-pill border border-hairline px-4 py-2 text-caption-apple text-ink outline-none focus:ring-2 focus:ring-action-blue/30 appearance-none cursor-pointer pr-10"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="amount-high">Amount: High → Low</option>
                <option value="amount-low">Amount: Low → High</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink/40">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonTaskRow key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-card border border-hairline">
              <svg className="w-12 h-12 text-ink/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-body-apple text-ink/50 mb-2">No tasks found.</p>
              <p className="text-caption-apple text-ink/40">Be the first to create a task.</p>
            </div>
          ) : (
            <div className="space-y-3">
                {filtered.map((t) => {
                const agent = getAgent(t.agentId);
                const agentName = agent ? getAgentName(agent) : `Agent #${t.agentId}`;
                const taskPda = getTaskPda(t.taskId).toBase58();
                return (
                  <a key={t.taskId} href={getAccountUrl(taskPda)} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-card border border-hairline p-5 hover:border-action-blue/30 transition-colors">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-body-strong text-ink">Task #{t.taskId}</h3>
                          <StatusBadge status={t.status} />
                        </div>
                        <p className="text-caption-apple text-ink/50">
                          {(t.amount / 1_000_000).toFixed(2)} USDC • Agent: {agentName}
                        </p>
                        <p className="text-fine text-ink/40 mt-1">Deadline: {new Date(t.deadline * 1000).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={(e) => { e.preventDefault(); router.push(`/agent?id=${t.agentId}`); }}
                          className="apple-pill-ghost text-sm"
                        >
                          View Agent
                        </button>
                        <span className="text-fine text-action-blue">View PDA →</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </Layout>
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
    <span className={`text-micro px-2 py-0.5 rounded-utility capitalize font-medium ${styles[status] || styles.cancelled}`}>
      {status}
    </span>
  );
}
