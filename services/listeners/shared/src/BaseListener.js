"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseListener = void 0;
class BaseListener {
    config;
    isRunning = false;
    constructor(config) {
        this.config = config;
    }
    async handleEvent(event) {
        if (event.confirmations >= this.config.confirmationsRequired) {
            await this.config.onPayment(event);
        }
    }
    async convertToUSD(symbol, amount) {
        // Placeholder - would use CoinGecko API or similar
        const prices = {
            ETH: 2000,
            USDC: 1,
            USDT: 1,
            WETH: 2000,
            STX: 1.5,
            SOL: 100,
            BTC: 40000,
        };
        return parseFloat(amount) * (prices[symbol] || 0);
    }
}
exports.BaseListener = BaseListener;
//# sourceMappingURL=BaseListener.js.map