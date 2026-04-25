import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchTasks, Task, fetchAgents, OnChainAgent, getAgentName } from '../lib/agents';
import Layout from '../components/Layout';

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<OnChainAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    Promise.all([fetchTasks(), fetchAgents()]).then(([t, a]) => {
      setTasks(t);
      setAgents(a);
      setLoading(false);
    });
  }, []);

  const filtered = statusFilter === "all" ? tasks : tasks.filter((t) => t.status === statusFilter);
  const statuses = ["all", "open", "claimed", "completed", "cancelled", "expired"];

  const getAgent = (agentId: number) => agents.find((a) => a.agentId === agentId);

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

          {/* Filters */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
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

          {loading ? (
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin mb-4" />
              <p className="text-caption-apple text-ink/50">Loading tasks from devnet...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-card border border-hairline">
              <p className="text-body-apple text-ink/50">No tasks found.</p>
              <p className="text-caption-apple text-ink/40 mt-1">Be the first to create a task.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((t) => {
                const agent = getAgent(t.agentId);
                const agentName = agent ? getAgentName(agent) : `Agent #${t.agentId}`;
                return (
                  <div key={t.taskId} className="bg-white rounded-card border border-hairline p-5 hover:border-action-blue/30 transition-colors">
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
                          onClick={() => router.push(`/agent?id=${t.agentId}`)}
                          className="apple-pill-ghost text-sm"
                        >
                          View Agent
                        </button>
                      </div>
                    </div>
                  </div>
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
