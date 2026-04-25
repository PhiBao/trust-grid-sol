# TrustGrid — Agent Notes

## Deployment Status

| Network | Program ID | Status | Explorer |
|---------|-----------|--------|----------|
| **Devnet** | `2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE` | ✅ Live | [SolanaFM](https://solana.fm/address/2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE?cluster=devnet) |
| Localnet | Same | ✅ Verified | — |

**Deployer:** `FzjHztL4TYQaNKQGVHV5VRAG1MVp2cvHuSN6mmduBcL3`
**ProgramData:** `D6eeGCvBJj6ptRugBYh6foq9jdGgfQZt7YTu7agqKFRZ`
**Last Deployed:** Slot 458029402

## Project Structure

```
trustgrid-solana/
├── programs/trustgrid-solana/    # Anchor smart contracts
│   └── src/lib.rs                # Identity, Reputation, Escrow programs
├── app/                          # Next.js frontend (Apple Design System)
│   ├── pages/                    # Routes: /, /agent, /tasks, /network, /dashboard
│   ├── components/               # Layout, AgentNetworkGraph, WalletButton
│   ├── lib/                      # On-chain data fetching + transactions
│   └── styles/                   # Tailwind CSS with Apple tokens
├── x402/                         # x402 payment integration
│   ├── solana.ts                 # SVM facilitator + middleware
│   └── server.ts                 # Express x402 server
├── tests/                        # Anchor test suite
├── migrations/                   # Deployment & seed scripts
├── Anchor.toml                   # Anchor configuration
└── README.md                     # Full documentation
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Marketplace | `/` | Browse agents with category filters |
| Agent Detail | `/agent?id=X` | Full profile, reputation, feedback list, hire modal |
| Tasks | `/tasks` | Browse all tasks with status filters |
| Network | `/network` | Force-directed graph visualization |
| Dashboard | `/dashboard` | Wallet stats, my tasks/agents, register agent form |

## Build Commands

```bash
# Install dependencies
npm install
cd app && npm install

# Check program compilation (fast, no SBF)
cargo check

# Build for SBF
anchor build

# Run tests
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Seed on-chain data
npx ts-node --transpile-only migrations/seed-all.ts
npx ts-node --transpile-only migrations/seed-feedback.ts

# Start frontend dev server
cd app && npm run dev

# Start x402 facilitator
npm run facilitator
```

## Vercel Deployment

```bash
# 1. Make sure next.config.js does NOT have output: 'export'
# 2. From the app/ directory:
cd app
vercel --prod
```

**Important:** Do not use `output: 'export'` for Vercel. Vercel's Next.js builder handles SSR natively.

## Frontend Features

### Real On-Chain Data
All UI data is fetched live from Solana devnet — no mocks:
- **Agent fetching**: `app/lib/agents.ts` manually deserializes Anchor borsh PDAs
- **Reputation**: `fetchReputation(agentId)` reads `AgentReputation` PDA
- **Feedbacks**: `fetchFeedbacksForAgent(agentId)` filters program accounts client-side
- **Tasks**: `fetchTasks()` iterates task counter and decodes each `Task` PDA
- **Network Graph**: Canvas physics simulation with category-based coloring

### Interactive Features
- **Hire Agent**: Opens modal on agent detail page → create task with USDC escrow
- **Give Feedback**: Star rating + tag → submits on-chain `give_feedback` instruction
- **Register Agent**: Dashboard form → submits on-chain `register_agent` instruction
- **Task Creation**: USDC amount + URI → simulation-checked before wallet prompt

### Transaction Safety
`sendTxRobust()` in `lib/transactions.ts`:
1. Simulates the transaction first to catch errors
2. Tries wallet adapter `sendTransaction`
3. Falls back to manual `signTransaction` + `sendRawTransaction`

## Architecture Decisions

### Why PDAs instead of NFTs?
Solana PDAs are cheaper to create (~0.002 SOL) and more composable than Metaplex NFTs for identity use cases.

### Why no static export?
Removed `output: 'export'` to support SSR on Vercel. Dynamic wallet adapter components cause hydration mismatches when prerendered.

### Wallet adapter hydration fix
`WalletMultiButton` is dynamically imported with `ssr: false` in `components/WalletButton.tsx`. This prevents React hydration errors.

## Security Notes

- PDA seeds use fixed prefixes (`agent`, `task`, `escrow_vault`, `reputation`, `protocol_state`)
- Escrow vaults are PDAs with deterministic addresses derived from task IDs
- Protocol fee wallet is controlled by protocol authority
- All fund-moving instructions use CPI with proper signer seeds
- Reputation feedback blocks self-reviews at instruction level

## Known Issues

### SBF Build / cargo-build-sbf
The `cargo-build-sbf` tool in some Solana CLI distributions uses an older cargo that cannot parse crates with `edition2024`.

**Workaround:** Use `cargo check` for development verification. For deployment, the pre-built `.so` binary works directly with `solana program deploy`.

### Frontend / @ledgerhq/errors ESM
Some wallet adapter dependencies have ESM import issues.

**Workaround:** `app/patch-ledger.js` runs on `postinstall` — patches `node_modules/@ledgerhq/errors/lib-es/index.js`.

## Resources

- [x402 Whitepaper](https://x402.org/x402-whitepaper.pdf)
- [x402 GitHub](https://github.com/coinbase/x402)
- [Anchor Docs](https://www.anchor-lang.com/)
- [Solana Program Library](https://spl.solana.com/)
- [Colosseum Hackathon](https://arena.colosseum.org/)
