import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { INVITATION_TOKEN_KEY, rememberInvitationToken } from '../lib/invitation-token';

const key = INVITATION_TOKEN_KEY;
export function AcceptInvitePage() {
  const { user, login, refreshMe } = useAuth();
  const [token] = useState(() => {
    const incoming = new URLSearchParams(window.location.search).get('token');
    rememberInvitationToken(window.location.search, sessionStorage);
    return incoming || sessionStorage.getItem(key) || '';
  });
  const [details, setDetails] = useState<{ childAlias: string; inviter: string; targetRole: string; status: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user || !token) return;
    const controller = new AbortController();
    setDetails(null); setError('');
    fetch(`/api/invitations/${encodeURIComponent(token)}`, { credentials: 'include', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(r.status === 401 ? '請重新登入' : '邀請無效、已使用或過期'); return r.json(); })
      .then(setDetails).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [user, token]);
  async function accept() {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error('接受失敗；請重新載入確認邀請狀態');
      setDetails(d => d ? { ...d, status: 'ACCEPTED' } : d);
      sessionStorage.removeItem(key);
      await refreshMe();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="p-8 pt-24">
    <h1>接受照護邀請</h1>
    {!token ? <p role="alert">缺少邀請 token，請重新開啟邀請連結。</p> : !user ? <button onClick={login}>以 LINE 登入並返回邀請</button> : error ? <p role="alert">{error}</p> : !details ? <p role="status">載入邀請中…</p> : <>
      <p>{details.inviter} · {details.childAlias} · {details.targetRole}</p>
      {details.status === 'PENDING' ? <button disabled={busy} onClick={accept}>{busy ? '接受中…' : '確認接受'}</button> : <p>邀請狀態：{details.status}。接受後須等待家長核對並啟用；啟用前沒有孩子資料權限。</p>}
    </>}
  </main>;
}
