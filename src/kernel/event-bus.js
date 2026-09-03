"use strict";

function eventName(value) {
  const name = String(value || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,63}:[a-z][a-z0-9-]{1,63}$/.test(name)) {
    throw new TypeError("event name must use a namespace:event contract");
  }
  return name;
}

function createEventBus() {
  const listeners = new Map();

  function subscribe(nameValue, listener) {
    const name = eventName(nameValue);
    if (typeof listener !== "function") throw new TypeError("event listener must be a function");
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(listener);
    let active = true;
    return () => {
      if (!active) return false;
      active = false;
      const bucket = listeners.get(name);
      const removed = Boolean(bucket?.delete(listener));
      if (bucket && !bucket.size) listeners.delete(name);
      return removed;
    };
  }

  async function publish(nameValue, payload = {}) {
    const name = eventName(nameValue);
    const event = Object.freeze({ name, payload, occurredAt: new Date().toISOString() });
    const outcomes = [];
    for (const listener of [...(listeners.get(name) || [])]) {
      try {
        outcomes.push(Object.freeze({ status: "fulfilled", value: await listener(event) }));
      } catch (_error) {
        outcomes.push(Object.freeze({ status: "rejected" }));
      }
    }
    return Object.freeze({ event, outcomes: Object.freeze(outcomes) });
  }

  return Object.freeze({ subscribe, publish });
}

module.exports = { createEventBus, eventName };
