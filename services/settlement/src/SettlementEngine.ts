import { PaymentIntent, Settlement } from '@shared/types';
import { USDhService } from './usdh/USDhService';
import { YieldVault } from './vault/YieldVault';
import { db } from './db';
import { logger } from '@shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class SettlementEngine {
  private usdhService: USDhService;
  private yieldVault: YieldVault;

  constructor() {
    this.usdhService = new USDhService();
    this.yieldVault = new YieldVault();
  }

  async settle(paymentIntentId: string): Promise<void> {
    logger.info(`Settling payment intent: ${paymentIntentId}`);

    // Get payment intent
    const intentResult = await db.query('SELECT * FROM payment_intents WHERE id = $1', [
      paymentIntentId,
    ]);

    if (intentResult.rows.length === 0) {
      throw new Error('Payment intent not found');
    }

    const intent = intentResult.rows[0];

    // Convert to USDh
    const usdhAmount = await this.usdhService.convertToUSDh(
      intent.source_token,
      intent.amount,
      intent.source_chain
    );

    // Calculate fees
    const fees = this.calculateFees(usdhAmount);

    // Net amount after fees
    const netAmount = usdhAmount - fees;

    // Get agent settings
    const agentResult = await db.query('SELECT * FROM agents WHERE id = $1', [intent.agent_id]);
    if (agentResult.rows.length === 0) {
      throw new Error('Agent not found');
    }
    const agent = agentResult.rows[0];

    // Create settlement record
    const settlementId = uuidv4();
    await db.query(
      `INSERT INTO settlements (
        id, payment_intent_id, agent_id, source_amount, source_token,
        usdh_amount, conversion_rate, fees_usd, gas_cost_usd, net_amount_usdh, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        settlementId,
        paymentIntentId,
        intent.agent_id,
        intent.amount,
        intent.source_token,
        netAmount,
        (netAmount / parseFloat(intent.amount)).toString(),
        fees,
        0, // gas_cost_usd - would be calculated from route execution
        netAmount,
        'processing',
      ]
    );

    if (agent.auto_withdraw) {
      // Direct transfer to agent
      await this.transferToAgent(agent.stacks_address, netAmount);
    } else {
      // Deposit to yield vault
      await this.yieldVault.deposit(agent.id, netAmount);
    }

    // Update settlement status
    await db.query('UPDATE settlements SET status = $1, completed_at = NOW() WHERE id = $2', [
      'completed',
      settlementId,
    ]);

    // Update agent balance
    await this.updateAgentBalance(intent.agent_id, netAmount);

    logger.info(`Settlement completed: ${settlementId}`);
  }

  private calculateFees(amount: number): number {
    const baseFeeRate = 0.005; // 0.5%
    return amount * baseFeeRate;
  }

  private async transferToAgent(stacksAddress: string, amount: number): Promise<void> {
    // Transfer USDh directly to agent
    await this.usdhService.transferUSDh(stacksAddress, amount);
  }

  private async updateAgentBalance(agentId: string, amount: number): Promise<void> {
    await db.query(
      `UPDATE agent_balances 
       SET principal_usdh = principal_usdh + $1,
           total_usdh = principal_usdh + accrued_yield_usdh + $1,
           last_deposit_at = NOW(),
           updated_at = NOW()
       WHERE agent_id = $2`,
      [amount, agentId]
    );
  }
}

