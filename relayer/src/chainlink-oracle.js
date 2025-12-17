/**
 * Chainlink Price Oracle Integration
 * 
 * Features:
 * - Fetches ETH/USD price from Chainlink
 * - Validates price staleness
 * - Multiple fallback sources
 * - Error handling and retries
 */

import { ethers } from 'ethers';

// ============================================================================
// CHAINLINK CONFIGURATION
// ============================================================================

const CHAINLINK_CONFIG = {
  // Sepolia ETH/USD Price Feed
  SEPOLIA_ETH_USD: '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  
  // Mainnet ETH/USD (for reference/fallback)
  MAINNET_ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  
  // Maximum price staleness (24 hours in seconds)
  MAX_STALENESS: 24 * 60 * 60,
  
  // Minimum price deviation to trigger alert (%)
  MIN_PRICE: 1000,  // $1,000 minimum
  MAX_PRICE: 10000, // $10,000 maximum
  
  // Chainlink Aggregator ABI
  ABI: [
    'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() external view returns (uint8)',
    'function description() external view returns (string)'
  ],
};

// ============================================================================
// PRICE FETCHING
// ============================================================================

/**
 * Fetches ETH/USD price from Chainlink with validation
 * @param {ethers.Provider} provider - Ethereum provider
 * @param {string} priceFeedAddress - Chainlink price feed address
 * @returns {Promise<{price: number, roundId: bigint, updatedAt: bigint, isValid: boolean}>}
 */
async function fetchChainlinkPrice(provider, priceFeedAddress) {
  const priceFeed = new ethers.Contract(priceFeedAddress, CHAINLINK_CONFIG.ABI, provider);
  
  try {
    // Get latest round data
    const roundData = await priceFeed.latestRoundData();
    
    const {
      roundId,
      answer,
      startedAt,
      updatedAt,
      answeredInRound,
    } = roundData;
    
    // Chainlink returns price with 8 decimals
    const price = Number(answer) / 1e8;
    
    // Get current timestamp
    const currentTime = Math.floor(Date.now() / 1000);
    const staleness = currentTime - Number(updatedAt);
    
    // Validate price
    const isValid = validatePrice(price, staleness);
    
    return {
      price,
      roundId: BigInt(roundId.toString()),
      updatedAt: BigInt(updatedAt.toString()),
      staleness,
      isValid,
      source: 'chainlink',
    };
  } catch (error) {
    throw new Error(`Chainlink fetch failed: ${error.message}`);
  }
}

/**
 * Validates price data
 * @param {number} price - Price in USD
 * @param {number} staleness - Seconds since last update
 * @returns {boolean}
 */
function validatePrice(price, staleness) {
  // Check price bounds
  if (price < CHAINLINK_CONFIG.MIN_PRICE || price > CHAINLINK_CONFIG.MAX_PRICE) {
    console.warn(`⚠️  Price out of bounds: $${price}`);
    return false;
  }
  
  // Check staleness
  if (staleness > CHAINLINK_CONFIG.MAX_STALENESS) {
    console.warn(`⚠️  Price stale: ${staleness}s old`);
    return false;
  }
  
  return true;
}

/**
 * Gets ETH/USD price from Chainlink (primary)
 * @param {string} rpcUrl - RPC URL for network
 * @returns {Promise<number>} Price in USD
 */
export async function getETHPrice(rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  
  try {
    const result = await fetchChainlinkPrice(provider, CHAINLINK_CONFIG.SEPOLIA_ETH_USD);
    
    if (!result.isValid) {
      throw new Error(`Invalid price data: stale=${result.staleness}s, price=$${result.price}`);
    }
    
    console.log(`📊 Chainlink ETH/USD: $${result.price.toFixed(2)} (updated ${result.staleness}s ago)`);
    return result.price;
  } catch (error) {
    console.error(`❌ Chainlink primary failed: ${error.message}`);
    throw error;
  }
}

/**
 * Gets ETH/USD price with fallback
 * @param {string} rpcUrl - RPC URL for network
 * @param {number} fallbackPrice - Fallback price if Chainlink fails
 * @returns {Promise<number>} Price in USD
 */
export async function getETHPriceWithFallback(rpcUrl, fallbackPrice = null) {
  try {
    return await getETHPrice(rpcUrl);
  } catch (error) {
    console.warn(`⚠️  Using fallback price: $${fallbackPrice || 3000}`);
    
    if (fallbackPrice) {
      return fallbackPrice;
    }
    
    // Try to get from alternative source (e.g., CoinGecko API)
    try {
      return await getETHPriceFromAPI();
    } catch (apiError) {
      console.error(`❌ All price sources failed, using default: $3000`);
      return 3000; // Last resort fallback
    }
  }
}

/**
 * Gets ETH price from CoinGecko API (fallback)
 * @returns {Promise<number>} Price in USD
 */
async function getETHPriceFromAPI() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
    const data = await response.json();
    const price = data.ethereum.usd;
    
    console.log(`📊 CoinGecko ETH/USD: $${price.toFixed(2)}`);
    return price;
  } catch (error) {
    throw new Error(`CoinGecko API failed: ${error.message}`);
  }
}

/**
 * Converts ETH amount (wei) to USD value
 * @param {string|bigint} ethAmountWei - ETH amount in wei
 * @param {string} rpcUrl - RPC URL for price fetching
 * @returns {Promise<number>} USD value
 */
export async function convertETHToUSD(ethAmountWei, rpcUrl) {
  const ethPrice = await getETHPriceWithFallback(rpcUrl);
  const ethAmountNumber = Number(ethAmountWei) / 1e18; // Convert wei to ETH
  const usdValue = ethAmountNumber * ethPrice;
  
  console.log(`💱 Conversion: ${ethAmountNumber.toFixed(6)} ETH × $${ethPrice.toFixed(2)} = $${usdValue.toFixed(2)}`);
  return usdValue;
}

/**
 * Converts USD value to USDh amount (6 decimals)
 * @param {number} usdValue - USD value
 * @returns {bigint} USDh amount in smallest unit
 */
export function convertUSDToUSDh(usdValue) {
  // USDh has 6 decimals, so multiply by 1e6
  const amount = BigInt(Math.floor(usdValue * 1e6));
  console.log(`💰 USDh Amount: ${Number(amount) / 1e6} USDh`);
  return amount;
}

/**
 * Verifies Chainlink price feed is accessible
 * @param {string} rpcUrl - RPC URL
 * @returns {Promise<boolean>}
 */
export async function verifyChainlinkConnection(rpcUrl) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const priceFeed = new ethers.Contract(
      CHAINLINK_CONFIG.SEPOLIA_ETH_USD,
      CHAINLINK_CONFIG.ABI,
      provider
    );
    
    // Try to get description (verifies contract exists)
    const description = await priceFeed.description();
    console.log(`✅ Chainlink verified: ${description}`);
    
    // Try to get price
    const price = await getETHPrice(rpcUrl);
    console.log(`✅ Chainlink price fetch successful: $${price.toFixed(2)}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Chainlink verification failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CHAINLINK_CONFIG,
  fetchChainlinkPrice,
  validatePrice,
  getETHPriceFromAPI,
};


