const LRUCache = require("./cache");

(async () => {
  // Initialize cache with max size of 1000 and default TTL of 5 seconds
  const cache = new LRUCache(1000, 5);

  // Insert a key-value pair with default TTL
  await cache.put("config:db_host", "localhost:5432");

  // Insert a key-value pair with custom TTL (60 seconds)
  await cache.put("config:api_key", "abc123", 60);

  // Retrieve an existing key (should return "localhost:5432")
  console.log(await cache.get("config:db_host"));

  // Retrieve a non-existent key (should return null)
  console.log(await cache.get("missing_key"));

  // Insert a temporary value that expires in 2 seconds
  await cache.put("temp_data", "expires_soon", 2);

  // Wait for 3 seconds and then attempt to fetch the expired key
  setTimeout(async () => {
    // Should return null due to expiry
    console.log(await cache.get("temp_data"));
  }, 3000);

  // Insert 1200 items to trigger LRU eviction (limit is 1000)
  for (let i = 0; i < 1200; i++) {
    await cache.put(`data:${i}`, `value_${i}`);
  }

  // Display cache statistics (hits, misses, evictions, etc.)
  console.log("Stats:", cache.getStats());

  // Shutdown background cleanup interval to exit cleanly
  cache.shutdown();
})();
