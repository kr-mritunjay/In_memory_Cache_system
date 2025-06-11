const { Mutex } = require("async-mutex");

// Represents a single cache node in the doubly linked list
class CacheNode {
  constructor(key, value, expiryTime = null) {
    this.key = key;
    this.value = value;
    this.expiryTime = expiryTime; // Unix timestamp
    this.prev = null;
    this.next = null;
  }

  // Check if the node has expired based on TTL
  isExpired() {
    return this.expiryTime !== null && Date.now() > this.expiryTime;
  }
}

// Thread-safe LRU Cache with TTL and statistics tracking
class LRUCache {
  constructor(maxSize = 1000, defaultTTL = 300000) {
    this.cache = new Map(); // Maps key to CacheNode
    this.head = null; // Most recently used
    this.tail = null; // Least recently used
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL;

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired_removals: 0,
      total_requests: 0,
    };

    this.lock = new Mutex(); // Ensures thread-safety

    // Background cleanup of expired items every second
    this.cleanupInterval = setInterval(() => this.cleanupExpired(), 1000);
  }

  // Insert or update a key-value pair with optional TTL
  async put(key, value, ttl = this.defaultTTL) {
    const release = await this.lock.acquire();
    try {
      if (this.cache.has(key)) {
        this._removeNode(this.cache.get(key)); // Remove old node
      }

      const expiry = ttl ? Date.now() + ttl * 1000 : null;
      const newNode = new CacheNode(key, value, expiry);
      this._addNodeToFront(newNode); // Mark as most recently used
      this.cache.set(key, newNode);

      // Evict least recently used if over capacity
      if (this.cache.size > this.maxSize) {
        this._evictLRU();
      }
    } finally {
      release();
    }
  }

  // Retrieve a value by key if present and not expired
  async get(key) {
    const release = await this.lock.acquire();
    try {
      this.stats.total_requests++;
      const node = this.cache.get(key);
      if (!node) {
        this.stats.misses++;
        return null;
      }
      if (node.isExpired()) {
        this._removeNode(node);
        this.cache.delete(key);
        this.stats.expired_removals++;
        this.stats.misses++;
        return null;
      }
      this._moveToFront(node); // Mark as recently used
      this.stats.hits++;
      return node.value;
    } finally {
      release();
    }
  }

  // Remove a key from the cache
  async delete(key) {
    const release = await this.lock.acquire();
    try {
      if (this.cache.has(key)) {
        const node = this.cache.get(key);
        this._removeNode(node);
        this.cache.delete(key);
      }
    } finally {
      release();
    }
  }

  // Clear the entire cache
  async clear() {
    const release = await this.lock.acquire();
    try {
      this.cache.clear();
      this.head = this.tail = null;
    } finally {
      release();
    }
  }

  // Return current stats including hit rate and size
  getStats() {
    return {
      ...this.stats,
      hit_rate: this.stats.total_requests
        ? this.stats.hits / this.stats.total_requests
        : 0,
      current_size: this.cache.size,
    };
  }

  // Add node to the front (MRU)
  _addNodeToFront(node) {
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  // Move accessed node to the front
  _moveToFront(node) {
    this._removeNode(node);
    this._addNodeToFront(node);
  }

  // Remove node from the list
  _removeNode(node) {
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.head) this.head = node.next;
    if (node === this.tail) this.tail = node.prev;
    node.next = node.prev = null;
  }

  // Evict least recently used (tail) node
  _evictLRU() {
    if (this.tail) {
      const node = this.tail;
      this._removeNode(node);
      this.cache.delete(node.key);
      this.stats.evictions++;
    }
  }

  // Cleanup expired items in the cache
  cleanupExpired() {
    for (const [key, node] of this.cache) {
      if (node.isExpired()) {
        this._removeNode(node);
        this.cache.delete(key);
        this.stats.expired_removals++;
      }
    }
  }

  // Stop the background cleanup process
  shutdown() {
    clearInterval(this.cleanupInterval);
  }
}

module.exports = LRUCache;
