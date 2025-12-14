"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIRMATIONS_REQUIRED = exports.TOKEN_ADDRESSES = exports.CHAIN_CONFIGS = void 0;
exports.CHAIN_CONFIGS = {
    ethereum: {
        chainId: 1,
        name: 'Ethereum',
        nativeToken: 'ETH',
        rpcUrl: process.env.ETH_RPC_URL || '',
        blockTime: 12, // seconds
        confirmationsRequired: 12,
    },
    arbitrum: {
        chainId: 42161,
        name: 'Arbitrum',
        nativeToken: 'ETH',
        rpcUrl: process.env.ARB_RPC_URL || '',
        blockTime: 1, // seconds
        confirmationsRequired: 1,
    },
    base: {
        chainId: 8453,
        name: 'Base',
        nativeToken: 'ETH',
        rpcUrl: process.env.BASE_RPC_URL || '',
        blockTime: 2,
        confirmationsRequired: 1,
    },
    polygon: {
        chainId: 137,
        name: 'Polygon',
        nativeToken: 'MATIC',
        rpcUrl: process.env.POLYGON_RPC_URL || '',
        blockTime: 2,
        confirmationsRequired: 1,
    },
    optimism: {
        chainId: 10,
        name: 'Optimism',
        nativeToken: 'ETH',
        rpcUrl: process.env.OPTIMISM_RPC_URL || '',
        blockTime: 2,
        confirmationsRequired: 1,
    },
    stacks: {
        chainId: 1,
        name: 'Stacks',
        nativeToken: 'STX',
        rpcUrl: process.env.STACKS_RPC_URL || 'https://api.hiro.so',
        blockTime: 600, // ~10 minutes
        confirmationsRequired: 1,
    },
    solana: {
        chainId: 101,
        name: 'Solana',
        nativeToken: 'SOL',
        rpcUrl: process.env.SOL_RPC_URL || '',
        blockTime: 0.4,
        confirmationsRequired: 32,
    },
    bitcoin: {
        chainId: 0,
        name: 'Bitcoin',
        nativeToken: 'BTC',
        rpcUrl: process.env.BITCOIN_RPC_URL || '',
        blockTime: 600,
        confirmationsRequired: 6,
    },
};
exports.TOKEN_ADDRESSES = {
    ethereum: {
        USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    arbitrum: {
        USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
        USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
    base: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        WETH: '0x4200000000000000000000000000000000000006',
    },
};
exports.CONFIRMATIONS_REQUIRED = {
    ethereum: 12,
    arbitrum: 1,
    base: 1,
    polygon: 1,
    optimism: 1,
    stacks: 1,
    solana: 32,
    bitcoin: 6,
};
//# sourceMappingURL=chains.js.map