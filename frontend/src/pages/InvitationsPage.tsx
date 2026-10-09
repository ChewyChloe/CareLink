import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';

type Invitation = { id: string; status: string; target_role: string; accepted_by: string | null; expires_at: string };
export function InvitationsPage() {
  const { user, login } = useAuth();
  const guardians = user?.grants.filter(g => g.role === 'GUARDIAN') || [];
  const [selected, setSelected] = useState('');
  const childId = selected || guardians[0]?.childId || '';
  const [items, setItems] = useState<Invitation[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setItems([]); setUrl(''); setError('');
    if (!childId) return;
    const controller = new AbortController(); setLoading(true);
    fetch(`/api/children/${childId}/invitations`, { credentials: 'include', signal: controller.signal })
      .then(async r => { if (!r.ok) throw new Error(r.status === 401 ? '請重新登入' : '邀請載入失敗'); return r.json(); })
      .then(setItems).catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [childId, revision]);
  async function mutate(id?: string) {
    setBusy(true); setError('');
    try {
      const r = await fetch(id ? `/api/invitations/${id}/activate` : '/api/invitations', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? {} : { childId, targetRole: 'CAREGIVER' }),
      });
      if (!r.ok) throw new Error('操作失敗；請重新載入確認狀態');
      const data = await r.json();
      if (id) setRevision(n => n + 1);
      else { setUrl(new URL(data.inviteUrl, window.location.origin).href); setItems(old => [...old, { id: data.invitationId, status: 'PENDING', target_role: data.targetRole, accepted_by: null, expires_at: data.expiresAt }]); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="p-8 pt-24"><h1>照護邀請</h1>
    {!user ? <button onClick={login}>以 LINE 登入</button> : !childId ? <p>目前沒有家長權限的孩子。</p> : <>
      <label>孩子 <select value={childId} disabled={busy} onChange={e => setSelected(e.target.value)}>{guardians.map(g => <option key={g.id} value={g.childId}>{g.childAlias}</option>)}</select></label>
      <button disabled={busy || loading} onClick={() => mutate()}>建立保母邀請</button>
      {url && <p>僅顯示一次，請複製給指定保母：<a href={url}>{url}</a></p>}
      {error ? <p role="alert">{error}</p> : loading ? <p role="status">載入中…</p> : !items.length ? <p>尚無邀請。</p> : items.map(i => <section key={i.id}>
        <p>{i.target_role} · {i.status} · 有效至 {new Date(i.expires_at).toLocaleString('zh-TW')} · 接受帳號核對碼 {i.accepted_by?.slice(-6) || '尚未接受'}</p>
        {i.status === 'ACCEPTED' && <button disabled={busy} onClick={() => { if (window.confirm('請先與保母核對接受帳號。確定啟用這位保母？')) mutate(i.id); }}>核對後啟用</button>}
      </section>)}
    </>}
  </main>;
}
