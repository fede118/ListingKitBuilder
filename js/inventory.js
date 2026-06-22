// Inventory controller: view routing, the sign-in / sign-out / silent-restore
// flows, the data loaders that compose the API + UI layers, and all the
// inventory-panel event wiring. initInventory() attaches the listeners and runs
// the one-time init.
import { $ } from './dom.js';
import { inv, invConfigured, driveConfigured } from './google-config.js';
import { invInitClient, invRequestToken, invLoadCachedToken } from './google-auth.js';
import {
  invCall, invWithRetry, invEnsureSheet, invEnsureCatSheet,
  invGetCategories, invGetRows, invNextId, invAddCategory
} from './inventory-api.js';
import {
  invSetUI, invSetPageUI, invSetStatus, renderInvSummary, renderCategorySelect,
  renderInventoryTable, invCatSetStatus, renderCatManager
} from './inventory-ui.js';

// ---- view routing ----
function applyView(){
  const v = location.hash === '#inventory' ? 'inventory' : 'builder';
  $('#view-builder').style.display   = v === 'builder'   ? '' : 'none';
  $('#view-inventory').style.display = v === 'inventory' ? '' : 'none';
  document.querySelectorAll('.view-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.view === v)
  );
  if(v === 'inventory' && inv.token) invLoadPage();
}

// ---- data loaders ----
async function invLoadCatManager(){
  await invEnsureCatSheet();
  const cats=await invGetCategories();
  renderCatManager(cats);
  renderCategorySelect(cats);
}
async function invLoad(){   // builder: refreshes category select + summary
  await invEnsureSheet();
  const [cats,rows]=await Promise.all([invGetCategories(),invGetRows()]);
  const data=rows.slice(1);
  const catCounts={};
  for(const r of data){ const c=r[1]||'(none)'; catCounts[c]=(catCounts[c]||0)+1; }
  renderInvSummary(data.length, catCounts);
  renderCategorySelect(cats);
}
async function invLoadPage(){   // inventory view: summary + category manager + full table
  const wrap=$('#inv-table-wrap');
  wrap.innerHTML='<p class="inv-notice" style="margin-top:16px">Loading…</p>';
  try{
    await invWithRetry(async ()=>{
      await invEnsureSheet();
      const [cats,rows]=await Promise.all([invGetCategories(),invGetRows()]);
      const data=rows.slice(1);
      const catCounts={};
      for(const r of data){ const c=r[1]||'(none)'; catCounts[c]=(catCounts[c]||0)+1; }
      renderInvSummary(data.length, catCounts);
      renderCatManager(cats);
      renderCategorySelect(cats);
      renderInventoryTable(rows);
    });
  }catch(e){
    wrap.innerHTML=`<p class="inv-notice" style="color:var(--danger);margin-top:16px">Could not load inventory: ${e.message}</p>`;
  }
}

// ---- show save form (called from renderOutput) ----
export function invShow(name){
  $('#inv-save-section').style.display='';
  $('#inv-save').disabled=false;
  invSetStatus('','');
  $('#inv-title').value=name;
  if(!inv.token) return;
  invWithRetry(invLoad).catch(e=>invSetStatus('Could not refresh: '+e.message,'err'));
}

// ---- shared auth actions ----
async function invSignIn(){
  const onInvPage = location.hash==='#inventory';
  try{
    await invRequestToken(false);
    localStorage.setItem('ps_signed_in','1');
    invSetUI('signedin');
    invSetPageUI('signedin');
    if(onInvPage){
      await invLoadPage();
    } else {
      invSetStatus('Loading…','');
      await invWithRetry(invLoad);
      invSetStatus('','');
    }
  }catch(e){
    invSetStatus('Sign-in failed: '+e.message,'err');
  }
}
// A sign-in obtained elsewhere (e.g. the Drive picker) — surface it across
// both panels so the user isn't asked to sign in again for inventory. Does
// NOT force-provision the sheet: a Drive-only user shouldn't get an inventory
// spreadsheet created as a side effect. The sheet is still made lazily when
// they actually open Inventory or save a design.
export function invReflectSignedIn(){
  if(!inv.token) return;
  invSetUI('signedin');
  invSetPageUI('signedin');
  if(location.hash==='#inventory') invLoadPage().catch(()=>{});
  else if(inv.spreadsheetId) invWithRetry(invLoad).catch(()=>{});
}
function invSignOut(){
  localStorage.removeItem('ps_signed_in');
  try{ sessionStorage.removeItem('ps_token'); }catch(_){}
  if(inv.token && typeof google!=='undefined' && google.accounts)
    google.accounts.oauth2.revoke(inv.token,()=>{});
  inv.token=null;
  inv.catSheetId=null;
  invSetUI('signedout');
  invSetPageUI('signedout');
  invSetStatus('','');
  $('#inv-summary').innerHTML='';
  $('#inv-cat-list').innerHTML='';
  $('#inv-table-wrap').innerHTML='';
}

// ---- silent restore on page load ----
function invMarkSignedIn(){
  invSetUI('signedin');
  invSetPageUI('signedin');
  if(location.hash==='#inventory') invLoadPage().catch(()=>{});
  else if(inv.spreadsheetId) invWithRetry(invLoad).catch(()=>{});
}
function invTrySilentRestore(){
  if(!invConfigured() || !localStorage.getItem('ps_signed_in')) return;
  // Fast path: a still-valid cached token restores the session with no call
  // to Google at all — no popup, no flash.
  const cached = invLoadCachedToken();
  if(cached){ inv.token = cached; invMarkSignedIn(); return; }
  // Slow path: token expired/missing. Poll until GIS is ready (async script),
  // then silently request a fresh token. Falls back to signed-out on failure.
  let attempts = 0;
  const maxAttempts = 30; // 3 seconds at 100ms intervals
  const poll = setInterval(()=>{
    attempts++;
    if(typeof google !== 'undefined' && google.accounts){
      clearInterval(poll);
      invInitClient();
      invRequestToken(true).then(()=>{
        localStorage.setItem('ps_signed_in','1');
        invMarkSignedIn();
      }).catch(()=>{
        // Silent restore failed (session expired, consent revoked, etc.) —
        // clear the flag so we don't retry on next load until user signs in again.
        localStorage.removeItem('ps_signed_in');
      });
    } else if(attempts >= maxAttempts){
      clearInterval(poll);
    }
  }, 100);
}

// ---- event listeners + one-time init ----
export function initInventory(){
  // view routing
  window.addEventListener('hashchange', applyView);
  document.querySelectorAll('.view-tab').forEach(t =>
    t.addEventListener('click', () => { location.hash = '#' + t.dataset.view; })
  );

  $('#inv-cat-add-btn').addEventListener('click', async ()=>{
    const input=$('#inv-cat-add-input');
    const name=input.value.trim();
    if(!name) return;
    invCatSetStatus('Adding…','');
    try{
      const existing=await invWithRetry(invGetCategories);
      if(existing.includes(name)){ invCatSetStatus('Already exists.','err'); return; }
      await invWithRetry(()=>invAddCategory(name));
      input.value='';
      invCatSetStatus('Added.','ok');
      const updated=await invWithRetry(invGetCategories);
      renderCatManager(updated);
      renderCategorySelect(updated);
    }catch(e){
      invCatSetStatus('Add failed: '+e.message,'err');
    }
  });
  $('#inv-cat-add-input').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#inv-cat-add-btn').click(); });

  $('#inv-signin').addEventListener('click', invSignIn);
  $('#inv-page-signin').addEventListener('click', invSignIn);
  $('#inv-signout').addEventListener('click', invSignOut);
  $('#inv-page-signout').addEventListener('click', invSignOut);

  $('#inv-cat').addEventListener('change', function(){
    const isNew=this.value==='__new__';
    this.style.display=isNew?'none':'';
    $('#inv-cat-new').style.display=isNew?'':'none';
    if(isNew) $('#inv-cat-new').focus();
  });
  $('#inv-cat-new').addEventListener('blur', function(){
    const cats=[...$('#inv-cat').options].filter(o=>o.value!=='__new__').map(o=>o.value);
    if(!this.value.trim()&&cats.length){
      this.style.display='none';
      const sel=$('#inv-cat'); sel.style.display=''; sel.value='';
    }
  });

  $('#inv-save').addEventListener('click', async ()=>{
    const catSel=$('#inv-cat'), catNew=$('#inv-cat-new');
    const isNewCat=catSel.style.display==='none'||catSel.value==='__new__';
    const cat=isNewCat ? catNew.value.trim() : catSel.value;
    const title=$('#inv-title').value.trim();
    const link=$('#inv-link').value.trim();
    const notes=$('#inv-notes').value.trim();
    if(!cat){ invSetStatus(isNewCat?'Enter a category.':'Choose a category.','err'); return; }
    if(!title){ invSetStatus('Enter a title.','err'); return; }
    const btn=$('#inv-save'); btn.disabled=true;
    invSetStatus('Saving…','');
    let savedId;
    try{
      await invWithRetry(async ()=>{
        await invEnsureSheet();
        if(isNewCat){ const eCats=await invGetCategories(); if(!eCats.includes(cat)) await invAddCategory(cat); }
        const rows=await invGetRows();
        savedId=invNextId(rows);
        await invCall(
          `https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          {method:'POST',body:JSON.stringify({values:[[savedId,cat,title,new Date().toISOString(),link,notes]]})}
        );
      });
      invSetStatus('Saved as '+savedId,'ok');
      try{ await invWithRetry(invLoad); }catch(_){}
    }catch(e){
      invSetStatus('Save failed: '+e.message,'err');
      btn.disabled=false;
    }
  });

  // ---- init ----
  if(!invConfigured()){
    invSetUI('unconfigured');
    invSetPageUI('unconfigured');
  } else {
    invSetUI('signedout');
    invSetPageUI('signedout');
  }
  if(!driveConfigured()){
    document.querySelectorAll('.dz-drive').forEach(b=>b.style.display='none');
  }
  applyView();
  invTrySilentRestore();
}
