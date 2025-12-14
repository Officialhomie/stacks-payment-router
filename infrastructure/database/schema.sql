-- Payment Router Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Agents table
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stacks_address VARCHAR(255) UNIQUE NOT NULL,
    agent_id VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    enabled_chains JSONB NOT NULL DEFAULT '[]',
    min_payment_amount DECIMAL(20, 8) DEFAULT 0,
    auto_withdraw BOOLEAN DEFAULT false,
    settlement_preference VARCHAR(20) DEFAULT 'usdh',
    total_volume_usd DECIMAL(20, 2) DEFAULT 0,
    total_payments INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_agents_stacks_address ON agents(stacks_address);
CREATE INDEX idx_agents_agent_id ON agents(agent_id);
CREATE INDEX idx_agents_status ON agents(status);

-- Agent payment addresses table
CREATE TABLE agent_payment_addresses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    chain VARCHAR(20) NOT NULL,
    address VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id, chain)
);

CREATE INDEX idx_agent_payment_addresses_agent_id ON agent_payment_addresses(agent_id);
CREATE INDEX idx_agent_payment_addresses_chain ON agent_payment_addresses(chain);
CREATE INDEX idx_agent_payment_addresses_address ON agent_payment_addresses(address);

-- Payment intents table
CREATE TABLE payment_intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    intent_id VARCHAR(64) UNIQUE NOT NULL,
    source_chain VARCHAR(20) NOT NULL,
    source_token VARCHAR(50) NOT NULL,
    source_token_address VARCHAR(255),
    amount DECIMAL(20, 8) NOT NULL,
    amount_usd DECIMAL(20, 2) NOT NULL,
    destination_token VARCHAR(50) DEFAULT 'USDh',
    status VARCHAR(20) DEFAULT 'pending',
    payment_address VARCHAR(255) NOT NULL,
    quote_id UUID,
    route_id UUID,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_payment_intents_intent_id ON payment_intents(intent_id);
CREATE INDEX idx_payment_intents_agent_id ON payment_intents(agent_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);
CREATE INDEX idx_payment_intents_payment_address ON payment_intents(payment_address);
CREATE INDEX idx_payment_intents_created_at ON payment_intents(created_at);

-- Payment events (detected payments)
CREATE TABLE payment_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    chain VARCHAR(20) NOT NULL,
    tx_hash VARCHAR(255) UNIQUE NOT NULL,
    block_number BIGINT,
    block_hash VARCHAR(255),
    from_address VARCHAR(255) NOT NULL,
    to_address VARCHAR(255) NOT NULL,
    token_address VARCHAR(255),
    amount DECIMAL(20, 8) NOT NULL,
    amount_usd DECIMAL(20, 2) NOT NULL,
    confirmed BOOLEAN DEFAULT false,
    confirmations INTEGER DEFAULT 0,
    detected_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP
);

CREATE INDEX idx_payment_events_tx_hash ON payment_events(tx_hash);
CREATE INDEX idx_payment_events_payment_intent_id ON payment_events(payment_intent_id);
CREATE INDEX idx_payment_events_confirmed ON payment_events(confirmed);

-- Routes table
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    route_type VARCHAR(20) NOT NULL,
    steps JSONB NOT NULL,
    estimated_gas_cost_usd DECIMAL(20, 2) NOT NULL,
    estimated_slippage DECIMAL(5, 4) NOT NULL,
    estimated_time_seconds INTEGER NOT NULL,
    total_cost_usd DECIMAL(20, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    executed_at TIMESTAMP,
    execution_tx_hash VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_routes_payment_intent_id ON routes(payment_intent_id);
CREATE INDEX idx_routes_status ON routes(status);

-- Settlements table
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_intent_id UUID NOT NULL REFERENCES payment_intents(id),
    agent_id UUID NOT NULL REFERENCES agents(id),
    source_amount DECIMAL(20, 8) NOT NULL,
    source_token VARCHAR(50) NOT NULL,
    usdh_amount DECIMAL(20, 8) NOT NULL,
    conversion_rate DECIMAL(20, 8) NOT NULL,
    fees_usd DECIMAL(20, 2) NOT NULL,
    gas_cost_usd DECIMAL(20, 2) NOT NULL,
    net_amount_usdh DECIMAL(20, 8) NOT NULL,
    deposited_to_vault BOOLEAN DEFAULT false,
    vault_deposit_tx_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_settlements_agent_id ON settlements(agent_id);
CREATE INDEX idx_settlements_status ON settlements(status);
CREATE INDEX idx_settlements_created_at ON settlements(created_at);

-- Agent balances (USDh vault balances)
CREATE TABLE agent_balances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id) UNIQUE,
    principal_usdh DECIMAL(20, 8) DEFAULT 0,
    accrued_yield_usdh DECIMAL(20, 8) DEFAULT 0,
    total_usdh DECIMAL(20, 8) DEFAULT 0,
    last_yield_calculation TIMESTAMP DEFAULT NOW(),
    last_deposit_at TIMESTAMP,
    last_withdrawal_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_agent_balances_agent_id ON agent_balances(agent_id);

-- Withdrawals table
CREATE TABLE withdrawals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agents(id),
    amount_usdh DECIMAL(20, 8) NOT NULL,
    principal_amount DECIMAL(20, 8) NOT NULL,
    yield_amount DECIMAL(20, 8) NOT NULL,
    tx_hash VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_withdrawals_agent_id ON withdrawals(agent_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);

-- Gas reserves tracking
CREATE TABLE gas_reserves (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chain VARCHAR(20) NOT NULL UNIQUE,
    native_token_balance DECIMAL(20, 8) NOT NULL,
    native_token_address VARCHAR(255),
    usd_value DECIMAL(20, 2) NOT NULL,
    threshold_usd DECIMAL(20, 2) NOT NULL,
    last_rebalanced_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_gas_reserves_chain ON gas_reserves(chain);

-- Transaction logs (for debugging and audit)
CREATE TABLE transaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_intent_id UUID REFERENCES payment_intents(id),
    chain VARCHAR(20) NOT NULL,
    tx_hash VARCHAR(255) NOT NULL,
    tx_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    gas_used BIGINT,
    gas_price DECIMAL(20, 8),
    gas_cost_usd DECIMAL(20, 2),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP
);

CREATE INDEX idx_transaction_logs_tx_hash ON transaction_logs(tx_hash);
CREATE INDEX idx_transaction_logs_payment_intent_id ON transaction_logs(payment_intent_id);
CREATE INDEX idx_transaction_logs_status ON transaction_logs(status);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_balances_updated_at BEFORE UPDATE ON agent_balances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gas_reserves_updated_at BEFORE UPDATE ON gas_reserves
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

