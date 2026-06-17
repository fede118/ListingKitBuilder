// Google Identity Services token client + the access-token cache. These are the
// low-level auth primitives; the inventory controller composes them into the
// sign-in / silent-restore flows.
import { GOOGLE_CLIENT_ID, inv } from './google-config.js';

// ---- GIS token client ----
export function invInitClient(){
  if(inv.tokenClient || typeof google==='undefined' || !google.accounts) return;
  inv.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    callback: resp => {
      if(resp.error){ if(inv.authReject) inv.authReject(new Error(resp.error)); }
      else           { inv.token = resp.access_token; invCacheToken(resp.access_token, +resp.expires_in||3600); if(inv.authResolve) inv.authResolve(); }
      inv.authResolve = inv.authReject = null;
    }
  });
}
export function invRequestToken(silent){
  return new Promise((res,rej) => {
    invInitClient();
    if(!inv.tokenClient){ rej(new Error('Google Identity Services not ready — try again in a moment.')); return; }
    inv.authResolve = res; inv.authReject = rej;
    inv.tokenClient.requestAccessToken({ prompt: silent ? '' : undefined });
  });
}
// ---- access-token cache (sessionStorage) ----
// Access tokens live ~1h. Caching the token + its expiry lets a page refresh
// reuse a still-valid token directly, with no round-trip to Google (no flash).
// sessionStorage is per-tab and cleared on close; the cross-session case is
// handled by the silent restore in invTrySilentRestore.
export function invCacheToken(token, expiresInSec){
  try{ sessionStorage.setItem('ps_token', JSON.stringify({ t: token, exp: Date.now() + expiresInSec*1000 })); }catch(_){}
}
export function invLoadCachedToken(){
  try{
    const { t, exp } = JSON.parse(sessionStorage.getItem('ps_token')||'null') || {};
    if(t && exp && Date.now() < exp - 60000) return t;  // 60s safety margin
  }catch(_){}
  try{ sessionStorage.removeItem('ps_token'); }catch(_){}
  return null;
}
