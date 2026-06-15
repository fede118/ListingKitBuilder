(function(){
  "use strict";
  const $ = s => document.querySelector(s);

  // ---- session state ----
  const state = {
    wmFile:null, wmBitmap:null,
    licFile:null,
    fmt:'jpg',
    pngFile:null, jpgFile:null,
    blobs:{} // generated
  };

  // ---- helpers ----
  const PREVIEW_MAX = 2000;   // longest edge cap for storefront proofs
  const CROP_FRAC   = 0.42;   // centre crop fraction for proof 3
  const fmtMeta = () => state.fmt==='png'
    ? {ext:'png', mime:'image/png', q:undefined}
    : {ext:'jpg', mime:'image/jpeg', q:0.92};

  function sanitize(name){
    return name.trim().replace(/[\/\\:*?"<>|]+/g,'').replace(/\s+/g,' ').trim();
  }
  function humanSize(b){
    if(b<1024) return b+' B';
    if(b<1048576) return (b/1024).toFixed(0)+' KB';
    return (b/1048576).toFixed(1)+' MB';
  }
  function fitDims(w,h,cap){
    const long=Math.max(w,h);
    if(long<=cap) return {w,h};
    const k=cap/long;
    return {w:Math.round(w*k), h:Math.round(h*k)};
  }
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function canvasToBlob(canvas){
    const m=fmtMeta();
    return new Promise(res=>canvas.toBlob(res, m.mime, m.q));
  }

  // tile the watermark on a uniform grid; each mark is scaled to fit its cell,
  // so coverage stays even regardless of the watermark's shape (tall or wide)
  function drawWatermark(ctx,W,H){
    if(!state.wmBitmap) return;
    const op = (+$('#wm-op').value)/100;
    const sz = (+$('#wm-sz').value)/100;
    const cell = Math.min(W,H)*sz;          // grid pitch
    const fit = cell*0.82;                   // mark fills 82% of its cell
    const k = Math.min(fit/state.wmBitmap.width, fit/state.wmBitmap.height);
    const wW = state.wmBitmap.width*k, wH = state.wmBitmap.height*k;
    ctx.save();
    ctx.globalAlpha = op;
    let row=0;
    for(let cy=-cell; cy<H+cell; cy+=cell){
      const offset = (row%2) ? cell/2 : 0;   // brick-offset alternate rows
      for(let cx=-cell; cx<W+cell; cx+=cell){
        const x = cx+offset+(cell-wW)/2;
        const y = cy+(cell-wH)/2;
        ctx.drawImage(state.wmBitmap, x, y, wW, wH);
      }
      row++;
    }
    ctx.restore();
  }

  // draw the white name box (proof 1)
  function drawNameBox(ctx,W,H,name){
    const base = Math.min(W,H);
    const fs = Math.max(16, Math.round(base*0.045));
    const padX = Math.round(fs*0.85), padY = Math.round(fs*0.55);
    ctx.font = `700 ${fs}px 'Space Mono', monospace`;
    ctx.textBaseline='middle';
    const tw = ctx.measureText(name).width;
    const boxW = tw + padX*2, boxH = fs + padY*2;
    const x = (W-boxW)/2, y = (H-boxH)/2;   // centred in the image
    ctx.save();
    ctx.shadowColor='rgba(22,35,61,.28)';
    ctx.shadowBlur=Math.round(base*0.02);
    ctx.shadowOffsetY=Math.round(base*0.006);
    ctx.fillStyle='#fff';
    roundRect(ctx,x,y,boxW,boxH,Math.round(fs*0.35));
    ctx.fill();
    ctx.restore();
    ctx.fillStyle='#16233D';
    ctx.textAlign='center';
    ctx.fillText(name, W/2, y+boxH/2+1);
    ctx.textAlign='left';
  }

  async function makeProof(srcBitmap, kind, name){
    const canvas = $('#work');
    const ctx = canvas.getContext('2d');
    let sx=0, sy=0, sw=srcBitmap.width, sh=srcBitmap.height;
    if(kind==='crop'){
      sw = srcBitmap.width*CROP_FRAC;
      sh = srcBitmap.height*CROP_FRAC;
      sx = (srcBitmap.width-sw)/2;
      sy = (srcBitmap.height-sh)/2;
    }
    const d = fitDims(sw,sh,PREVIEW_MAX);
    canvas.width=d.w; canvas.height=d.h;
    ctx.clearRect(0,0,d.w,d.h);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,d.w,d.h);              // flatten background (no transparency in JPG)
    ctx.drawImage(srcBitmap, sx,sy,sw,sh, 0,0,d.w,d.h);
    drawWatermark(ctx,d.w,d.h);
    if(kind==='named') drawNameBox(ctx,d.w,d.h,name);
    return canvasToBlob(canvas);
  }

  // ---- file binding for a drop zone ----
  function bindZone(zoneSel, inputSel, accept, onLoad){
    const zone=$(zoneSel), input=$(inputSel);
    const set = file => {
      if(!file) return;
      if(accept && !accept(file)){ flash(zone); return; }
      onLoad(file, zone);
    };
    zone.addEventListener('click',()=>input.click());
    input.addEventListener('change',e=>set(e.target.files[0]));
    zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over')});
    zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
    zone.addEventListener('drop',e=>{
      e.preventDefault();zone.classList.remove('over');
      set(e.dataTransfer.files[0]);
    });
  }
  function flash(zone){
    zone.classList.add('over');
    setTimeout(()=>zone.classList.remove('over'),300);
  }
  function markLoaded(zone,mainText,subText){
    zone.classList.add('loaded');
    zone.querySelector('.dz-main').textContent=mainText;
    zone.querySelector('.dz-sub').textContent=subText;
  }

  // watermark
  bindZone('#dz-wm','#f-wm', f=>f.type==='image/png', async (f,z)=>{
    state.wmFile=f;
    try{ state.wmBitmap = await createImageBitmap(f); }catch(_){ state.wmBitmap=null; }
    markLoaded(z,'Watermark set', f.name+' · '+humanSize(f.size));
  });
  // license
  bindZone('#dz-lic','#f-lic', f=>f.type==='application/pdf', (f,z)=>{
    state.licFile=f;
    markLoaded(z,'License set', f.name+' · '+humanSize(f.size));
  });
  // png original
  bindZone('#dz-png','#f-png', f=>f.type==='image/png', (f,z)=>{
    state.pngFile=f; markLoaded(z,'PNG loaded', f.name+' · '+humanSize(f.size));
  });
  // jpeg original
  bindZone('#dz-jpg','#f-jpg', f=>f.type==='image/jpeg', (f,z)=>{
    state.jpgFile=f; markLoaded(z,'JPEG loaded', f.name+' · '+humanSize(f.size));
  });

  // sliders
  $('#wm-op').addEventListener('input',e=>$('#wm-op-v').textContent=e.target.value+'%');
  $('#wm-sz').addEventListener('input',e=>$('#wm-sz-v').textContent=e.target.value+'%');

  // format toggle
  $('#seg-fmt').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    state.fmt=b.dataset.fmt;
    [...e.currentTarget.children].forEach(c=>c.classList.toggle('on',c===b));
  });

  // messaging
  function showMsg(kind,text){
    const m=$('#msg'); m.className='msg show '+kind; m.textContent=text;
  }
  function clearMsg(){ $('#msg').className='msg'; }

  // download wiring
  function wireDownload(el, getBlob, filename){
    el.onclick = async (e)=>{
      e.preventDefault();
      const blob = await getBlob();
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download=filename; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),4000);
    };
  }

  // ---- main build ----
  $('#build').addEventListener('click', async ()=>{
    clearMsg();
    const raw=$('#f-name').value;
    const name=sanitize(raw);
    if(!name){ showMsg('err','Add a pattern name first — it names every file.'); return; }
    if(!state.pngFile && !state.jpgFile){ showMsg('err','Upload at least one original (PNG or JPEG).'); return; }
    if(!state.wmBitmap){ showMsg('err','Set a watermark on the bench above — the proofs need it.'); return; }

    const onlyOne = !state.pngFile || !state.jpgFile;
    const btn=$('#build'); const old=btn.innerHTML;
    btn.disabled=true; btn.innerHTML='Building…';

    try{
      const m=fmtMeta();

      // make sure the website font is loaded before drawing it onto canvas
      if(document.fonts && document.fonts.load){
        try{ await document.fonts.load("700 48px 'Space Mono'"); await document.fonts.ready; }catch(_){}
      }

      // source bitmap for proofs: prefer PNG (lossless) else JPG
      const srcFile = state.pngFile || state.jpgFile;
      const srcBitmap = await createImageBitmap(srcFile);

      // 1: named, 2: plain, 3: cropped
      const p1 = await makeProof(srcBitmap,'named',name);
      const p2 = await makeProof(srcBitmap,'plain',name);
      const p3 = await makeProof(srcBitmap,'crop',name);
      srcBitmap.close && srcBitmap.close();

      // product zip — byte copies, no re-encode
      const zip = new JSZip();
      if(state.pngFile) zip.file(name+'.png', state.pngFile);
      if(state.jpgFile) zip.file(name+'.jpg', state.jpgFile);
      if(state.licFile) zip.file('LICENSE.pdf', state.licFile);
      const productZip = await zip.generateAsync({type:'blob'});

      // storefront zip
      const sz = new JSZip();
      sz.file(`${name}-watermark-1.${m.ext}`, p1);
      sz.file(`${name}-watermark-2.${m.ext}`, p2);
      sz.file(`${name}-watermark-3.${m.ext}`, p3);
      const storeZip = await sz.generateAsync({type:'blob'});

      state.blobs={p1,p2,p3,productZip,storeZip};

      renderOutput(name,m,[p1,p2,p3],productZip,storeZip,onlyOne,!state.licFile);
      $('#output').scrollIntoView({behavior:'smooth',block:'start'});

      if(onlyOne || !state.licFile){
        const bits=[];
        if(onlyOne) bits.push('only one original was provided');
        if(!state.licFile) bits.push('no license PDF was set');
        showMsg('warn','Built — note: '+bits.join(', ')+'. The zip contains what you gave it.');
      }
    }catch(err){
      showMsg('err','Something broke while building: '+(err.message||err));
    }finally{
      btn.disabled=false; btn.innerHTML=old;
    }
  });

  function proofCard(num,label,blob,filename){
    const url=URL.createObjectURL(blob);
    const div=document.createElement('div');
    div.className='proof'+(num===3?' crop3':'');
    div.innerHTML=`
      <div class="proof-bar"><span class="num">0${num}</span><span>${label}</span></div>
      <img class="proof-img" src="${url}" alt="${label}">
      <div class="proof-foot"><a href="${url}" download="${filename}">${filename} <span>⤓</span></a></div>`;
    return div;
  }

  function renderOutput(name,m,proofs,productZip,storeZip,onlyOne,noLic){
    $('#out-title').textContent=name;
    // file manifest
    const lines=[];
    lines.push(`<b>${name}.zip</b>  ·  the buyer's download`);
    if(state.pngFile) lines.push(`   └ ${name}.png  <span style="opacity:.6">(${humanSize(state.pngFile.size)}, untouched)</span>`);
    if(state.jpgFile) lines.push(`   └ ${name}.jpg  <span style="opacity:.6">(${humanSize(state.jpgFile.size)}, untouched)</span>`);
    lines.push(noLic
      ? `   └ <span style="color:var(--danger)">LICENSE.pdf — not set</span>`
      : `   └ <span class="lic">LICENSE.pdf</span>`);
    lines.push('');
    lines.push(`<b>storefront proofs</b>  ·  ${humanSize(productZip.size+storeZip.size)} total kit`);
    lines.push(`   └ ${name}-watermark-1.${m.ext}  <span style="opacity:.6">(named)</span>`);
    lines.push(`   └ ${name}-watermark-2.${m.ext}  <span style="opacity:.6">(clean)</span>`);
    lines.push(`   └ ${name}-watermark-3.${m.ext}  <span style="opacity:.6">(zoom detail)</span>`);
    $('#kit-files').innerHTML=lines.join('<br>');

    // proofs
    const wrap=$('#proofs'); wrap.innerHTML='';
    wrap.appendChild(proofCard(1,'NAMED',proofs[0],`${name}-watermark-1.${m.ext}`));
    wrap.appendChild(proofCard(2,'CLEAN',proofs[1],`${name}-watermark-2.${m.ext}`));
    wrap.appendChild(proofCard(3,'ZOOM DETAIL',proofs[2],`${name}-watermark-3.${m.ext}`));

    // bulk downloads
    $('#dl-zip-name').textContent=`${name}.zip`;
    $('#dl-store-name').textContent=`${name}-storefront.zip`;
    wireDownload($('#dl-zip'), async()=>state.blobs.productZip, `${name}.zip`);
    wireDownload($('#dl-store'), async()=>state.blobs.storeZip, `${name}-storefront.zip`);

    $('#output').classList.add('show');
    invShow(name);
  }

  // =====================================================================
  // GOOGLE SHEETS INVENTORY
  // =====================================================================
  // One-time setup in Google Cloud Console (https://console.cloud.google.com):
  //   1. Create a project → enable "Google Sheets API" + "Google Drive API".
  //   2. OAuth consent screen → External → add your account as Test User.
  //   3. Credentials → Create → OAuth 2.0 Client ID → Web application.
  //      Add your GitHub Pages origin to Authorized JavaScript origins.
  //   4. Paste the Client ID below.
  // =====================================================================

  const GOOGLE_CLIENT_ID = '228023879001-4blf1jo5ara42ohqhrvrhvbd6scde7qs.apps.googleusercontent.com';
  const INV_SHEET_NAME   = 'Pattern Studio Inventory';
  const INV_FOLDER_NAME  = 'Pattern Studio';
  const INV_ID_PREFIX    = 'P';
  const INV_ID_WIDTH     = 6;
  const INV_HEADERS      = ['ID','Category','Title','Date Added','Source Link','Notes'];
  const CAT_SHEET_NAME   = 'Categories';

  const inv = {
    token: null, tokenClient: null,
    spreadsheetId: localStorage.getItem('ps_sheet') || null,
    folderId:      localStorage.getItem('ps_folder') || null,
    catSheetId: null,
    authResolve: null, authReject: null
  };

  const invConfigured = () =>
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID';

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
  window.addEventListener('hashchange', applyView);
  document.querySelectorAll('.view-tab').forEach(t =>
    t.addEventListener('click', () => { location.hash = '#' + t.dataset.view; })
  );

  // ---- GIS token client ----
  function invInitClient(){
    if(inv.tokenClient || typeof google==='undefined' || !google.accounts) return;
    inv.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: resp => {
        if(resp.error){ if(inv.authReject) inv.authReject(new Error(resp.error)); }
        else           { inv.token = resp.access_token; if(inv.authResolve) inv.authResolve(); }
        inv.authResolve = inv.authReject = null;
      }
    });
  }
  function invRequestToken(silent){
    return new Promise((res,rej) => {
      invInitClient();
      if(!inv.tokenClient){ rej(new Error('Google Identity Services not ready — try again in a moment.')); return; }
      inv.authResolve = res; inv.authReject = rej;
      inv.tokenClient.requestAccessToken({ prompt: silent ? '' : undefined });
    });
  }

  // ---- API helpers ----
  async function invCall(url, opts={}){
    const r = await fetch(url, {
      ...opts,
      headers:{'Authorization':'Bearer '+inv.token,'Content-Type':'application/json',...(opts.headers||{})}
    });
    if(r.status===401){ const e=new Error('auth'); e.status=401; throw e; }
    if(!r.ok){ let m='API error '+r.status; try{const j=await r.json();m=j.error?.message||m;}catch(_){} throw new Error(m); }
    return r.json();
  }
  async function invWithRetry(fn){
    try{ return await fn(); }
    catch(e){ if(e.status===401){ await invRequestToken(true); return fn(); } throw e; }
  }

  // ---- provisioning ----
  async function invEnsureFolder(){
    if(inv.folderId){
      try{ await invCall(`https://www.googleapis.com/drive/v3/files/${inv.folderId}?fields=id`); return; }
      catch(e){ if(e.status!==401){ inv.folderId=null; localStorage.removeItem('ps_folder'); } else throw e; }
    }
    const q=encodeURIComponent(`name='${INV_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const list=await invCall(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
    if(list.files?.length){ inv.folderId=list.files[0].id; localStorage.setItem('ps_folder',inv.folderId); return; }
    const f=await invCall('https://www.googleapis.com/drive/v3/files',{
      method:'POST',body:JSON.stringify({name:INV_FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})
    });
    inv.folderId=f.id; localStorage.setItem('ps_folder',inv.folderId);
  }
  async function invEnsureSheet(){
    if(inv.spreadsheetId){
      try{ await invCall(`https://www.googleapis.com/drive/v3/files/${inv.spreadsheetId}?fields=id`); return await invEnsureCatSheet(); }
      catch(e){ if(e.status!==401){ inv.spreadsheetId=null; localStorage.removeItem('ps_sheet'); } else throw e; }
    }
    const q=encodeURIComponent(`name='${INV_SHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
    const list=await invCall(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`);
    if(list.files?.length){ inv.spreadsheetId=list.files[0].id; localStorage.setItem('ps_sheet',inv.spreadsheetId); return await invEnsureCatSheet(); }
    await invEnsureFolder();
    const s=await invCall('https://www.googleapis.com/drive/v3/files',{
      method:'POST',
      body:JSON.stringify({name:INV_SHEET_NAME,mimeType:'application/vnd.google-apps.spreadsheet',parents:[inv.folderId]})
    });
    inv.spreadsheetId=s.id; localStorage.setItem('ps_sheet',inv.spreadsheetId);
    await invCall(
      `https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/A1:F1?valueInputOption=RAW`,
      {method:'PUT',body:JSON.stringify({values:[INV_HEADERS]})}
    );
    await invEnsureCatSheet();
  }
  async function invGetRows(){
    const r=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/A:F`);
    return r.values || [INV_HEADERS];
  }
  function invNextId(rows){
    let max=0;
    for(let i=1;i<rows.length;i++){
      const id=rows[i]?.[0]||'';
      if(id.startsWith(INV_ID_PREFIX)){
        const n=parseInt(id.slice(INV_ID_PREFIX.length),10);
        if(!isNaN(n)&&n>max) max=n;
      }
    }
    return INV_ID_PREFIX+String(max+1).padStart(INV_ID_WIDTH,'0');
  }

  // ---- Categories tab provisioning ----
  async function invEnsureCatSheet(){
    if(inv.catSheetId !== null) return;
    const meta=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}?fields=sheets.properties`);
    const existing=meta.sheets?.find(s=>s.properties.title===CAT_SHEET_NAME);
    if(existing){ inv.catSheetId=existing.properties.sheetId; return; }
    const result=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}:batchUpdate`,{
      method:'POST',
      body:JSON.stringify({requests:[{addSheet:{properties:{title:CAT_SHEET_NAME}}}]})
    });
    inv.catSheetId=result.replies[0].addSheet.properties.sheetId;
    await invCall(
      `https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A1?valueInputOption=RAW`,
      {method:'PUT',body:JSON.stringify({values:[['Category']]})}
    );
  }

  // ---- category CRUD ----
  async function invGetCategories(){
    const r=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A2:A`);
    return (r.values||[]).map(row=>row[0]).filter(Boolean);
  }
  async function invAddCategory(name){
    await invCall(
      `https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {method:'POST',body:JSON.stringify({values:[[name]]})}
    );
  }
  async function invDeleteCategory(name){
    const r=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A:A`);
    const vals=r.values||[];
    const rowIdx=vals.findIndex((row,i)=>i>0&&row[0]===name);
    if(rowIdx<0) return;
    await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}:batchUpdate`,{
      method:'POST',
      body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:inv.catSheetId,dimension:'ROWS',startIndex:rowIdx,endIndex:rowIdx+1}}}]})
    });
  }
  async function invRenameCategory(oldName, newName){
    const [catR,invR]=await Promise.all([
      invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A:A`),
      invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/B:B`)
    ]);
    const data=[];
    const catVals=catR.values||[];
    const catRowIdx=catVals.findIndex((row,i)=>i>0&&row[0]===oldName);
    if(catRowIdx>=0) data.push({range:`${CAT_SHEET_NAME}!A${catRowIdx+1}`,values:[[newName]]});
    const invVals=invR.values||[];
    invVals.forEach((row,i)=>{ if(i>0&&row[0]===oldName) data.push({range:`B${i+1}`,values:[[newName]]}); });
    if(!data.length) return;
    await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values:batchUpdate`,{
      method:'POST',
      body:JSON.stringify({valueInputOption:'RAW',data})
    });
  }

  // ---- UI state ----
  function invSetUI(state){   // builder panel
    $('#inv-unconfigured').style.display = state==='unconfigured' ? '':'none';
    $('#inv-signedout').style.display    = state==='signedout'    ? '':'none';
    $('#inv-signedin').style.display     = state==='signedin'     ? '':'none';
  }
  function invSetPageUI(state){   // inventory view
    $('#inv-page-unconfigured').style.display = state==='unconfigured' ? '':'none';
    $('#inv-page-signedout').style.display    = state==='signedout'    ? '':'none';
    $('#inv-page-signedin').style.display     = state==='signedin'     ? '':'none';
  }
  function invSetStatus(msg, kind){
    const el=$('#inv-status'); el.textContent=msg;
    el.className='inv-status'+(kind?' '+kind:'');
  }

  // ---- rendering ----
  function renderInvSummary(total, cats){
    const el=$('#inv-summary');
    if(!total){ el.innerHTML=''; return; }
    const chips=Object.entries(cats).map(([k,v])=>`<span class="inv-chip">${k} <b>${v}</b></span>`).join('');
    el.innerHTML=`<div class="inv-bar"><span class="inv-total"><b>${total}</b> design${total!==1?'s':''} saved</span>${chips}</div>`;
  }
  function renderCategorySelect(cats){
    const sel=$('#inv-cat'); sel.innerHTML='';
    for(const c of cats){ const o=document.createElement('option'); o.value=c; o.textContent=c; sel.appendChild(o); }
    const newOpt=document.createElement('option'); newOpt.value='__new__'; newOpt.textContent='+ Add new category…';
    sel.appendChild(newOpt);
    const hasCats=cats.length>0;
    sel.style.display=hasCats?'':'none';
    $('#inv-cat-new').style.display=hasCats?'none':'';
  }
  function renderInventoryTable(rows){
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

  function invCatSetStatus(msg,kind){
    const el=$('#inv-cat-status'); el.textContent=msg;
    el.className='inv-status'+(kind?' '+kind:'');
  }
  function renderCatManager(cats){
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
  function invShow(name){
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
  function invSignOut(){
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

  // ---- event listeners ----
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
      const sel=$('#inv-cat'); sel.style.display=''; sel.value=cats[0];
    }
  });

  $('#inv-save').addEventListener('click', async ()=>{
    const catSel=$('#inv-cat'), catNew=$('#inv-cat-new');
    const isNewCat=catSel.style.display==='none'||catSel.value==='__new__';
    const cat=isNewCat ? catNew.value.trim() : catSel.value;
    const title=$('#inv-title').value.trim();
    const link=$('#inv-link').value.trim();
    const notes=$('#inv-notes').value.trim();
    if(!cat){ invSetStatus('Enter a category.','err'); return; }
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
  (function invInit(){
    if(!invConfigured()){
      invSetUI('unconfigured');
      invSetPageUI('unconfigured');
    } else {
      invSetUI('signedout');
      invSetPageUI('signedout');
    }
    applyView();
  })();
})();
