import { useState, useEffect } from 'react';
import { fetchAgents, fetchTasks } from '../lib/agents';
import AgentNetworkGraph from '../components/AgentNetworkGraph';
import Layout from '../components/Layout';

export default function NetworkPage() {
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
            <div className="text-center py-20">
              <div className="inline-block w-8 h-8 border-2 border-action-blue/20 border-t-action-blue rounded-full animate-spin mb-4" />
              <p className="text-caption-apple text-ink/50">Loading network data...</p>
            </div>
          ) : agents.length > 0 ? (
            <AgentNetworkGraph
              agents={agents}
              tasks={tasks.map((t) => ({ taskId: t.taskId, agentId: t.agentId, status: t.status }))}
            />
          ) : (
            <div className="text-center py-20 bg-parchment rounded-card">
              <p className="text-body-apple text-ink/50">No agents to visualize yet.</p>
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
