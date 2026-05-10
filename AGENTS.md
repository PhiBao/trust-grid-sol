# TrustGrid — Agent Notes

## Deployment Status

| Network | Program ID | Status | Explorer |
|---------|-----------|--------|----------|
| **Devnet** | `2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE` | ✅ Live | [SolanaFM](https://solana.fm/address/2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE?cluster=devnet) |
| Localnet | Same | ✅ Verified | — |

**Deployer:** `FzjHztL4TYQaNKQGVHV5VRAG1MVp2cvHuSN6mmduBcL3`
**ProgramData:** Updated after redeploy with review-period escrow
**Last Deployed:** May 5, 2026

## Project Structure

```
trustgrid-solana/
├── programs/trustgrid-solana/    # Anchor smart contracts
│   └── src/lib.rs                # Identity, Reputation, Escrow programs
├── app/                          # Next.js frontend (Apple Design System)
│   ├── pages/                    # Routes: /, /agent, /tasks, /network, /dashboard
│   ├── components/               # Layout, AgentNetworkGraph, WalletButton, Toast
│   ├── lib/                      # On-chain data fetching + transactions + constants
│   └── styles/                   # Tailwind CSS with Apple tokens
├── cli/                          # Terminal-first interface + MCP server
│   └── trustgrid.ts              # CLI commands + MCP entry point
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
| Marketplace | `/` | Browse agents with search, category filters, Metaplex interop |
| Agent Detail | `/agent?id=X` | Full profile, reputation, feedback, hire modal, task history with submit/accept/dispute |
| Tasks | `/tasks` | Browse all tasks with status filters, sorting, review window countdown |
| Network | `/network` | Force-directed graph visualization with click/drag interactivity |
| Dashboard | `/dashboard` | Wallet stats, my tasks/agents, register agent form (with wallet badge) |
| Task Detail | `/task?id=X` | Accept/dispute, review countdown, agent profile, fund distribution tx |

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
npx ts-node --transpile-only migrations/demo-flow.ts

# Start frontend dev server
cd app && npm run dev

# Start x402 facilitator
npm run facilitator
```

## Vercel Deployment

```bash
cd app
vercel --prod
```

**Important:** `next.config.js` does NOT have `output: 'export'`. Vercel's Next.js builder handles SSR natively.

## CLI — Terminal-First Interface

Two signing modes:
- **Default**: signs with `ANCHOR_WALLET` env or `~/.config/solana/id.json`
- **Agent-first**: pass `--key <file>` to sign with an agent's own keypair

```bash
# List agents
npx ts-node --transpile-only cli/trustgrid.ts agents

# Agent detail with reputation & feedback
npx ts-node --transpile-only cli/trustgrid.ts agent 1

# List tasks
npx ts-node --transpile-only cli/trustgrid.ts tasks

# Register a new agent (your wallet is authority)
npx ts-node --transpile-only cli/trustgrid.ts register \
  --name "My Agent" \
  --uri "https://trustgrid.xyz/agents/my-agent.json" \
  --skill "smart_contract_audit" \
  --category "security" \
  --framework "rust" \
  --price "1.0" \
  --endpoint "https://my-agent.trustgrid.xyz/mcp"

# Register with dedicated keypair (agent-first mode)
npx ts-node --transpile-only cli/trustgrid.ts register \
  --name "My Agent" --uri "https://..." --generate-key

# Hire an agent (create task)
npx ts-node --transpile-only cli/trustgrid.ts hire \
  --agent 1 --amount 1.0 \
  --uri "https://task.trustgrid.xyz/task-42.json"

# Hire an agent (agent-first mode)
npx ts-node --transpile-only cli/trustgrid.ts hire \
  --key agents/alpha-trader-key.json \
  --agent 49 --amount 0.5

# Agent claims an open task
npx ts-node --transpile-only cli/trustgrid.ts claim --task 1 --agent 1

# Agent claims (agent-first mode)
npx ts-node --transpile-only cli/trustgrid.ts claim \
  --key agents/nemesis-auditor-key.json --task 1 --agent 49

# Agent submits claimed work for client review
npx ts-node --transpile-only cli/trustgrid.ts submit --task 1 --agent 1

# Agent submits (agent-first mode)
npx ts-node --transpile-only cli/trustgrid.ts submit \
  --key agents/nemesis-auditor-key.json --task 1 --agent 49

# Client accepts, releases escrow + writes feedback
npx ts-node --transpile-only cli/trustgrid.ts accept \
  --task 1 --agent 1 --value 5 --tag "excellent"

# Client accepts (agent-first mode)
npx ts-node --transpile-only cli/trustgrid.ts accept \
  --key agents/client-key.json --task 1 --agent 49 --value 5 --tag "excellent"

# Client disputes submitted work
npx ts-node --transpile-only cli/trustgrid.ts dispute \
  --task 1 --reason "Work does not meet requirements"

# Submit on-chain feedback
npx ts-node --transpile-only cli/trustgrid.ts feedback \
  --agent 1 --value 5 --tag "excellent"

# Start MCP server for AI integration
npx ts-node --transpile-only cli/trustgrid.ts mcp
```

### MCP Server

The `mcp` command starts a Model Context Protocol server that exposes 6 tools to AI agents:

| Tool | Action |
|------|--------|
| `trustgrid_list_agents` | List all registered agents |
| `trustgrid_get_agent` | Get agent details by ID |
| `trustgrid_list_tasks` | List all tasks |
| `trustgrid_register_agent` | Register a new agent |
| `trustgrid_hire_agent` | Create a task to hire an agent |
| `trustgrid_give_feedback` | Submit feedback for an agent |

Connect to Claude Desktop, Cursor, or any MCP client via stdio.

## Frontend Features

### Real On-Chain Data
All UI data is fetched live from Solana devnet — no mocks:
- **Agent fetching**: `app/lib/agents.ts` manually deserializes Anchor borsh PDAs
- **Reputation**: `fetchReputation(agentId)` reads `AgentReputation` PDA
- **Feedbacks**: `fetchFeedbacksForAgent(agentId)` filters program accounts client-side
- **Tasks**: `fetchTasks()` iterates task counter and decodes each `Task` PDA
- **Network Graph**: Canvas physics simulation with category-based coloring

### UI Polish
- **Search & Filter**: Marketplace has real-time search by name/skill/category + category pill filters
- **Metaplex Interop**: Marketplace displays Metaplex-registered agents (MPL Core) alongside TrustGrid-native agents, with purple badges and explorer links
- **Sort Tasks**: Task board supports sorting by newest, oldest, amount high→low, amount low→high
- **Reputation Preview**: Agent cards show star rating and review count fetched live from on-chain reputation PDAs
- **Skeleton Loading**: All data-heavy pages show Apple-style skeleton placeholders while fetching from devnet
- **Empty States**: Every list has a contextual empty state with icon and next-step guidance
- **Styled Selects**: Custom CSS for `<select>` dropdowns with rounded pills, hover states, and focus rings
- **Network Graph Interactivity**: Click nodes to navigate to agent pages, drag to rearrange, hover for tooltips

### Review-Period Escrow
The new escrow flow adds a review period between work submission and fund release:
- **Task lifecycle**: `open → claimed → submitted → completed/disputed`
- **Agent submits work**: Agent clicks "Submit Work for Review" — task enters `submitted` status
- **Review window**: 24-hour countdown shown in UI for client to review
- **Client accepts**: Client clicks "Accept & Release Funds" — USDC releases + on-chain feedback written
- **Client disputes**: Client clicks "Dispute" within 24h — funds locked, reason recorded on-chain
- **Legacy complete**: `complete_task` still works for backward compatibility

### Wallet Badges
- **Agent-Owned Wallets**: When `agent.authority !== connectedWallet`, dashboard and agent detail show an amber badge with "Agent-Owned Wallet" and "⚠️ Fund this wallet" warning
- **Default Mode**: When authority matches the connected wallet, a blue "Uses your wallet" badge is shown
- **Detection**: Agent-first mode is inferred by comparing on-chain `authority` to the connected wallet — no separate flag needed

### Task Detail Page
- `/task?id=X` shows full task info: status, amount, timeline, review countdown
- **Accept/Dispute buttons**: Client accepts (releases funds + writes feedback) or disputes (locks funds) within 24h review window
- **Fund distribution tx**: On accept/dispute, shows a clickable SolanaFM tx link. For historical tasks, fetches the latest vault tx via `getSignaturesForAddress`
- **Agent profile sidebar**: Shows agent name, category, wallet, and reputation

### Interactive Features
- **Hire Agent**: Opens modal on agent detail page → create task with USDC escrow → shows clickable SolanaFM tx link
- **Submit Work**: Agent submits completed task for client review → enters 24h review window
- **Accept Task**: Client accepts submitted work → funds release + on-chain feedback → shows clickable tx link
- **Dispute Task**: Client disputes within review window → funds locked, dispute reason recorded on-chain
- **Give Feedback**: Star rating + tag → submits on-chain `give_feedback` instruction → shows clickable tx link
- **Register Agent**: Dashboard form → submits on-chain `register_agent` instruction → shows clickable tx link
- **Task Creation**: USDC amount + URI → simulation-checked before wallet prompt → shows clickable tx link

### Transaction Links
Every on-chain action shows a toast with a **"View Tx →"** link to SolanaFM explorer:
```
Feedback submitted on-chain!  [View Tx →]
```

### Transaction Safety
`sendTxRobust()` in `lib/transactions.ts`:
1. Simulates the transaction first to catch errors
2. Tries wallet adapter `sendTransaction`
3. Falls back to manual `signTransaction` + `sendRawTransaction`

## Architecture Decisions

### Why PDAs instead of NFTs?
Solana PDAs are cheaper to create (~0.002 SOL) and more composable than Metaplex NFTs for identity use cases. However, TrustGrid **interoperates** with Metaplex — we read MPL Core assets with AgentIdentity plugins and layer reputation + escrow on top.

### Why no static export?
Removed `output: 'export'` to support SSR on Vercel. Dynamic wallet adapter components cause hydration mismatches when prerendered.

### Wallet adapter hydration fix
`WalletMultiButton` is dynamically imported with `ssr: false` in `components/WalletButton.tsx`. This prevents React hydration errors.

### Single source of truth for Program ID
`app/lib/constants.ts` exports `PROGRAM_ID`, `PROGRAM_ID_STRING`, `USDC_MINT`, `RPC_URL`, and explorer URL helpers. All components import from here. Change `.env` and everything updates.

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
