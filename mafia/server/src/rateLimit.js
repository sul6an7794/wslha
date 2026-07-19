function createSocketLimiter({ windowMs = 10000, max = 20 } = {}) {
  const hits = new Map();

  return function allow(socketId) {
    const now = Date.now();
    const entry = hits.get(socketId);
    if (!entry || now - entry.windowStart > windowMs) {
      hits.set(socketId, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

function cleanup(limiterMap, socketId) {
  limiterMap.delete(socketId);
}

module.exports = { createSocketLimiter, cleanup };
