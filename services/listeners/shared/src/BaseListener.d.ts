import { ChainEvent } from '@shared/types';
export interface ListenerConfig {
    chain: string;
    rpcUrl: string;
    addresses: string[];
    confirmationsRequired: number;
    onPayment: (event: ChainEvent) => Promise<void>;
}
export declare abstract class BaseListener {
    protected config: ListenerConfig;
    protected isRunning: boolean;
    constructor(config: ListenerConfig);
    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
    abstract processBlock(blockNumber: number): Promise<void>;
    protected handleEvent(event: ChainEvent): Promise<void>;
    protected convertToUSD(symbol: string, amount: string): Promise<number>;
}
//# sourceMappingURL=BaseListener.d.ts.map