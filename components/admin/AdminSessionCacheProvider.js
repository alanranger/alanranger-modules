import { createContext, useContext, useMemo, useRef } from "react";
import {
  DEFAULT_TTL_MS,
  ghostCacheKey,
  membersCacheKey,
  readSessionEntry,
  writeSessionEntry,
} from "../../lib/admin-session-cache";

const AdminSessionCacheContext = createContext(null);

function loadInitialMem() {
  if (typeof window === "undefined") {
    return { ghost: null, members: {} };
  }
  return {
    ghost: readSessionEntry(ghostCacheKey()),
    members: {},
  };
}

export function AdminSessionCacheProvider({ children }) {
  const mem = useRef(loadInitialMem());

  const api = useMemo(
    () => ({
      getGhost() {
        if (mem.current.ghost) return mem.current.ghost;
        let cached = readSessionEntry(ghostCacheKey());
        if (!cached) {
          try {
            const raw = sessionStorage.getItem("ar-admin-ghost-members-v1");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed?.members)) cached = parsed.members;
            }
          } catch {
            /* ignore legacy read */
          }
        }
        mem.current.ghost = cached;
        return cached;
      },
      setGhost(members) {
        mem.current.ghost = members;
        writeSessionEntry(ghostCacheKey(), members);
      },
      getMembers(paramsKey) {
        if (mem.current.members[paramsKey]) {
          return mem.current.members[paramsKey];
        }
        const cached = readSessionEntry(membersCacheKey(paramsKey));
        if (cached) mem.current.members[paramsKey] = cached;
        return cached;
      },
      setMembers(paramsKey, payload) {
        mem.current.members[paramsKey] = payload;
        writeSessionEntry(membersCacheKey(paramsKey), payload);
      },
      ttlMs: DEFAULT_TTL_MS,
    }),
    []
  );

  return (
    <AdminSessionCacheContext.Provider value={api}>
      {children}
    </AdminSessionCacheContext.Provider>
  );
}

export function useAdminSessionCache() {
  return useContext(AdminSessionCacheContext);
}
