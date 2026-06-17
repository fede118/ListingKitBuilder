// ---- bench persistence (IndexedDB) ----
// The watermark and license are reused for every listing, so we stash their
// bytes locally and rehydrate them on load — works for both Drive picks and
// local drops, with no sign-in or re-download. Storage is best-effort: any
// failure leaves the in-memory file intact, it just won't survive a refresh.
const IDB_NAME='ps_bench', IDB_STORE='files';
function idbOpen(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=()=>req.result.createObjectStore(IDB_STORE);
    req.onsuccess=()=>res(req.result);
    req.onerror=()=>rej(req.error);
  });
}
export async function idbPut(key,blob){
  try{
    const db=await idbOpen();
    await new Promise((res,rej)=>{
      const tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).put(blob,key);
      tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
    });
  }catch(_){ /* best-effort */ }
}
export async function idbGet(key){
  try{
    const db=await idbOpen();
    return await new Promise((res,rej)=>{
      const tx=db.transaction(IDB_STORE,'readonly');
      const r=tx.objectStore(IDB_STORE).get(key);
      r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error);
    });
  }catch(_){ return null; }
}
export async function idbDel(key){
  try{
    const db=await idbOpen();
    await new Promise((res,rej)=>{
      const tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
    });
  }catch(_){ /* best-effort */ }
}
