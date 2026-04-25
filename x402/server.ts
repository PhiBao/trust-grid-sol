import express from "express";
import cors from "cors";
import {
  SolanaFacilitator,
  paymentMiddleware,
  createPaymentPayload,
  encodePaymentPayload,
} from "./solana";

const app = express();
app.use(cors());
app.use(express.json());

const facilitator = new SolanaFacilitator();

// x402 payment middleware configuration
const priceMap = {
  "GET /api/agent/reputation": {
    amount: "100000", // 0.1 USDC (6 decimals)
    token: "USDC",
    description: "Agent reputation lookup",
  },
  "POST /api/task/create": {
    amount: "500000", // 0.5 USDC
    token: "USDC",
    description: "Task creation fee",
  },
  "GET /api/agent/execute": {
    amount: "1000000", // 1 USDC
    token: "USDC",
    description: "Agent execution",
  },
};

app.use(paymentMiddleware(facilitator, priceMap));

// Public endpoints (no payment required)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", network: "solana:devnet" });
});

app.get("/api/agents", (req, res) => {
  res.json({
    agents: [
      {
        id: 1,
        name: "Nemesis Auditor",
        description: "Smart contract security auditor",
        price: "1.0 USDC",
        reputation: 4.8,
      },
      {
        id: 2,
        name: "DeFi Trader",
        description: "Automated DeFi trading agent",
        price: "0.5 USDC",
        reputation: 4.5,
      },
    ],
  });
});

// Paid endpoints
app.get("/api/agent/reputation", (req, res) => {
  res.json({
    agent_id: req.query.id,
    reputation: 4.8,
    total_feedback: 42,
    recent_tags: ["security", "thorough", "fast"],
  });
});

app.post("/api/task/create", (req, res) => {
  res.json({
    task_id: Date.now(),
    status: "created",
    payment_verified: true,
  });
});

app.get("/api/agent/execute", (req, res) => {
  res.json({
    result: "Agent execution completed successfully",
    agent_id: req.query.id,
    payment_verified: true,
  });
});

// x402 payment verification endpoint
app.post("/api/x402/verify", async (req, res) => {
  const { payload, requirements } = req.body;
  const result = await facilitator.verifyPayment(payload, requirements);
  res.json(result);
});

// x402 payment settlement endpoint
app.post("/api/x402/settle", async (req, res) => {
  const { payload, requirements, recipient } = req.body;
  const result = await facilitator.settlePayment(
    payload,
    requirements,
    new PublicKey(recipient)
  );
  res.json(result);
});

// Demo endpoint to create a payment payload
app.post("/api/x402/create-payment", async (req, res) => {
  try {
    const { wallet, amount, token } = req.body;
    const payload = await createPaymentPayload(wallet, amount, token);
    res.json({
      payload,
      encoded: encodePaymentPayload(payload),
    });
  } catch (error) {
    res.status(500).json({ error: `${error}` });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`TrustGrid x402 Facilitator running on port ${PORT}`);
  console.log("Supported endpoints:");
  Object.keys(priceMap).forEach((route) => {
    console.log(`  ${route} - ${priceMap[route as keyof typeof priceMap].amount} USDC`);
  });
});

// Need to import PublicKey for settlement
import { PublicKey } from "@solana/web3.js";
