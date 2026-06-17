// Pure rendering for the inventory: panel state toggles, status lines, the
// summary chips, the category <select>, the full table, and the interactive
// category manager (rename/delete with inline editing).
import { $ } from './dom.js';
import {
  invWithRetry, invGetCategories, invGetRows,
  invRenameCategory, invDeleteCategory
} from './inventory-api.js';

// ---- UI state ----
export function invSetUI(state){   // builder panel
  $('#inv-unconfigured').style.display = state==='unconfigured' ? '':'none';
  $('#inv-signedout').style.display    = state==='signedout'    ? '':'none';
  $('#inv-signedin').style.display     = state==='signedin'     ? '':'none';
}
export function invSetPageUI(state){   // inventory view
  $('#inv-page-unconfigured').style.display = state==='unconfigured' ? '':'none';
  $('#inv-page-signedout').style.display    = state==='signedout'    ? '':'none';
  $('#inv-page-signedin').style.display     = state==='signedin'     ? '':'none';
}
export function invSetStatus(msg, kind){
  const el=$('#inv-status'); el.textContent=msg;
  el.className='inv-status'+(kind?' '+kind:'');
}

// ---- rendering ----
export function renderInvSummary(total, cats){
  const el=$('#inv-summary');
  if(!total){ el.innerHTML=''; return; }
  const chips=Object.entries(cats).map(([k,v])=>`<span class="inv-chip">${k} <b>${v}</b></span>`).join('');
  el.innerHTML=`<div class="inv-bar"><span class="inv-total"><b>${total}</b> design${total!==1?'s':''} saved</span>${chips}</div>`;
}
export function renderCategorySelect(cats){
  const sel=$('#inv-cat'); sel.innerHTML='';
  for(const c of cats){ const o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); }
  const newOpt=document.createElement('option'); newOpt.value='__new__'; newOpt.textContent='+ Add new category…';
  sel.appendChild(newOpt);
  const hasCats=cats.length>0;
  sel.style.display=hasCats?'':'none';
  $('#inv-cat-new').style.display=hasCats?'none':'';
}
export function renderInventoryTable(rows){
  const wrap=$('#inv-table-wrap');
  const data=rows.slice(1);
  if(!data.length){
    wrap.innerHTML='<p class="inv-notice" style="margin-top:16px">No designs saved yet — build a kit and save your first one.</p>';
    return;
  }
  const esc=s=>(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const fmtDate=s=>{ try{return new Date(s).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});}catch(_){return s||'';} };
  wrap.innerHTML='<table class="inv-table"><thead><tr>'+
    '<th>ID</th><th>Category</th><th>Title</th><th>Date Added</th><th>Source</th><th>Notes</th>'+
    '</tr></thead><tbody>'+
    data.map(r=>`<tr>
      <td class="inv-id">${esc(r[0])}</td>
      <td>${esc(r[1])}</td>
      <td>${esc(r[2])}</td>
      <td class="inv-date">${fmtDate(r[3])}</td>
      <td>${r[4]?`<a href="${esc(r[4])}" target="_blank" rel="noopener">↗</a>`:''}</td>
      <td class="inv-notes">${esc(r[5])}</td>
    </tr>`).join('')+
    '</tbody></table>';
}

export function invCatSetStatus(msg,kind){
  const el=$('#inv-cat-status'); el.textContent=msg;
  el.className='inv-status'+(kind?' '+kind:'');
}
export function renderCatManager(cats){
  const list=$('#inv-cat-list');
  if(!cats.length){
    list.innerHTML='<p class="inv-notice" style="font-size:13px;margin-bottom:0">No categories yet — add one below.</p>';
    return;
  }
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  list.innerHTML=cats.map(c=>`
    <div class="inv-cat-item" data-cat="${esc(c)}">
      <span class="inv-cat-name">${esc(c)}</span>
      <input type="text" class="inv-cat-edit-input inv-cat-input" value="${esc(c)}" style="display:none" aria-label="Rename category">
      <div class="inv-cat-item-actions">
        <button class="inv-cat-rename-btn inv-cat-btn inv-cat-btn--ghost">Rename</button>
        <button class="inv-cat-confirm-btn inv-cat-btn" style="display:none">Save</button>
        <button class="inv-cat-cancel-btn inv-cat-btn inv-cat-btn--ghost" style="display:none">Cancel</button>
        <button class="inv-cat-delete-btn inv-cat-btn inv-cat-btn--danger" title="Delete category">✕</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('.inv-cat-item').forEach(item=>{
    const nameEl=item.querySelector('.inv-cat-name');
    const editInput=item.querySelector('.inv-cat-edit-input');
    const renameBtn=item.querySelector('.inv-cat-rename-btn');
    const confirmBtn=item.querySelector('.inv-cat-confirm-btn');
    const cancelBtn=item.querySelector('.inv-cat-cancel-btn');
    const deleteBtn=item.querySelector('.inv-cat-delete-btn');

    function startEdit(){
      nameEl.style.display='none'; renameBtn.style.display='none'; deleteBtn.style.display='none';
      editInput.style.display=''; confirmBtn.style.display=''; cancelBtn.style.display='';
      editInput.focus(); editInput.select();
    }
    function cancelEdit(){
      editInput.value=item.dataset.cat;
      nameEl.style.display=''; renameBtn.style.display=''; deleteBtn.style.display='';
      editInput.style.display='none'; confirmBtn.style.display='none'; cancelBtn.style.display='none';
    }

    renameBtn.addEventListener('click', startEdit);
    cancelBtn.addEventListener('click', cancelEdit);
    editInput.addEventListener('keydown', e=>{ if(e.key==='Enter') confirmBtn.click(); if(e.key==='Escape') cancelEdit(); });

    confirmBtn.addEventListener('click', async ()=>{
      const newName=editInput.value.trim();
      if(!newName||newName===item.dataset.cat){ cancelEdit(); return; }
      const oldName=item.dataset.cat;
      invCatSetStatus('Renaming…','');
      confirmBtn.disabled=true; cancelBtn.disabled=true;
      try{
        await invWithRetry(()=>invRenameCategory(oldName,newName));
        invCatSetStatus('Renamed.','ok');
        const [updatedCats,rows]=await Promise.all([invWithRetry(invGetCategories),invWithRetry(invGetRows)]);
        renderCatManager(updatedCats);
        renderCategorySelect(updatedCats);
        renderInventoryTable(rows);
      }catch(e){
        invCatSetStatus('Rename failed: '+e.message,'err');
        confirmBtn.disabled=false; cancelBtn.disabled=false;
      }
    });

    deleteBtn.addEventListener('click', async ()=>{
      if(!confirm(`Delete "${item.dataset.cat}" from your category list?\n\nInventory items using this name will keep it — only the list entry is removed.`)) return;
      invCatSetStatus('Deleting…','');
      deleteBtn.disabled=true;
      try{
        await invWithRetry(()=>invDeleteCategory(item.dataset.cat));
        invCatSetStatus('Deleted.','ok');
        const updatedCats=await invWithRetry(invGetCategories);
        renderCatManager(updatedCats);
        renderCategorySelect(updatedCats);
      }catch(e){
        invCatSetStatus('Delete failed: '+e.message,'err');
        deleteBtn.disabled=false;
      }
    });
  });
}
