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
  }
})();
