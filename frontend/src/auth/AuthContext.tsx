import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { liffService, LiffInitResult } from '../lib/liff/liff';

export interface UserGrant {
  id: string;
  role: string;
  scopes: string[];
  childId: string;
  childAlias?: string;
}

export interface UserProfile {
  id: string;
  status: string;
  oaFriendshipStatus?: string | null;
  createdAt: string;
  grants: UserGrant[];
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  liffStatus: LiffInitResult | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [liffStatus, setLiffStatus] = useState<LiffInitResult | null>(null);

  const fetchMe = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const exchangeIdTokenForSession = async (idToken: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/line-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Session creation failed: HTTP ${res.status}`);
      }

      // Session cookie is now set by server; fetch /api/me
      return await fetchMe();
    } catch (err: any) {
      setError(err.message || 'Failed to exchange token with backend');
      return false;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      setLoading(true);
      setError(null);

      // Let LIFF consume its callback URL before mounting any router.
      const status = await liffService.init();
      if (!isMounted) return;
      setLiffStatus(status);

      const hasActiveSession = await fetchMe();
      if (!isMounted) return;

      if (status.isReady && status.isLoggedIn && !hasActiveSession) {
        // Retrieve ID token in-memory and establish CareLink session
        const idToken = liffService.getIDToken();
        if (idToken) {
          await exchangeIdTokenForSession(idToken);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = () => {
    liffService.login();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      liffService.logout();
      setUser(null);
    }
  };

  const refreshMe = async () => {
    await fetchMe();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        liffStatus,
        login,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
