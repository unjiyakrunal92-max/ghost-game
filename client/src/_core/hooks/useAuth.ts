import { useState, useEffect, useCallback } from "react";
import type { User } from "../../../../server/models";
import { API_BASE } from "@/const";

type AuthState = {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
};

/**
 * Client-side auth hook that checks login status via /api/auth/me
 * and provides login/logout helpers.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) {
          setState({ user: null, loading: false, isAuthenticated: false });
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setState({
            user: data.user ?? null,
            loading: false,
            isAuthenticated: !!data.user,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ user: null, loading: false, isAuthenticated: false });
        }
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    setState({ user: null, loading: false, isAuthenticated: false });
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    isAuthenticated: state.isAuthenticated,
    logout,
  };
}
