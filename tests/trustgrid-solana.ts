import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";
import { TrustgridSolana } from "../target/types/trustgrid_solana";

describe("trustgrid-solana", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.TrustgridSolana as Program<TrustgridSolana>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const wallet = provider.wallet as anchor.Wallet;
  const payer = (wallet as any).payer as anchor.web3.Keypair;

  const client = anchor.web3.Keypair.generate();
  const agentAuthority = anchor.web3.Keypair.generate();
  const feedbackClient = anchor.web3.Keypair.generate();

  let tokenMint: anchor.web3.PublicKey;
  let clientTokenAccount: anchor.web3.PublicKey;
  let agentTokenAccount: anchor.web3.PublicKey;
  let feeTokenAccount: anchor.web3.PublicKey;
  let agentPda: anchor.web3.PublicKey;

  function u64(n: number): Buffer {
    return new anchor.BN(n).toArrayLike(Buffer, "le", 8);
  }

  function pda(seeds: Buffer[]): anchor.web3.PublicKey {
    return anchor.web3.PublicKey.findProgramAddressSync(
      seeds,
      program.programId
    )[0];
  }

  async function fund(pubkey: anchor.web3.PublicKey) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function registerAgent(name: string): Promise<number> {
    const counterPda = pda([Buffer.from("agent_counter")]);
    const counter = await program.account.agentCounter.fetch(counterPda);
    const agentId = counter.count.toNumber() + 1;

    await program.methods
      .registerAgent(`https://trustgrid.xyz/agents/${name}.json`, [
        ["name", name],
        ["skill", "security_audit"],
        ["framework", "rust"],
      ])
      .accounts({
        authority: agentAuthority.publicKey,
      })
      .signers([agentAuthority])
      .rpc();

    return agentId;
  }

  async function createTask(
    agentId: number,
    amount: anchor.BN
  ): Promise<{
    taskId: number;
    taskPda: anchor.web3.PublicKey;
    escrowVault: anchor.web3.PublicKey;
  }> {
    const taskCounterPda = pda([Buffer.from("task_counter")]);
    const taskCounter = await program.account.taskCounter.fetch(taskCounterPda);
    const taskId = taskCounter.count.toNumber() + 1;
    const taskPda = pda([Buffer.from("task"), u64(taskId)]);
    const escrowVault = pda([Buffer.from("escrow_vault"), u64(taskId)]);
    const deadline = new anchor.BN(
      Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
    );

    await program.methods
      .createTask(
        new anchor.BN(agentId),
        amount,
        deadline,
        `https://trustgrid.xyz/tasks/${taskId}.json`
      )
      .accounts({
        client: client.publicKey,
        taskCounter: taskCounterPda,
        task: taskPda,
        tokenMint,
        clientTokenAccount,
        escrowVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([client])
      .rpc();

    return { taskId, taskPda, escrowVault };
  }

  before(async () => {
    await Promise.all([
      fund(client.publicKey),
      fund(agentAuthority.publicKey),
      fund(feedbackClient.publicKey),
    ]);

    tokenMint = await createMint(
      provider.connection,
      payer,
      payer.publicKey,
      null,
      6
    );
    clientTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        tokenMint,
        client.publicKey
      )
    ).address;
    agentTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        tokenMint,
        agentAuthority.publicKey
      )
    ).address;
    feeTokenAccount = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        payer,
        tokenMint,
        wallet.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      payer,
      tokenMint,
      clientTokenAccount,
      payer,
      10_000_000
    );
  });

  it("initializes protocol", async () => {
    await program.methods
      .initializeProtocol()
      .accounts({
        authority: wallet.publicKey,
      })
      .rpc();

    const agentCounter = await program.account.agentCounter.fetch(
      pda([Buffer.from("agent_counter")])
    );
    expect(agentCounter.count.toNumber()).to.equal(0);
  });

  it("registers an agent", async () => {
    const agentId = await registerAgent("demo-auditor");
    agentPda = pda([
      Buffer.from("agent"),
      agentAuthority.publicKey.toBuffer(),
      u64(agentId),
    ]);

    const agentIdentity = await program.account.agentIdentity.fetch(agentPda);
    expect(agentIdentity.agentId.toNumber()).to.equal(agentId);
    expect(agentIdentity.authority.toBase58()).to.equal(
      agentAuthority.publicKey.toBase58()
    );
    expect(agentIdentity.active).to.equal(true);
  });

  it("allows non-self feedback", async () => {
    await program.methods
      .giveFeedback(5, "excellent")
      .accounts({
        client: feedbackClient.publicKey,
        agentIdentity: agentPda,
      })
      .signers([feedbackClient])
      .rpc();

    const reputation = await program.account.agentReputation.fetch(
      pda([Buffer.from("reputation"), u64(1)])
    );
    expect(reputation.feedbackCount.toNumber()).to.equal(1);
    expect(reputation.averageScore.toNumber()).to.equal(500);
  });

  it("runs create -> claim -> submit -> accept with escrow release and feedback", async () => {
    const amount = new anchor.BN(1_000_000);
    const { taskPda, escrowVault } = await createTask(1, amount);

    let escrow = await getAccount(provider.connection, escrowVault);
    expect(Number(escrow.amount)).to.equal(1_000_000);

    await program.methods
      .claimTask()
      .accounts({
        claimer: agentAuthority.publicKey,
        task: taskPda,
        agentIdentity: agentPda,
      })
      .signers([agentAuthority])
      .rpc();

    await program.methods
      .submitTask()
      .accounts({
        submitter: agentAuthority.publicKey,
        task: taskPda,
        agentIdentity: agentPda,
      })
      .signers([agentAuthority])
      .rpc();

    const repPda = pda([Buffer.from("reputation"), u64(1)]);
    const reputationBefore = await program.account.agentReputation.fetch(
      repPda
    );
    const feedbackPda = pda([
      Buffer.from("feedback"),
      u64(1),
      client.publicKey.toBuffer(),
      u64(reputationBefore.feedbackCount.toNumber()),
    ]);

    await program.methods
      .acceptTask(5, "accepted")
      .accounts({
        client: client.publicKey,
        task: taskPda,
        protocolState: pda([Buffer.from("protocol_state")]),
        agentIdentity: agentPda,
        agentReputation: repPda,
        feedback: feedbackPda,
        escrowVault,
        feeTokenAccount,
        agentTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([client])
      .rpc();

    const task = await program.account.task.fetch(taskPda);
    expect(task.status).to.deep.equal({ completed: {} });

    escrow = await getAccount(provider.connection, escrowVault);
    const agentAccount = await getAccount(
      provider.connection,
      agentTokenAccount
    );
    const feeAccount = await getAccount(provider.connection, feeTokenAccount);
    const reputationAfter = await program.account.agentReputation.fetch(repPda);

    expect(Number(escrow.amount)).to.equal(0);
    expect(Number(agentAccount.amount)).to.equal(990_000);
    expect(Number(feeAccount.amount)).to.equal(10_000);
    expect(reputationAfter.feedbackCount.toNumber()).to.equal(
      reputationBefore.feedbackCount.toNumber() + 1
    );
  });

  it("runs create -> claim -> submit -> dispute while keeping escrow locked", async () => {
    const amount = new anchor.BN(2_000_000);
    const { taskPda, escrowVault } = await createTask(1, amount);

    await program.methods
      .claimTask()
      .accounts({
        claimer: agentAuthority.publicKey,
        task: taskPda,
        agentIdentity: agentPda,
      })
      .signers([agentAuthority])
      .rpc();

    await program.methods
      .submitTask()
      .accounts({
        submitter: agentAuthority.publicKey,
        task: taskPda,
        agentIdentity: agentPda,
      })
      .signers([agentAuthority])
      .rpc();

    await program.methods
      .disputeTask("Work does not meet requirements")
      .accounts({
        client: client.publicKey,
        task: taskPda,
      })
      .signers([client])
      .rpc();

    const task = await program.account.task.fetch(taskPda);
    const escrow = await getAccount(provider.connection, escrowVault);

    expect(task.status).to.deep.equal({ disputed: {} });
    expect(task.disputeReason).to.equal("Work does not meet requirements");
    expect(Number(escrow.amount)).to.equal(2_000_000);
  });
});
