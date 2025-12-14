export declare const CHAIN_CONFIGS: {
    readonly ethereum: {
        readonly chainId: 1;
        readonly name: "Ethereum";
        readonly nativeToken: "ETH";
        readonly rpcUrl: string;
        readonly blockTime: 12;
        readonly confirmationsRequired: 12;
    };
    readonly arbitrum: {
        readonly chainId: 42161;
        readonly name: "Arbitrum";
        readonly nativeToken: "ETH";
        readonly rpcUrl: string;
        readonly blockTime: 1;
        readonly confirmationsRequired: 1;
    };
    readonly base: {
        readonly chainId: 8453;
        readonly name: "Base";
        readonly nativeToken: "ETH";
        readonly rpcUrl: string;
        readonly blockTime: 2;
        readonly confirmationsRequired: 1;
    };
    readonly polygon: {
        readonly chainId: 137;
        readonly name: "Polygon";
        readonly nativeToken: "MATIC";
        readonly rpcUrl: string;
        readonly blockTime: 2;
        readonly confirmationsRequired: 1;
    };
    readonly optimism: {
        readonly chainId: 10;
        readonly name: "Optimism";
        readonly nativeToken: "ETH";
        readonly rpcUrl: string;
        readonly blockTime: 2;
        readonly confirmationsRequired: 1;
    };
    readonly stacks: {
        readonly chainId: 1;
        readonly name: "Stacks";
        readonly nativeToken: "STX";
        readonly rpcUrl: string;
        readonly blockTime: 600;
        readonly confirmationsRequired: 1;
    };
    readonly solana: {
        readonly chainId: 101;
        readonly name: "Solana";
        readonly nativeToken: "SOL";
        readonly rpcUrl: string;
        readonly blockTime: 0.4;
        readonly confirmationsRequired: 32;
    };
    readonly bitcoin: {
        readonly chainId: 0;
        readonly name: "Bitcoin";
        readonly nativeToken: "BTC";
        readonly rpcUrl: string;
        readonly blockTime: 600;
        readonly confirmationsRequired: 6;
    };
};
export declare const TOKEN_ADDRESSES: {
    readonly ethereum: {
        readonly USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
        readonly USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7";
        readonly WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
    };
    readonly arbitrum: {
        readonly USDC: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8";
        readonly USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
        readonly WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    };
    readonly base: {
        readonly USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        readonly WETH: "0x4200000000000000000000000000000000000006";
    };
};
export declare const CONFIRMATIONS_REQUIRED: {
    readonly ethereum: 12;
    readonly arbitrum: 1;
    readonly base: 1;
    readonly polygon: 1;
    readonly optimism: 1;
    readonly stacks: 1;
    readonly solana: 32;
    readonly bitcoin: 6;
};
//# sourceMappingURL=chains.d.ts.map