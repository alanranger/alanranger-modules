/**
 * Pure guards for /api/exams/whoami call policy (shared by tests + docs).
 * Squarespace snippets mirror this logic inline (cannot import modules).
 */
function hasWhoamiAuthEvidence({ memberId, bearerToken } = {}) {
  const id = memberId != null ? String(memberId).trim() : "";
  const token = bearerToken != null ? String(bearerToken).trim() : "";
  return !!(id || token);
}

function shouldAttemptWhoami({
  memberId,
  bearerToken,
  negativeCached = false,
  identityResolved = false
} = {}) {
  if (identityResolved) return false;
  if (negativeCached) return false;
  return hasWhoamiAuthEvidence({ memberId, bearerToken });
}

function createWhoamiClientGate() {
  let inFlight = null;
  let identityResolved = false;
  let negativeCached = false;
  let callCount = 0;

  function markResolvedLoggedOut() {
    identityResolved = true;
    negativeCached = true;
  }

  function markResolvedLoggedIn() {
    identityResolved = true;
    negativeCached = false;
  }

  async function runOnce(fetcher, auth) {
    if (identityResolved && negativeCached) return null;
    if (!shouldAttemptWhoami({
      memberId: auth && auth.memberId,
      bearerToken: auth && auth.bearerToken,
      negativeCached,
      identityResolved: false
    })) {
      markResolvedLoggedOut();
      return null;
    }
    if (inFlight) return inFlight;
    inFlight = (async () => {
      callCount += 1;
      try {
        const result = await fetcher(auth);
        if (result && result.memberstack_id) {
          markResolvedLoggedIn();
          return result;
        }
        markResolvedLoggedOut();
        return null;
      } catch (e) {
        markResolvedLoggedOut();
        return null;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  return {
    runOnce,
    markResolvedLoggedOut,
    markResolvedLoggedIn,
    shouldKick: () => !identityResolved,
    getCallCount: () => callCount,
    isNegativeCached: () => negativeCached,
    isResolved: () => identityResolved
  };
}

function requestHasAuthEvidence(req) {
  const headers = (req && req.headers) || {};
  const auth = headers.authorization || headers.Authorization || "";
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const memberId = headers["x-memberstack-id"]
    || headers["x-memberstackid"]
    || headers["X-Memberstack-Id"]
    || "";
  const cookieHeader = headers.cookie || headers.Cookie || "";
  const hasMsCookie = typeof cookieHeader === "string" && /(^|;\s*)_ms-mid=/.test(cookieHeader);
  return !!(bearer || String(memberId).trim() || hasMsCookie);
}

module.exports = {
  hasWhoamiAuthEvidence,
  shouldAttemptWhoami,
  createWhoamiClientGate,
  requestHasAuthEvidence
};
