import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TrustgridSolana } from "../target/types/trustgrid_solana";
import { expect } from "chai";

describe("trustgrid-solana", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.TrustgridSolana as Program<TrustgridSolana>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const payer = provider.wallet as anchor.Wallet;

  it("Initialize protocol", async () => {
    await program.methods
      .initializeProtocol()
      .accounts({
        authority: payer.publicKey,
      })
      .rpc();

    // Fetch the counter accounts
    const agentCounter = await program.account.agentCounter.fetch(
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("agent_counter")],
        program.programId
      )[0]
    );
    expect(agentCounter.count.toNumber()).to.equal(0);
  });

  it("Register agent", async () => {
    const agentUri = "https://trustgrid.xyz/agents/1.json";
    const metadata = [
      ["skill", "security_audit"],
      ["framework", "rust"],
    ];

    await program.methods
      .registerAgent(agentUri, metadata)
      .accounts({
        authority: payer.publicKey,
      })
      .rpc();

    const agentCounter = await program.account.agentCounter.fetch(
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("agent_counter")],
        program.programId
      )[0]
    );
    expect(agentCounter.count.toNumber()).to.equal(1);

    const agentIdentity = await program.account.agentIdentity.fetch(
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("agent"),
          payer.publicKey.toBuffer(),
          new anchor.BN(1).toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      )[0]
    );
    expect(agentIdentity.agentId.toNumber()).to.equal(1);
    expect(agentIdentity.agentUri).to.equal(agentUri);
    expect(agentIdentity.active).to.be.true;
  });

  it("Give feedback", async () => {
    const agentPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        payer.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    await program.methods
      .giveFeedback(5, "excellent")
      .accounts({
        client: payer.publicKey,
        agentIdentity: agentPda,
      })
      .rpc();

    const reputation = await program.account.agentReputation.fetch(
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("reputation"), new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
        program.programId
      )[0]
    );
    expect(reputation.feedbackCount.toNumber()).to.equal(1);
    expect(reputation.averageScore.toNumber()).to.equal(500); // 5.0 * 100
  });

  it("Update agent wallet", async () => {
    const agentPda = anchor.web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from("agent"),
        payer.publicKey.toBuffer(),
        new anchor.BN(1).toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    )[0];

    const newWallet = anchor.web3.Keypair.generate().publicKey;

    await program.methods
      .setAgentWallet(newWallet)
      .accounts({
        authority: payer.publicKey,
        agentIdentity: agentPda,
      })
      .rpc();

    const agentIdentity = await program.account.agentIdentity.fetch(agentPda);
    expect(agentIdentity.wallet.toBase58()).to.equal(newWallet.toBase58());
  });
});
