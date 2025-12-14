import { BaseListener, ListenerConfig } from '../../shared/src/BaseListener';
export declare class StacksListener extends BaseListener {
    private lastProcessedBlock;
    private pollingInterval?;
    private apiUrl;
    constructor(config: ListenerConfig);
    start(): Promise<void>;
    stop(): Promise<void>;
    private pollBlocks;
    processBlock(blockNumber: number): Promise<void>;
}
//# sourceMappingURL=StacksListener.d.ts.map