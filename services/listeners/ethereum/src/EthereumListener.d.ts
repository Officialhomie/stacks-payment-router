import { BaseListener, ListenerConfig } from '../../shared/src/BaseListener';
export declare class EthereumListener extends BaseListener {
    private provider;
    private contracts;
    private lastProcessedBlock;
    private pollingInterval?;
    constructor(config: ListenerConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private setupContractListeners;
    private handleTransfer;
    private pollBlocks;
    processBlock(blockNumber: number): Promise<void>;
}
//# sourceMappingURL=EthereumListener.d.ts.map