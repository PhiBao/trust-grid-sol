import React, { useRef, useEffect, useState } from "react";

interface NetworkNode {
  id: number;
  name: string;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface NetworkEdge {
  from: number;
  to: number;
  strength: number;
  label?: string;
}

interface AgentNetworkGraphProps {
  agents: { agentId: number; metadata: Record<string, string> }[];
  tasks?: { taskId: number; agentId: number; status: string }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  security: "#0066cc",
  trading: "#34c759",
  data: "#ff9500",
  compliance: "#af52de",
  defi: "#5856d6",
  general: "#8e8e93",
};

export default function AgentNetworkGraph({ agents, tasks = [] }: AgentNetworkGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const nodesRef = useRef<NetworkNode[]>([]);
  const edgesRef = useRef<NetworkEdge[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    const nodes: NetworkNode[] = [];

    // Central hub node (id: 0)
    nodes.push({
      id: 0,
      name: "TrustGrid",
      category: "hub",
      x: width / 2,
      y: height / 2,
      vx: 0,
      vy: 0,
      radius: 24,
      color: "#1d1d1f",
    });

    // Agent nodes
    agents.forEach((a, i) => {
      const angle = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      const dist = Math.min(width, height) * 0.3;
      const cat = (a.metadata["category"] || "general").toLowerCase();
      const name = a.metadata["name"] || `Agent #${a.agentId}`;
      nodes.push({
        id: a.agentId,
        name,
        category: cat,
        x: width / 2 + Math.cos(angle) * dist,
        y: height / 2 + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        radius: 26 + Math.min(name.length * 0.4, 8),
        color: CATEGORY_COLORS[cat] || CATEGORY_COLORS.general,
      });
    });

    // Edges
    const edges: NetworkEdge[] = [];

    // Connect all agents to central hub
    agents.forEach((a) => {
      edges.push({ from: 0, to: a.agentId, strength: 0.3 });
    });

    // Task edges: connect hub to agent with task label
    tasks.forEach((t) => {
      if (t.agentId > 0) {
        edges.push({ from: 0, to: t.agentId, strength: 0.6, label: t.status });
      }
    });

    // Category edges between agents
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].id !== 0 && nodes[j].id !== 0 && nodes[i].category === nodes[j].category) {
          edges.push({ from: nodes[i].id, to: nodes[j].id, strength: 0.25 });
        }
      }
    }

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Physics
      nodes.forEach((node) => {
        if (node.id === 0) {
          // Hub stays near center
          node.x += (width / 2 - node.x) * 0.05;
          node.y += (height / 2 - node.y) * 0.05;
          node.vx *= 0.8;
          node.vy *= 0.8;
          return;
        }

        // Center gravity
        const dx = width / 2 - node.x;
        const dy = height / 2 - node.y;
        node.vx += dx * 0.0005;
        node.vy += dy * 0.0005;

        // Repulsion
        nodes.forEach((other) => {
          if (node.id === other.id) return;
          const rdx = node.x - other.x;
          const rdy = node.y - other.y;
          const dist = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
          const force = 1200 / (dist * dist);
          node.vx += (rdx / dist) * force;
          node.vy += (rdy / dist) * force;
        });

        node.vx *= 0.9;
        node.vy *= 0.9;
        node.x += node.vx;
        node.y += node.vy;

        node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
        node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
      });

      // Draw edges
      edges.forEach((edge) => {
        const from = nodes.find((n) => n.id === edge.from);
        const to = nodes.find((n) => n.id === edge.to);
        if (!from || !to) return;

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);

        if (edge.from === 0) {
          // Hub-to-agent edges: brighter
          ctx.strokeStyle = `rgba(0, 102, 204, ${0.25 + edge.strength * 0.4})`;
          ctx.lineWidth = 1.5;
        } else {
          // Agent-to-agent category edges
          ctx.strokeStyle = `rgba(29, 29, 31, ${edge.strength * 0.5})`;
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach((node) => {
        // Glow
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius + 14);
        gradient.addColorStop(0, `${node.color}22`);
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 14, 0, Math.PI * 2);
        ctx.fill();

        // Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Text
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 ${node.id === 0 ? 12 : 13}px system-ui, -apple-system, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const text = node.id === 0 ? "TG" : node.name[0];
        ctx.fillText(text, node.x, node.y);

        // Label
        ctx.fillStyle = "#1d1d1f";
        ctx.font = "500 11px system-ui, -apple-system, sans-serif";
        ctx.fillText(node.name, node.x, node.y + node.radius + 16);

        // Category pill
        if (node.id !== 0) {
          const catText = node.category.charAt(0).toUpperCase() + node.category.slice(1);
          const catWidth = ctx.measureText(catText).width + 12;
          ctx.fillStyle = "#f5f5f7";
          ctx.beginPath();
          ctx.roundRect(node.x - catWidth / 2, node.y + node.radius + 24, catWidth, 16, 8);
          ctx.fill();
          ctx.fillStyle = "#1d1d1f";
          ctx.font = "400 9px system-ui, -apple-system, sans-serif";
          ctx.fillText(catText, node.x, node.y + node.radius + 32);
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [agents, tasks]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x: e.clientX, y: e.clientY });

    const hovered = nodesRef.current.find((n) => {
      const dx = x - n.x;
      const dy = y - n.y;
      return Math.sqrt(dx * dx + dy * dy) < n.radius;
    });
    setHoveredNode(hovered || null);
  };

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        className="w-full h-[500px] md:h-[600px] rounded-card bg-parchment cursor-pointer"
        onMouseMove={handleMouseMove}
      />
      {hoveredNode && (
        <div
          className="fixed z-50 bg-white rounded-utility shadow-product px-4 py-3 pointer-events-none border border-hairline"
          style={{ left: mousePos.x + 12, top: mousePos.y + 12 }}
        >
          <p className="text-caption-strong text-ink">{hoveredNode.name}</p>
          <p className="text-fine text-ink/50 capitalize">{hoveredNode.category}</p>
        </div>
      )}
    </div>
  );
}
