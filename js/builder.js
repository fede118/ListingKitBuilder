// The listing-kit builder: bench files (watermark/license), the new-listing
// originals, the Build action, and the output rendering. initBuilder() attaches
// every listener and rehydrates the persisted bench.
import { $ } from './dom.js';
import { state, fmtMeta } from './state.js';
import { humanSize, sanitize } from './utils.js';
import { makeProof, renderPreview } from './proofs.js';
import { idbPut, idbGet, idbDel } from './bench-storage.js';
import { bindZone, markLoaded, markCleared } from './dropzone.js';
import { invShow } from './inventory.js';

// watermark — persisted across refreshes (see bench-storage). `persist` is
// false when rehydrating from storage on load, so we don't write it back.
async function loadWatermark(f,z,persist=true){
  state.wmFile=f;
  try{ state.wmBitmap = await createImageBitmap(f); }catch(_){ state.wmBitmap=null; }
  markLoaded(z,'Watermark set', f.name+' · '+humanSize(f.size));
  if(persist) idbPut('wm',f);
  refreshPreview();
}
function clearWatermark(z){
  state.wmFile=null; state.wmBitmap=null;
  markCleared(z,'Drop watermark');
  idbDel('wm');
  refreshPreview();
}
// license — persisted the same way
function loadLicense(f,z,persist=true){
  state.licFile=f;
  markLoaded(z,'License set', f.name+' · '+humanSize(f.size));
  if(persist) idbPut('lic',f);
}
function clearLicense(z){
  state.licFile=null;
  markCleared(z,'Drop license');
  idbDel('lic');
}

// storefront info text — short, rarely changes, plain text, so it lives in
// localStorage rather than the IndexedDB blob bench used for watermark/license.
const SF_KEY='ps_sf_text';

// re-renders the bench preview; assigned in initBuilder (no-op until then, so
// the bench-load handlers below can call it safely during rehydrate).
let refreshPreview=()=>{};

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
    ? `   └ <span style="color:var(--danger)">license — not set</span>`
    : `   └ <span class="lic">${state.licFile.name}</span>`);
  lines.push('');
  lines.push(`<b>storefront proofs</b>  ·  ${humanSize(productZip.size+storeZip.size)} total kit`);
  lines.push(`   └ ${name}-watermark-1.${m.ext}  <span style="opacity:.6">(named)</span>`);
  lines.push(`   └ ${name}-watermark-2.${m.ext}  <span style="opacity:.6">(clean)</span>`);
  lines.push(`   └ ${name}-watermark-3.${m.ext}  <span style="opacity:.6">(zoom detail)</span>`);
  if(proofs[3]) lines.push(`   └ ${name}-storefront-info.${m.ext}  <span style="opacity:.6">(info)</span>`);
  $('#kit-files').innerHTML=lines.join('<br>');

  // proofs
  const wrap=$('#proofs'); wrap.innerHTML='';
  wrap.appendChild(proofCard(1,'NAMED',proofs[0],`${name}-watermark-1.${m.ext}`));
  wrap.appendChild(proofCard(2,'CLEAN',proofs[1],`${name}-watermark-2.${m.ext}`));
  wrap.appendChild(proofCard(3,'ZOOM DETAIL',proofs[2],`${name}-watermark-3.${m.ext}`));
  if(proofs[3]) wrap.appendChild(proofCard(4,'STOREFRONT INFO',proofs[3],`${name}-storefront-info.${m.ext}`));

  // bulk downloads
  $('#dl-zip-name').textContent=`${name}.zip`;
  $('#dl-store-name').textContent=`${name}-storefront.zip`;
  wireDownload($('#dl-zip'), async()=>state.blobs.productZip, `${name}.zip`);
  wireDownload($('#dl-store'), async()=>state.blobs.storeZip, `${name}-storefront.zip`);

  $('#output').classList.add('show');
  invShow(name);
}

// ---- main build ----
async function build(){
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

    // 1: named, 2: plain, 3: cropped, 4: storefront info (only if text was set)
    const hasInfo = !!(state.sfText && state.sfText.trim());
    const p1 = await makeProof(srcBitmap,'named',name);
    const p2 = await makeProof(srcBitmap,'plain',name);
    const p3 = await makeProof(srcBitmap,'crop',name);
    const p4 = hasInfo ? await makeProof(srcBitmap,'storefront',name,state.sfText) : null;
    srcBitmap.close && srcBitmap.close();

    // product zip — byte copies, no re-encode
    const zip = new JSZip();
    if(state.pngFile) zip.file(name+'.png', state.pngFile);
    if(state.jpgFile) zip.file(name+'.jpg', state.jpgFile);
    if(state.licFile) zip.file(state.licFile.name, state.licFile);   // keep the license's original filename
    const productZip = await zip.generateAsync({type:'blob'});

    // storefront zip
    const sz = new JSZip();
    sz.file(`${name}-watermark-1.${m.ext}`, p1);
    sz.file(`${name}-watermark-2.${m.ext}`, p2);
    sz.file(`${name}-watermark-3.${m.ext}`, p3);
    if(p4) sz.file(`${name}-storefront-info.${m.ext}`, p4);
    const storeZip = await sz.generateAsync({type:'blob'});

    state.blobs={p1,p2,p3,p4,productZip,storeZip};

    renderOutput(name,m,[p1,p2,p3,p4],productZip,storeZip,onlyOne,!state.licFile);
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
}

export function initBuilder(){
  // bench: watermark + license (persisted)
  bindZone('#dz-wm','#f-wm', f=>f.type==='image/png', (f,z)=>loadWatermark(f,z), ['image/png'], clearWatermark);
  bindZone('#dz-lic','#f-lic', f=>f.type==='application/pdf', (f,z)=>loadLicense(f,z), ['application/pdf'], clearLicense);
  // rehydrate the bench from storage (fire-and-forget; no-op if nothing saved)
  (async ()=>{
    const [wm,lic]=await Promise.all([idbGet('wm'),idbGet('lic')]);
    if(wm)  loadWatermark(wm, $('#dz-wm'), false);
    if(lic) loadLicense(lic, $('#dz-lic'), false);
  })();
  // storefront info text — restore + persist on edit
  const sfEl=$('#sf-text');
  state.sfText = localStorage.getItem(SF_KEY) || '';
  sfEl.value = state.sfText;

  // preview carousel: cycle the three full-image proofs so you can see how the
  // text lands in each. The zoom-detail crop is omitted (it has no box).
  const PV_VIEWS=[['named','NAMED'],['clean','CLEAN · watermark only'],['storefront','STOREFRONT INFO']];
  let pvIndex=0;
  refreshPreview=()=>{
    const [view,label]=PV_VIEWS[pvIndex];
    $('#sf-prev-label').textContent=`${label}  ·  ${pvIndex+1}/${PV_VIEWS.length}`;
    renderPreview(view, $('#f-name').value.trim()||'pattern-name', state.sfText);
  };
  const stepPreview=delta=>{ pvIndex=(pvIndex+delta+PV_VIEWS.length)%PV_VIEWS.length; refreshPreview(); };
  $('#sf-prev-prev').addEventListener('click',()=>stepPreview(-1));
  $('#sf-prev-next').addEventListener('click',()=>stepPreview(1));

  let sfTimer;
  sfEl.addEventListener('input', ()=>{
    state.sfText = sfEl.value;
    localStorage.setItem(SF_KEY, state.sfText);
    clearTimeout(sfTimer);
    sfTimer=setTimeout(refreshPreview, 150);
  });
  // the name only shows in the NAMED view, but refreshing always is harmless
  $('#f-name').addEventListener('input', refreshPreview);
  // initial preview — wait for the web font so canvas text matches the output
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(refreshPreview); }
  refreshPreview();

  // png original
  bindZone('#dz-png','#f-png', f=>f.type==='image/png', (f,z)=>{
    state.pngFile=f; markLoaded(z,'PNG loaded', f.name+' · '+humanSize(f.size)); refreshPreview();
  }, ['image/png']);
  // jpeg original
  bindZone('#dz-jpg','#f-jpg', f=>f.type==='image/jpeg', (f,z)=>{
    state.jpgFile=f; markLoaded(z,'JPEG loaded', f.name+' · '+humanSize(f.size)); refreshPreview();
  }, ['image/jpeg']);

  // sliders
  $('#wm-op').addEventListener('input',e=>{ $('#wm-op-v').textContent=e.target.value+'%'; refreshPreview(); });
  $('#wm-sz').addEventListener('input',e=>{ $('#wm-sz-v').textContent=e.target.value+'%'; refreshPreview(); });

  // format toggle
  $('#seg-fmt').addEventListener('click',e=>{
    const b=e.target.closest('button'); if(!b) return;
    state.fmt=b.dataset.fmt;
    [...e.currentTarget.children].forEach(c=>c.classList.toggle('on',c===b));
  });

  $('#build').addEventListener('click', build);
}
