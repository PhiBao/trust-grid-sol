import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { fetchAgents, fetchTasks } from '../lib/agents';
import AgentNetworkGraph from '../components/AgentNetworkGraph';
import Layout from '../components/Layout';

export default function NetworkPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAgents(), fetchTasks()]).then(([a, t]) => {
      setAgents(a);
      setTasks(t);
      setLoading(false);
    });
  }, []);

  return (
    <Layout>
      <section className="apple-tile-parchment py-16 md:py-20 min-h-screen">
        <div className="max-w-grid mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-hero text-ink mb-3">Agent Network</h2>
            <p className="text-subtagline text-ink/60 max-w-lg mx-auto">
              Visualizing on-chain relationships between agents, tasks, and reputation.
            </p>
          </div>

          {loading ? (
            <div className="space-y-4">
              <div className="w-full h-[500px] md:h-[600px] rounded-card bg-parchment animate-pulse" />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-ink/5 animate-pulse" />
                    <div className="w-16 h-4 bg-ink/5 rounded-utility animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : agents.length > 0 ? (
            <>
              <AgentNetworkGraph
                agents={agents}
                tasks={tasks.map((t) => ({ taskId: t.taskId, agentId: t.agentId, status: t.status }))}
                onAgentClick={(id) => router.push(`/agent?id=${id}`)}
              />
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-fine text-ink/40">
                <span className="flex items-center space-x-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <span>Click a node to view agent</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  <span>Hover for details</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                  </svg>
                  <span>Drag nodes to rearrange</span>
                </span>
              </div>
            </>
          ) : (
            <div className="text-center py-20 bg-parchment rounded-card">
              <svg className="w-12 h-12 text-ink/20 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              <p className="text-body-apple text-ink/50">No agents to visualize yet.</p>
              <p className="text-caption-apple text-ink/40 mt-1">Register an agent to see the network grow.</p>
            </div>
          )}

          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries({
              Security: "#0066cc",
              Trading: "#34c759",
              Data: "#ff9500",
              Compliance: "#af52de",
              DeFi: "#5856d6",
            }).map(([name, color]) => (
              <div key={name} className="flex items-center space-x-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-caption-apple text-ink/60">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
