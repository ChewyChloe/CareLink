export const INVITATION_TOKEN_KEY = 'carelink.pendingInvitation';
export function rememberInvitationToken(search: string, storage: Pick<Storage, 'setItem'>): void {
  const token = new URLSearchParams(search).get('token');
  if (token && /^[a-f0-9]{64}$/.test(token)) storage.setItem(INVITATION_TOKEN_KEY, token);
}
