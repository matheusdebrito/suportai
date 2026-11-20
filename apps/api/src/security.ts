import { createHash, randomBytes } from 'node:crypto';
import { query } from './db.js';
export type Actor = { id: string; role: 'USER'|'APPROVER'|'ADMIN'; auth_revision: number; must_change_password: boolean };
export function token() { return randomBytes(32).toString('base64url'); }
export function hashToken(value:string) { return createHash('sha256').update(value).digest('hex'); }
export async function actorForSession(raw: string | undefined): Promise<Actor | null> {
  if (!raw) return null;
  const found=await query(`SELECT u.id,u.role,u.auth_revision,u.must_change_password FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true`,[hashToken(raw)]);
  return found.rows[0] ?? null;
}
export function canRead(visibility: string, grant?:{can_read?:boolean}|null) {
  return visibility === 'SHARED' || Boolean(grant?.can_read);
}
export function canEdit(visibility: string, grant?:{can_edit?:boolean}|null) {
  return visibility === 'SHARED' || Boolean(grant?.can_edit);
}
export function canApprove(role:string,visibility:string, grant?:{can_approve?:boolean}|null) {
  return role === 'APPROVER' && (visibility === 'SHARED' || Boolean(grant?.can_approve));
}
export async function spacePermission(actor:Actor, spaceId:string) {
 const r=await query(`SELECT s.visibility,g.can_read,g.can_edit,g.can_approve FROM spaces s
 LEFT JOIN space_grants g ON g.space_id=s.id AND g.user_id=$2 WHERE s.id=$1`,[spaceId,actor.id]);
 const x=r.rows[0]; if(!x) return null;
 return {read:canRead(x.visibility,x),edit:canEdit(x.visibility,x),approve:canApprove(actor.role,x.visibility,x)};
}
