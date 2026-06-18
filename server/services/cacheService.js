// ============================================================
// Multi-Tier Caching Service
// ============================================================

const redis = require('redis');
const { logger } = require('./logging/logger');

let redisClient = null;
const memoryCache = new Map();

// Initialize Redis if configured, else fallback to memory
async function initCache() {
  if (process.env.REDIS_URL) {
    try {
      redisClient = redis.createClient({ url: process.env.REDIS_URL });
      redisClient.on('error', (err) => logger.warn('Redis Client Error', err));
      await redisClient.connect();
      logger.info('Connected to Redis cache');
    } catch (err) {
      logger.warn('Failed to connect to Redis. Falling back to in-memory cache.', err.message);
      redisClient = null;
    }
  } else {
    logger.info('REDIS_URL not set. Using in-memory cache for performance optimizations.');
  }
}

initCache();

/**
 * Get value from cache
 */
async function getCache(key) {
  if (redisClient) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  } else {
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      memoryCache.delete(key);
      return null;
    }
    return entry.value;
  }
}

/**
 * Set value in cache
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlSeconds 
 */
async function setCache(key, value, ttlSeconds = 60) {
  if (redisClient) {
    try {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (e) {
      // ignore
    }
  } else {
    memoryCache.set(key, {
      value,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }
}

/**
 * Clear cache key
 */
async function clearCache(key) {
  if (redisClient) {
    try {
      await redisClient.del(key);
    } catch (e) {}
  } else {
    memoryCache.delete(key);
  }
}

module.exports = {
  getCache,
  setCache,
  clearCache
};
