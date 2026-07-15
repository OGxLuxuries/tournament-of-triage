/**
 * Anonymous identity: a random session id persisted in localStorage. It is
 * the player's credential for every mutation, so it never appears in URLs.
 */
const KEY = "bitpoint.sessionId";

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function getSessionId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): fall back to a per-load identity.
    return randomId();
  }
}
