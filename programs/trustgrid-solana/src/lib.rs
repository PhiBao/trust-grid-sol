use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Mint, Transfer};

// Protocol fee: 1% = 100 basis points
const PROTOCOL_FEE_BPS: u64 = 100;
const BPS_DENOMINATOR: u64 = 10_000;

// Review window: 24 hours in seconds
const REVIEW_WINDOW_SECONDS: i64 = 24 * 60 * 60;

declare_id!("2Ps1h8YwCTxLo6bHiCaN3xT2r8mdj5qP4hxUPrVoCszE");

#[program]
pub mod trustgrid_solana {
    use super::*;

    // ==================== IDENTITY REGISTRY ====================

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        let counter = &mut ctx.accounts.agent_counter;
        counter.count = 0;
        
        let task_counter = &mut ctx.accounts.task_counter;
        task_counter.count = 0;
        
        let protocol_state = &mut ctx.accounts.protocol_state;
        protocol_state.authority = ctx.accounts.authority.key();
        protocol_state.fee_wallet = ctx.accounts.authority.key();
        protocol_state.total_fees_collected = 0;
        
        msg!("TrustGrid protocol initialized");
        Ok(())
    }

    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        agent_uri: String,
        metadata: Vec<(String, String)>,
    ) -> Result<()> {
        require!(agent_uri.len() <= 200, ErrorCode::UriTooLong);
        require!(metadata.len() <= 20, ErrorCode::TooManyMetadata);
        
        // Check reserved metadata key
        for (key, _) in &metadata {
            require!(
                key != "agentWallet",
                ErrorCode::ReservedMetadataKey
            );
        }

        let counter = &mut ctx.accounts.agent_counter;
        counter.count += 1;
        let agent_id = counter.count;

        let agent = &mut ctx.accounts.agent_identity;
        agent.agent_id = agent_id;
        agent.authority = ctx.accounts.authority.key();
        agent.agent_uri = agent_uri;
        agent.metadata = metadata;
        agent.wallet = Pubkey::default();
        agent.active = true;
        agent.created_at = Clock::get()?.unix_timestamp;

        msg!("Agent registered: id={}, uri={}", agent_id, agent.agent_uri);
        Ok(())
    }

    pub fn update_agent_uri(
        ctx: Context<UpdateAgent>,
        new_uri: String,
    ) -> Result<()> {
        require!(new_uri.len() <= 200, ErrorCode::UriTooLong);
        
        let agent = &mut ctx.accounts.agent_identity;
        agent.agent_uri = new_uri;
        
        msg!("Agent URI updated: id={}", agent.agent_id);
        Ok(())
    }

    pub fn set_agent_metadata(
        ctx: Context<UpdateAgent>,
        key: String,
        value: String,
    ) -> Result<()> {
        require!(key != "agentWallet", ErrorCode::ReservedMetadataKey);
        require!(key.len() <= 50, ErrorCode::KeyTooLong);
        require!(value.len() <= 200, ErrorCode::ValueTooLong);

        let agent = &mut ctx.accounts.agent_identity;
        
        // Update existing or add new
        let mut found = false;
        for (k, v) in agent.metadata.iter_mut() {
            if *k == key {
                *v = value.clone();
                found = true;
                break;
            }
        }
        
        if !found {
            require!(agent.metadata.len() < 20, ErrorCode::TooManyMetadata);
            agent.metadata.push((key, value));
        }

        Ok(())
    }

    pub fn set_agent_wallet(
        ctx: Context<SetAgentWallet>,
        wallet: Pubkey,
    ) -> Result<()> {
        let agent = &mut ctx.accounts.agent_identity;
        agent.wallet = wallet;
        
        msg!("Agent wallet set: id={}, wallet={}", agent.agent_id, wallet);
        Ok(())
    }

    pub fn deactivate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        let agent = &mut ctx.accounts.agent_identity;
        agent.active = false;
        
        msg!("Agent deactivated: id={}", agent.agent_id);
        Ok(())
    }

    // ==================== REPUTATION REGISTRY ====================

    pub fn give_feedback(
        ctx: Context<GiveFeedback>,
        value: u8,
        tag: String,
    ) -> Result<()> {
        require!(value >= 1 && value <= 5, ErrorCode::InvalidFeedbackValue);
        require!(tag.len() <= 50, ErrorCode::TagTooLong);
        
        let agent_id = ctx.accounts.agent_identity.agent_id;
        let client = ctx.accounts.client.key();
        
        // Prevent self-feedback
        require!(
            ctx.accounts.agent_identity.authority != client,
            ErrorCode::SelfFeedbackNotAllowed
        );

        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.agent_id = agent_id;
        reputation.total_feedback += 1;
        
        // Update running average (scaled by 100)
        let new_avg = ((reputation.average_score as u128 * (reputation.feedback_count as u128) + (value as u128 * 100)) / (reputation.feedback_count as u128 + 1)) as u64;
        reputation.average_score = new_avg;
        reputation.feedback_count += 1;

        let feedback = &mut ctx.accounts.feedback;
        feedback.agent_id = agent_id;
        feedback.client = client;
        feedback.value = value;
        feedback.tag = tag;
        feedback.response_uri = None;
        feedback.created_at = Clock::get()?.unix_timestamp;
        feedback.index = reputation.feedback_count - 1;

        msg!(
            "Feedback given: agent_id={}, client={}, value={}",
            agent_id,
            client,
            value
        );
        Ok(())
    }

    pub fn revoke_feedback(ctx: Context<RevokeFeedback>) -> Result<()> {
        let feedback = &ctx.accounts.feedback;
        let agent_id = feedback.agent_id;
        
        msg!("Feedback revoked: agent_id={}, index={}", agent_id, feedback.index);
        Ok(())
    }

    pub fn append_response(
        ctx: Context<AppendResponse>,
        response_uri: String,
    ) -> Result<()> {
        require!(response_uri.len() <= 200, ErrorCode::UriTooLong);
        
        let feedback = &mut ctx.accounts.feedback;
        feedback.response_uri = Some(response_uri);
        
        msg!(
            "Response appended: agent_id={}, index={}",
            feedback.agent_id,
            feedback.index
        );
        Ok(())
    }

    // ==================== AGENT ESCROW ====================

    pub fn create_task(
        ctx: Context<CreateTask>,
        agent_id: u64,
        amount: u64,
        deadline: i64,
        task_uri: String,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        require!(task_uri.len() <= 200, ErrorCode::UriTooLong);
        require!(deadline > Clock::get()?.unix_timestamp, ErrorCode::InvalidDeadline);

        let task_counter = &mut ctx.accounts.task_counter;
        task_counter.count += 1;
        let task_id = task_counter.count;

        // Transfer USDC from client to escrow vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.client_token_account.to_account_info(),
            to: ctx.accounts.escrow_vault.to_account_info(),
            authority: ctx.accounts.client.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, amount)?;

        let task = &mut ctx.accounts.task;
        task.task_id = task_id;
        task.client = ctx.accounts.client.key();
        task.agent_id = agent_id;
        task.token_mint = ctx.accounts.token_mint.key();
        task.amount = amount;
        task.deadline = deadline;
        task.task_uri = task_uri;
        task.status = TaskStatus::Open;
        task.claimed_by = None;
        task.escrow_vault = ctx.accounts.escrow_vault.key();
        task.submitted_at = 0;
        task.dispute_reason = None;

        msg!(
            "Task created: id={}, agent_id={}, amount={}",
            task_id,
            agent_id,
            amount
        );
        Ok(())
    }

    pub fn claim_task(ctx: Context<ClaimTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let agent_identity = &ctx.accounts.agent_identity;
        
        require!(task.status == TaskStatus::Open, ErrorCode::TaskNotOpen);
        require!(
            task.agent_id == 0 || task.agent_id == agent_identity.agent_id,
            ErrorCode::WrongAgentClaim
        );
        
        // Verify the claimer owns the agent identity
        require!(
            agent_identity.authority == ctx.accounts.claimer.key() ||
            agent_identity.wallet == ctx.accounts.claimer.key(),
            ErrorCode::UnauthorizedClaim
        );

        task.status = TaskStatus::Claimed;
        task.claimed_by = Some(ctx.accounts.claimer.key());

        msg!(
            "Task claimed: id={}, agent_id={}, claimer={}",
            task.task_id,
            agent_identity.agent_id,
            ctx.accounts.claimer.key()
        );
        Ok(())
    }

    // Agent submits completed work for client review
    pub fn submit_task(ctx: Context<SubmitTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        let agent_identity = &ctx.accounts.agent_identity;
        
        require!(task.status == TaskStatus::Claimed, ErrorCode::TaskNotClaimed);
        
        // Verify the submitter is the claimer
        let claimer = task.claimed_by.ok_or(ErrorCode::UnauthorizedSubmission)?;
        require!(
            claimer == ctx.accounts.submitter.key(),
            ErrorCode::UnauthorizedSubmission
        );
        require!(
            agent_identity.agent_id == task.agent_id,
            ErrorCode::WrongAgentClaim
        );

        task.status = TaskStatus::Submitted;
        task.submitted_at = Clock::get()?.unix_timestamp;

        msg!(
            "Task submitted for review: id={}, agent_id={}",
            task.task_id,
            agent_identity.agent_id
        );
        Ok(())
    }

    // Client accepts submitted work — releases funds + writes feedback
    pub fn accept_task(
        ctx: Context<AcceptTask>,
        feedback_value: u8,
        feedback_tag: String,
    ) -> Result<()> {
        require!(
            feedback_value >= 1 && feedback_value <= 5,
            ErrorCode::InvalidFeedbackValue
        );
        require!(feedback_tag.len() <= 50, ErrorCode::TagTooLong);
        
        let task = &mut ctx.accounts.task;
        require!(task.status == TaskStatus::Submitted, ErrorCode::TaskNotSubmitted);
        require!(
            task.client == ctx.accounts.client.key(),
            ErrorCode::UnauthorizedCompletion
        );

        let protocol_fee = task.amount * PROTOCOL_FEE_BPS / BPS_DENOMINATOR;
        let agent_payment = task.amount - protocol_fee;

        // Transfer protocol fee to fee wallet
        let protocol_state = &ctx.accounts.protocol_state;
        let fee_wallet = protocol_state.fee_wallet;
        
        let escrow_bump = ctx.bumps.escrow_vault;
        let task_id_bytes = task.task_id.to_le_bytes();
        let seeds = &[b"escrow_vault", task_id_bytes.as_ref(), &[escrow_bump]];
        let signer = &[&seeds[..]];

        // Transfer protocol fee
        if protocol_fee > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.fee_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, protocol_fee)?;
        }

        // Transfer remaining to agent
        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.agent_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, agent_payment)?;

        // Update protocol state
        let protocol_state = &mut ctx.accounts.protocol_state;
        protocol_state.total_fees_collected += protocol_fee;

        task.status = TaskStatus::Completed;

        // Auto-write reputation feedback
        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.agent_id = task.agent_id;
        reputation.total_feedback += 1;
        let new_avg = ((reputation.average_score as u128 * (reputation.feedback_count as u128) + (feedback_value as u128 * 100)) / (reputation.feedback_count as u128 + 1)) as u64;
        reputation.average_score = new_avg;
        reputation.feedback_count += 1;

        let feedback = &mut ctx.accounts.feedback;
        feedback.agent_id = task.agent_id;
        feedback.client = ctx.accounts.client.key();
        feedback.value = feedback_value;
        feedback.tag = feedback_tag;
        feedback.response_uri = None;
        feedback.created_at = Clock::get()?.unix_timestamp;
        feedback.index = reputation.feedback_count - 1;

        msg!(
            "Task accepted: id={}, agent_payment={}, fee={}",
            task.task_id,
            agent_payment,
            protocol_fee
        );
        Ok(())
    }

    // Client disputes submitted work — locks funds for arbitration
    pub fn dispute_task(
        ctx: Context<DisputeTask>,
        reason: String,
    ) -> Result<()> {
        require!(reason.len() <= 200, ErrorCode::UriTooLong);
        
        let task = &mut ctx.accounts.task;
        require!(task.status == TaskStatus::Submitted, ErrorCode::TaskNotSubmitted);
        require!(
            task.client == ctx.accounts.client.key(),
            ErrorCode::UnauthorizedCompletion
        );
        require!(
            Clock::get()?.unix_timestamp <= task.submitted_at + REVIEW_WINDOW_SECONDS,
            ErrorCode::ReviewWindowExpired
        );

        task.status = TaskStatus::Disputed;
        task.dispute_reason = Some(reason);

        msg!(
            "Task disputed: id={}, reason={}",
            task.task_id,
            task.dispute_reason.as_ref().unwrap()
        );
        Ok(())
    }

    // Legacy: complete_task now redirects to submit_task behavior for backward compat
    // In production, remove this and use submit_task + accept_task flow
    pub fn complete_task(
        ctx: Context<CompleteTask>,
        feedback_value: u8,
        feedback_tag: String,
    ) -> Result<()> {
        require!(
            feedback_value >= 1 && feedback_value <= 5,
            ErrorCode::InvalidFeedbackValue
        );
        require!(feedback_tag.len() <= 50, ErrorCode::TagTooLong);
        
        let task = &mut ctx.accounts.task;
        require!(task.status == TaskStatus::Claimed, ErrorCode::TaskNotClaimed);
        require!(
            task.client == ctx.accounts.client.key(),
            ErrorCode::UnauthorizedCompletion
        );

        let protocol_fee = task.amount * PROTOCOL_FEE_BPS / BPS_DENOMINATOR;
        let agent_payment = task.amount - protocol_fee;

        let protocol_state = &ctx.accounts.protocol_state;
        let fee_wallet = protocol_state.fee_wallet;
        
        let escrow_bump = ctx.bumps.escrow_vault;
        let task_id_bytes = task.task_id.to_le_bytes();
        let seeds = &[b"escrow_vault", task_id_bytes.as_ref(), &[escrow_bump]];
        let signer = &[&seeds[..]];

        if protocol_fee > 0 {
            let cpi_accounts = Transfer {
                from: ctx.accounts.escrow_vault.to_account_info(),
                to: ctx.accounts.fee_token_account.to_account_info(),
                authority: ctx.accounts.escrow_vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, protocol_fee)?;
        }

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.agent_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, agent_payment)?;

        let protocol_state = &mut ctx.accounts.protocol_state;
        protocol_state.total_fees_collected += protocol_fee;

        task.status = TaskStatus::Completed;

        let reputation = &mut ctx.accounts.agent_reputation;
        reputation.agent_id = task.agent_id;
        reputation.total_feedback += 1;
        let new_avg = ((reputation.average_score as u128 * (reputation.feedback_count as u128) + (feedback_value as u128 * 100)) / (reputation.feedback_count as u128 + 1)) as u64;
        reputation.average_score = new_avg;
        reputation.feedback_count += 1;

        let feedback = &mut ctx.accounts.feedback;
        feedback.agent_id = task.agent_id;
        feedback.client = ctx.accounts.client.key();
        feedback.value = feedback_value;
        feedback.tag = feedback_tag;
        feedback.response_uri = None;
        feedback.created_at = Clock::get()?.unix_timestamp;
        feedback.index = reputation.feedback_count - 1;

        msg!(
            "Task completed (legacy): id={}, agent_payment={}, fee={}",
            task.task_id,
            agent_payment,
            protocol_fee
        );
        Ok(())
    }

    pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        require!(task.status == TaskStatus::Open, ErrorCode::TaskNotOpen);
        require!(
            task.client == ctx.accounts.client.key(),
            ErrorCode::UnauthorizedCancellation
        );

        // Refund full amount
        let escrow_bump = ctx.bumps.escrow_vault;
        let task_id_bytes = task.task_id.to_le_bytes();
        let seeds = &[b"escrow_vault", task_id_bytes.as_ref(), &[escrow_bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.client_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, task.amount)?;

        task.status = TaskStatus::Cancelled;

        msg!("Task cancelled: id={}", task.task_id);
        Ok(())
    }

    pub fn reclaim_expired(ctx: Context<ReclaimExpired>) -> Result<()> {
        let task = &mut ctx.accounts.task;
        require!(task.status == TaskStatus::Open, ErrorCode::TaskNotOpen);
        require!(
            Clock::get()?.unix_timestamp > task.deadline,
            ErrorCode::TaskNotExpired
        );
        require!(
            task.client == ctx.accounts.client.key(),
            ErrorCode::UnauthorizedReclaim
        );

        // Refund full amount
        let escrow_bump = ctx.bumps.escrow_vault;
        let task_id_bytes = task.task_id.to_le_bytes();
        let seeds = &[b"escrow_vault", task_id_bytes.as_ref(), &[escrow_bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.escrow_vault.to_account_info(),
            to: ctx.accounts.client_token_account.to_account_info(),
            authority: ctx.accounts.escrow_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, task.amount)?;

        task.status = TaskStatus::Expired;

        msg!("Task expired and reclaimed: id={}", task.task_id);
        Ok(())
    }

    pub fn update_fee_wallet(
        ctx: Context<UpdateProtocolState>,
        new_fee_wallet: Pubkey,
    ) -> Result<()> {
        let protocol_state = &mut ctx.accounts.protocol_state;
        protocol_state.fee_wallet = new_fee_wallet;
        
        msg!("Fee wallet updated: {}", new_fee_wallet);
        Ok(())
    }
}

// ==================== ACCOUNT STRUCTURES ====================

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 8,
        seeds = [b"agent_counter"],
        bump
    )]
    pub agent_counter: Account<'info, AgentCounter>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + 8,
        seeds = [b"task_counter"],
        bump
    )]
    pub task_counter: Account<'info, TaskCounter>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolState::SIZE,
        seeds = [b"protocol_state"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"agent_counter"],
        bump
    )]
    pub agent_counter: Account<'info, AgentCounter>,
    
    #[account(
        init,
        payer = authority,
        space = 8 + AgentIdentity::MAX_SIZE,
        seeds = [b"agent", authority.key().as_ref(), (agent_counter.count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = agent_identity.authority == authority.key()
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
}

#[derive(Accounts)]
pub struct SetAgentWallet<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = agent_identity.authority == authority.key()
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
}

#[derive(Accounts)]
pub struct GiveFeedback<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        constraint = agent_identity.active
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    
    #[account(
        init_if_needed,
        payer = client,
        space = 8 + AgentReputation::SIZE,
        seeds = [b"reputation", agent_identity.agent_id.to_le_bytes().as_ref()],
        bump
    )]
    pub agent_reputation: Account<'info, AgentReputation>,
    
    #[account(
        init,
        payer = client,
        space = 8 + Feedback::MAX_SIZE,
        seeds = [
            b"feedback",
            agent_identity.agent_id.to_le_bytes().as_ref(),
            client.key().as_ref(),
            agent_reputation.feedback_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub feedback: Account<'info, Feedback>,
    
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeFeedback<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        constraint = feedback.client == client.key()
    )]
    pub feedback: Account<'info, Feedback>,
}

#[derive(Accounts)]
pub struct AppendResponse<'info> {
    #[account(mut)]
    pub agent_authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = agent_identity.authority == agent_authority.key()
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    
    #[account(
        mut,
        constraint = feedback.agent_id == agent_identity.agent_id
    )]
    pub feedback: Account<'info, Feedback>,
}

#[derive(Accounts)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        seeds = [b"task_counter"],
        bump
    )]
    pub task_counter: Account<'info, TaskCounter>,
    
    #[account(
        init,
        payer = client,
        space = 8 + Task::MAX_SIZE,
        seeds = [b"task", (task_counter.count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub task: Account<'info, Task>,
    
    #[account(mut)]
    pub token_mint: Account<'info, Mint>,
    
    #[account(
        mut,
        constraint = client_token_account.owner == client.key(),
        constraint = client_token_account.mint == token_mint.key()
    )]
    pub client_token_account: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = client,
        token::mint = token_mint,
        token::authority = escrow_vault,
        seeds = [b"escrow_vault", (task_counter.count + 1).to_le_bytes().as_ref()],
        bump
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct ClaimTask<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.status == TaskStatus::Open
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        constraint = task.agent_id == 0 || agent_identity.agent_id == task.agent_id
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
}

#[derive(Accounts)]
pub struct SubmitTask<'info> {
    #[account(mut)]
    pub submitter: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.status == TaskStatus::Claimed
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        constraint = agent_identity.agent_id == task.agent_id
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
}

#[derive(Accounts)]
pub struct AcceptTask<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.client == client.key()
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        constraint = agent_identity.agent_id == task.agent_id
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    
    #[account(
        init_if_needed,
        payer = client,
        space = 8 + AgentReputation::SIZE,
        seeds = [b"reputation", task.agent_id.to_le_bytes().as_ref()],
        bump
    )]
    pub agent_reputation: Account<'info, AgentReputation>,
    
    #[account(
        init,
        payer = client,
        space = 8 + Feedback::MAX_SIZE,
        seeds = [
            b"feedback",
            task.agent_id.to_le_bytes().as_ref(),
            client.key().as_ref(),
            agent_reputation.feedback_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub feedback: Account<'info, Feedback>,
    
    #[account(
        mut,
        seeds = [b"escrow_vault", task.task_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = fee_token_account.owner == protocol_state.fee_wallet
    )]
    pub fee_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = agent_token_account.owner == agent_identity.wallet || agent_token_account.owner == agent_identity.authority
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DisputeTask<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.client == client.key()
    )]
    pub task: Account<'info, Task>,
}

#[derive(Accounts)]
pub struct CompleteTask<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.client == client.key()
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"protocol_state"],
        bump
    )]
    pub protocol_state: Account<'info, ProtocolState>,
    
    #[account(
        mut,
        constraint = agent_identity.agent_id == task.agent_id
    )]
    pub agent_identity: Account<'info, AgentIdentity>,
    
    #[account(
        init_if_needed,
        payer = client,
        space = 8 + AgentReputation::SIZE,
        seeds = [b"reputation", task.agent_id.to_le_bytes().as_ref()],
        bump
    )]
    pub agent_reputation: Account<'info, AgentReputation>,
    
    #[account(
        init,
        payer = client,
        space = 8 + Feedback::MAX_SIZE,
        seeds = [
            b"feedback",
            task.agent_id.to_le_bytes().as_ref(),
            client.key().as_ref(),
            agent_reputation.feedback_count.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub feedback: Account<'info, Feedback>,
    
    #[account(
        mut,
        seeds = [b"escrow_vault", task.task_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = fee_token_account.owner == protocol_state.fee_wallet
    )]
    pub fee_token_account: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = agent_token_account.owner == agent_identity.wallet || agent_token_account.owner == agent_identity.authority
    )]
    pub agent_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelTask<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.client == client.key()
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"escrow_vault", task.task_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = client_token_account.owner == client.key()
    )]
    pub client_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReclaimExpired<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    
    #[account(
        mut,
        constraint = task.client == client.key()
    )]
    pub task: Account<'info, Task>,
    
    #[account(
        mut,
        seeds = [b"escrow_vault", task.task_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub escrow_vault: Account<'info, TokenAccount>,
    
    #[account(
        mut,
        constraint = client_token_account.owner == client.key()
    )]
    pub client_token_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateProtocolState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    
    #[account(
        mut,
        constraint = protocol_state.authority == authority.key()
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

// ==================== DATA STRUCTURES ====================

#[account]
pub struct AgentCounter {
    pub count: u64,
}

#[account]
pub struct TaskCounter {
    pub count: u64,
}

#[account]
pub struct ProtocolState {
    pub authority: Pubkey,
    pub fee_wallet: Pubkey,
    pub total_fees_collected: u64,
}

impl ProtocolState {
    pub const SIZE: usize = 32 + 32 + 8;
}

#[account]
pub struct AgentIdentity {
    pub agent_id: u64,
    pub authority: Pubkey,
    pub agent_uri: String,
    pub metadata: Vec<(String, String)>,
    pub wallet: Pubkey,
    pub active: bool,
    pub created_at: i64,
}

impl AgentIdentity {
    pub const MAX_SIZE: usize = 8 + 32 + (4 + 200) + (4 + 20 * (4 + 50 + 4 + 200)) + 32 + 1 + 8;
}

#[account]
pub struct AgentReputation {
    pub agent_id: u64,
    pub total_feedback: u64,
    pub average_score: u64, // Scaled by 100
    pub feedback_count: u64,
}

impl AgentReputation {
    pub const SIZE: usize = 8 + 8 + 8 + 8;
}

#[account]
pub struct Feedback {
    pub agent_id: u64,
    pub client: Pubkey,
    pub value: u8,
    pub tag: String,
    pub response_uri: Option<String>,
    pub created_at: i64,
    pub index: u64,
}

impl Feedback {
    pub const MAX_SIZE: usize = 8 + 32 + 1 + (4 + 50) + (1 + 4 + 200) + 8 + 8;
}

#[account]
pub struct Task {
    pub task_id: u64,
    pub client: Pubkey,
    pub agent_id: u64,
    pub token_mint: Pubkey,
    pub amount: u64,
    pub deadline: i64,
    pub task_uri: String,
    pub status: TaskStatus,
    pub claimed_by: Option<Pubkey>,
    pub escrow_vault: Pubkey,
    pub submitted_at: i64,
    pub dispute_reason: Option<String>,
}

impl Task {
    pub const MAX_SIZE: usize = 8 + 32 + 8 + 32 + 8 + 8 + (4 + 200) + 1 + (1 + 32) + 32 + 8 + (1 + 4 + 200);
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Open,
    Claimed,
    Submitted,
    Completed,
    Cancelled,
    Expired,
    Disputed,
}

// ==================== ERROR CODES ====================

#[error_code]
pub enum ErrorCode {
    #[msg("URI too long")]
    UriTooLong,
    #[msg("Too many metadata entries")]
    TooManyMetadata,
    #[msg("Reserved metadata key")]
    ReservedMetadataKey,
    #[msg("Key too long")]
    KeyTooLong,
    #[msg("Value too long")]
    ValueTooLong,
    #[msg("Invalid feedback value (must be 1-5)")]
    InvalidFeedbackValue,
    #[msg("Tag too long")]
    TagTooLong,
    #[msg("Self feedback not allowed")]
    SelfFeedbackNotAllowed,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid deadline")]
    InvalidDeadline,
    #[msg("Task not open")]
    TaskNotOpen,
    #[msg("Task not claimed")]
    TaskNotClaimed,
    #[msg("Task not submitted")]
    TaskNotSubmitted,
    #[msg("Wrong agent claim")]
    WrongAgentClaim,
    #[msg("Unauthorized claim")]
    UnauthorizedClaim,
    #[msg("Unauthorized submission")]
    UnauthorizedSubmission,
    #[msg("Unauthorized completion")]
    UnauthorizedCompletion,
    #[msg("Unauthorized cancellation")]
    UnauthorizedCancellation,
    #[msg("Unauthorized reclaim")]
    UnauthorizedReclaim,
    #[msg("Task not expired")]
    TaskNotExpired,
    #[msg("Review window expired")]
    ReviewWindowExpired,
}
