import liff from '@line/liff';

export interface LiffInitResult {
  isReady: boolean;
  isLoggedIn: boolean;
  isInClient: boolean;
  error?: string;
}

export interface ShareResult {
  shared: boolean;
  fallbackToCopy: boolean;
  error?: string;
}

class LiffService {
  private initialized = false;
  private initialization: Promise<void> | null = null;

  async init(): Promise<LiffInitResult> {
    const rawLiffId = import.meta.env.VITE_LIFF_ID;
    if (!rawLiffId || rawLiffId === 'your_liff_id') {
      return {
        isReady: false,
        isLoggedIn: false,
        isInClient: false,
        error: 'VITE_LIFF_ID is not configured in frontend environment',
      };
    }

    const liffId = rawLiffId.replace(/^https:\/\/(?:miniapp|liff)\.line\.me\//, '').trim();

    try {
      if (!this.initialized) {
        // StrictMode and concurrent consumers must share the same SDK operation.
        // Keep a rejected promise too: failures must not trigger automatic retries.
        if (!this.initialization) {
          console.info('[CareLink] LIFF initialization started');
          this.initialization = liff.init({ liffId });
        }
        await this.initialization;
        this.initialized = true;
      }

      return {
        isReady: true,
        isLoggedIn: liff.isLoggedIn(),
        isInClient: liff.isInClient(),
      };
    } catch (err: any) {
      return {
        isReady: false,
        isLoggedIn: false,
        isInClient: false,
        error: err?.message || 'LIFF initialization failed',
      };
    }
  }

  /**
   * Retrieves raw ID token in-memory. Never stores in localStorage/sessionStorage.
   */
  getIDToken(): string | null {
    if (!this.initialized || !liff.isLoggedIn()) {
      return null;
    }
    return liff.getIDToken();
  }

  login(redirectUri?: string): void {
    if (!this.initialized || liff.isInClient() || liff.isLoggedIn()) return;
    liff.login({ redirectUri: redirectUri || window.location.href });
  }

  logout(): void {
    if (!this.initialized) return;
    if (liff.isLoggedIn()) {
      liff.logout();
    }
  }

  /**
   * Shares invitation URL using shareTargetPicker if available; otherwise requests fallback to Copy Link.
   */
  async shareInvitation(inviteUrl: string, childAlias: string): Promise<ShareResult> {
    if (!this.initialized || !liff.isLoggedIn()) {
      return { shared: false, fallbackToCopy: true };
    }

    const fullUrl = inviteUrl.startsWith('http')
      ? inviteUrl
      : `${window.location.origin}${inviteUrl}`;

    try {
      const isAvailable = liff.isApiAvailable('shareTargetPicker');
      if (!isAvailable) {
        return { shared: false, fallbackToCopy: true };
      }

      const res = await liff.shareTargetPicker([
        {
          type: 'text',
          text: `【CareLink 托育邀請】您好！請點擊以下連結接受「${childAlias}」的照護邀請：\n${fullUrl}`,
        },
      ]);

      if (res) {
        return { shared: true, fallbackToCopy: false };
      }
      return { shared: false, fallbackToCopy: true };
    } catch (err: any) {
      return {
        shared: false,
        fallbackToCopy: true,
        error: err?.message || 'shareTargetPicker failed',
      };
    }
  }

  /**
   * Prompts user to add CareLink Official Account as friend via liff.requestFriendship().
   *
   * @note Requires CareLink MINI App Channel to be linked to CareLink OA in LINE Developers Console.
   *       Does NOT assume user actually friended the OA; oa_friendship_status remains a cached indicator.
   */
  async requestOaFriendship(): Promise<{ requested: boolean; available: boolean; error?: string }> {
    if (!this.initialized || !liff.isLoggedIn()) {
      return { requested: false, available: false, error: 'User is not logged in via LIFF' };
    }

    try {
      if (typeof (liff as any).requestFriendship === 'function') {
        await (liff as any).requestFriendship();
        return { requested: true, available: true };
      }
      return { requested: false, available: false, error: 'requestFriendship API is not supported in current context' };
    } catch (err: any) {
      return {
        requested: false,
        available: false,
        error: err?.message || 'requestFriendship call failed',
      };
    }
  }
}

export const liffService = new LiffService();
