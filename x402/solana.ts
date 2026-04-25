import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddress, getAccount } from "@solana/spl-token";

/**
 * x402 Payment Facilitator for Solana
 * 
 * Handles verification and settlement of x402 payments on Solana.
 * This is a simplified implementation for the Colosseum hackathon.
 */

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  token: string;
  resource: string;
  description: string;
  deadline: number;
}

export interface PaymentPayload {
  scheme: string;
  network: string;
  amount: string;
  token: string;
  payer: string;
  nonce: string;
  signature: string;
  timestamp: number;
}

export class SolanaFacilitator {
  private connection: Connection;
  private acceptedTokens: Map<string, PublicKey>;

  constructor(rpcUrl: string = "https://api.devnet.solana.com") {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.acceptedTokens = new Map([
      ["USDC", new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")], // Devnet USDC
      ["SOL", new PublicKey("So11111111111111111111111111111111111111112")],
    ]);
  }

  /**
   * Verify a payment payload without settling it
   */
  async verifyPayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check scheme compatibility
      if (payload.scheme !== requirements.scheme) {
        return { valid: false, error: "Incompatible payment scheme" };
      }

      // Check network
      if (payload.network !== requirements.network) {
        return { valid: false, error: "Incompatible network" };
      }

      // Check token
      if (payload.token !== requirements.token) {
        return { valid: false, error: "Incompatible token" };
      }

      // Check amount
      const requiredAmount = BigInt(requirements.amount);
      const paidAmount = BigInt(payload.amount);
      if (paidAmount < requiredAmount) {
        return { valid: false, error: "Insufficient payment amount" };
      }

      // Check timestamp/deadline
      if (Date.now() > requirements.deadline) {
        return { valid: false, error: "Payment deadline expired" };
      }

      // Verify signature (simplified - in production, verify Ed25519 signature)
      // For hackathon demo, we assume the signature is valid if it's the right format
      if (!payload.signature || payload.signature.length < 64) {
        return { valid: false, error: "Invalid signature format" };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: `Verification error: ${error}` };
    }
  }

  /**
   * Settle a payment by executing the token transfer on Solana
   * In a real implementation, this would submit the signed transaction
   */
  async settlePayment(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    recipient: PublicKey
  ): Promise<{ success: boolean; txSignature?: string; error?: string }> {
    try {
      const verification = await this.verifyPayment(payload, requirements);
      if (!verification.valid) {
        return { success: false, error: verification.error };
      }

      // In a production implementation, we would:
      // 1. Deserialize the signed transaction from the payload
      // 2. Submit it to the Solana network
      // 3. Wait for confirmation
      // 4. Return the transaction signature

      // For the hackathon demo, we return a mock success
      return {
        success: true,
        txSignature: `mock_tx_${Date.now()}_${payload.nonce}`,
      };
    } catch (error) {
      return { success: false, error: `Settlement error: ${error}` };
    }
  }

  /**
   * Create payment requirements for a resource
   */
  createRequirements(
    amount: string,
    token: string = "USDC",
    resource: string = "/",
    description: string = "API Access",
    expiresInSeconds: number = 300
  ): PaymentRequirements {
    const tokenMint = this.acceptedTokens.get(token);
    if (!tokenMint) {
      throw new Error(`Unsupported token: ${token}`);
    }

    return {
      scheme: "exact",
      network: "solana:devnet",
      amount,
      token: tokenMint.toBase58(),
      resource,
      description,
      deadline: Date.now() + expiresInSeconds * 1000,
    };
  }
}

/**
 * x402 Payment Middleware for Express
 */
export function paymentMiddleware(
  facilitator: SolanaFacilitator,
  priceMap: Record<string, { amount: string; token: string; description: string }>
) {
  return async (req: any, res: any, next: any) => {
    const route = `${req.method} ${req.path}`;
    const pricing = priceMap[route];

    if (!pricing) {
      return next(); // No payment required for this route
    }

    const paymentHeader = req.headers["x-payment"];
    
    if (!paymentHeader) {
      // Return 402 Payment Required
      const requirements = facilitator.createRequirements(
        pricing.amount,
        pricing.token,
        route,
        pricing.description
      );
      
      return res.status(402).json({
        error: "Payment Required",
        requirements,
      });
    }

    try {
      const payload: PaymentPayload = JSON.parse(
        Buffer.from(paymentHeader, "base64").toString("utf-8")
      );

      const requirements = facilitator.createRequirements(
        pricing.amount,
        pricing.token,
        route,
        pricing.description
      );

      const result = await facilitator.verifyPayment(payload, requirements);
      
      if (!result.valid) {
        return res.status(402).json({
          error: "Payment verification failed",
          details: result.error,
        });
      }

      // Payment verified, proceed
      req.paymentPayload = payload;
      next();
    } catch (error) {
      return res.status(400).json({
        error: "Invalid payment header",
        details: `${error}`,
      });
    }
  };
}

/**
 * Create a payment payload client-side
 */
export async function createPaymentPayload(
  wallet: any, // Solana wallet adapter
  amount: string,
  token: string,
  network: string = "solana:devnet",
  scheme: string = "exact"
): Promise<PaymentPayload> {
  const timestamp = Date.now();
  const nonce = `${timestamp}_${Math.random().toString(36).substring(2, 15)}`;
  
  // In production, this would sign the payment intent with the wallet
  // For demo, we create a mock signature
  const message = `${scheme}:${network}:${amount}:${token}:${nonce}:${timestamp}`;
  
  let signature: string;
  if (wallet.signMessage) {
    const messageBytes = new TextEncoder().encode(message);
    const signed = await wallet.signMessage(messageBytes);
    signature = Buffer.from(signed).toString("base64");
  } else {
    signature = Buffer.from(message).toString("base64");
  }

  return {
    scheme,
    network,
    amount,
    token,
    payer: wallet.publicKey?.toBase58() || "",
    nonce,
    signature,
    timestamp,
  };
}

export function encodePaymentPayload(payload: PaymentPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
