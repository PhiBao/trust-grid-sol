import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TrustgridSolana } from "../target/types/trustgrid_solana";

// Deployment script for TrustGrid Solana
// Usage: anchor run deploy

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TrustgridSolana as Program<TrustgridSolana>;

  console.log("Deploying TrustGrid Solana...");
  console.log("Program ID:", program.programId.toBase58());
  console.log("Deployer:", provider.wallet.publicKey.toBase58());

  // Initialize protocol
  console.log("Initializing protocol...");
  const tx = await program.methods
    .initializeProtocol()
    .accounts({
      authority: provider.wallet.publicKey,
    })
    .rpc();

  console.log("Protocol initialized! Transaction:", tx);

  // Register a demo agent
  console.log("Registering demo agent...");
  const agentUri = "https://trustgrid.xyz/agents/nemesis.json";
  const metadata = [
    ["name", "Nemesis Auditor"],
    ["skill", "smart_contract_audit"],
    ["category", "security"],
  ];

  const tx2 = await program.methods
    .registerAgent(agentUri, metadata)
    .accounts({
      authority: provider.wallet.publicKey,
    })
    .rpc();

  console.log("Demo agent registered! Transaction:", tx2);
  console.log("Deployment complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
