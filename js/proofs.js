// Canvas rendering for the storefront proofs — watermark tiling, the name box,
// and the per-proof compositing that produces each preview blob.
import { $ } from './dom.js';
import { state, PREVIEW_MAX, CROP_FRAC, fmtMeta } from './state.js';
import { fitDims, roundRect } from './utils.js';

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

// greedily wrap `name` into at most maxLines lines that each fit maxW at the
// current ctx.font; returns null when it can't fit (caller shrinks the font)
function wrapText(ctx,name,maxW,maxLines){
  const words = name.split(/\s+/).filter(Boolean);
  if(!words.length) return [''];
  const lines=[]; let line='';
  for(const word of words){
    const next = line ? line+' '+word : word;
    if(ctx.measureText(next).width<=maxW || !line){
      line=next;
    } else {
      lines.push(line); line=word;
    }
    if(lines.length>=maxLines) return null;       // ran out of lines
  }
  lines.push(line);
  if(lines.length>maxLines) return null;
  // a single word may still be wider than the box — reject so the font shrinks
  if(lines.some(l=>ctx.measureText(l).width>maxW)) return null;
  return lines;
}

// draw the white name box (proof 1); the box is kept within a 15% inner
// margin of the image and the name wraps onto up to 3 lines when long
function drawNameBox(ctx,W,H,name){
  const base = Math.min(W,H);
  const MARGIN = 0.15;                              // inner padding from image edges
  const maxBoxW = W*(1-MARGIN*2);
  const MAX_LINES = 3;
  let fs = Math.max(16, Math.round(base*0.045));
  let padX, padY, lines;
  // shrink the font until the wrapped name fits the box width and line budget
  for(;;){
    padX = Math.round(fs*0.85); padY = Math.round(fs*0.55);
    ctx.font = `700 ${fs}px 'Space Mono', monospace`;
    lines = wrapText(ctx, name, maxBoxW-padX*2, MAX_LINES);
    if(lines || fs<=12) break;
    fs--;
  }
  if(!lines) lines=[name];                          // tiny canvas fallback
  ctx.textBaseline='middle';
  const lineH = Math.round(fs*1.25);
  const textW = Math.max(...lines.map(l=>ctx.measureText(l).width));
  const boxW = Math.min(textW + padX*2, maxBoxW);
  const boxH = lineH*lines.length + padY*2;
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
  const firstY = y+padY+lineH/2+1;
  lines.forEach((l,i)=>ctx.fillText(l, W/2, firstY+i*lineH));
  ctx.textAlign='left';
}

// ---- storefront info box (proof 4) ----
// Plain-text from the bench textarea. A line beginning with -, * or • becomes a
// bullet (hanging indent so wrapped continuations align under the text); other
// non-empty lines are plain paragraphs; blank lines add vertical spacing.
function parseInfo(text){
  return (text||'').replace(/\r/g,'').split('\n').map(raw=>{
    const line=raw.trim();
    if(!line) return {blank:true};
    const m=line.match(/^[-*•]\s*(.*)$/);
    return m ? {bullet:true, text:m[1]} : {bullet:false, text:line};
  });
}
// wrap one item's words into lines that each fit `width` at the current ctx.font
function wrapWords(ctx,text,width){
  const words=text.split(/\s+/).filter(Boolean);
  if(!words.length) return [''];
  const lines=[]; let line='';
  for(const w of words){
    const next=line?line+' '+w:w;
    if(ctx.measureText(next).width<=width || !line) line=next;
    else { lines.push(line); line=w; }
  }
  lines.push(line);
  return lines;
}
// draw the left-aligned info box, shrinking the font until everything fits the
// inner margin in both width and height
function drawInfoBox(ctx,W,H,text){
  const items=parseInfo(text);
  if(!items.some(it=>!it.blank)) return;            // nothing to draw
  const base=Math.min(W,H);
  const MARGIN=0.10;                                // inner padding from image edges
  const maxBoxW=W*(1-MARGIN*2), maxBoxH=H*(1-MARGIN*2);
  const bullet='•  ';
  let fs=Math.max(13, Math.round(base*0.034));
  let layout=[], padX=0, padY=0, lineH=0, gap=0;
  for(;;){
    ctx.font=`400 ${fs}px 'Space Mono', monospace`;
    padX=Math.round(fs*1.1); padY=Math.round(fs*0.9);
    lineH=Math.round(fs*1.5); gap=Math.round(fs*0.6);
    const bulletW=ctx.measureText(bullet).width;
    const textW=maxBoxW-padX*2;
    layout=[]; let fits=true;
    for(const it of items){
      if(it.blank){ layout.push({blank:true}); continue; }
      const indent=it.bullet?bulletW:0;
      const wlines=wrapWords(ctx,it.text,textW-indent);
      wlines.forEach((l,i)=>{
        if(l.indexOf(' ')<0 && ctx.measureText(l).width>textW-indent) fits=false; // unbreakable word
        layout.push({text:l, indent, bullet:it.bullet&&i===0});
      });
    }
    let totalH=padY*2;
    for(const ln of layout) totalH += ln.blank?gap:lineH;
    if((fits && totalH<=maxBoxH) || fs<=11) break;
    fs--;
  }
  let contentW=0;
  for(const ln of layout){ if(ln.blank) continue;
    const w=ln.indent+ctx.measureText(ln.text).width;
    if(w>contentW) contentW=w;
  }
  const boxW=Math.min(contentW+padX*2, maxBoxW);
  let totalH=padY*2;
  for(const ln of layout) totalH += ln.blank?gap:lineH;
  const boxH=Math.min(totalH, maxBoxH);
  const x=(W-boxW)/2, y=(H-boxH)/2;
  ctx.save();
  ctx.shadowColor='rgba(22,35,61,.28)';
  ctx.shadowBlur=Math.round(base*0.02);
  ctx.shadowOffsetY=Math.round(base*0.006);
  ctx.fillStyle='#fff';
  roundRect(ctx,x,y,boxW,boxH,Math.round(fs*0.35));
  ctx.fill();
  ctx.restore();
  ctx.fillStyle='#16233D';
  ctx.textAlign='left';
  ctx.textBaseline='middle';
  const tx=x+padX;
  let cy=y+padY;
  for(const ln of layout){
    if(ln.blank){ cy+=gap; continue; }
    const midY=cy+lineH/2;
    if(ln.bullet) ctx.fillText(bullet, tx, midY);
    ctx.fillText(ln.text, tx+ln.indent, midY);
    cy+=lineH;
  }
}

// ---- bench preview ----
// A procedural pattern stands in for a real pattern so the bench preview shows
// the info box over *something*. Cached per size so it doesn't re-roll (and
// flicker) on every keystroke.
let _sampleTexture=null;
function sampleTexture(W,H){
  if(_sampleTexture && _sampleTexture.width===W && _sampleTexture.height===H) return _sampleTexture;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const ctx=c.getContext('2d');
  const g=ctx.createLinearGradient(0,0,W,H);
  g.addColorStop(0,'#d8cdbb'); g.addColorStop(1,'#bfb091');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  for(let i=0;i<90;i++){
    const x=Math.random()*W, y=Math.random()*H, r=4+Math.random()*Math.min(W,H)*0.07;
    ctx.fillStyle=`rgba(${90+Math.random()*120|0},${80+Math.random()*110|0},${65+Math.random()*85|0},.12)`;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  _sampleTexture=c; return c;
}
// background bitmap for the preview, cached per loaded file: once an original
// is on the bench we draw the real pattern so the preview matches the output
let _pvBitmap=null, _pvBitmapFile=null;
async function previewBackground(){
  const f=state.pngFile||state.jpgFile;
  if(!f){ _pvBitmap=null; _pvBitmapFile=null; return null; }
  if(_pvBitmapFile===f) return _pvBitmap;
  try{ _pvBitmap=await createImageBitmap(f); _pvBitmapFile=f; }
  catch(_){ _pvBitmap=null; _pvBitmapFile=null; }
  return _pvBitmap;
}
// render one of the three storefront layouts into the bench preview canvas.
// view: 'named' (name box) | 'clean' (watermark only) | 'storefront' (info box).
// The canvas is sized to the real image's aspect when an original is loaded so
// box proportions match the proof exactly; otherwise a square sample swatch.
export async function renderPreview(view, name, text){
  const canvas=$('#sf-preview'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const bmp=await previewBackground();
  const d = bmp ? fitDims(bmp.width,bmp.height,560) : {w:440,h:440};
  if(canvas.width!==d.w) canvas.width=d.w;
  if(canvas.height!==d.h) canvas.height=d.h;
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  if(bmp) ctx.drawImage(bmp,0,0,W,H);
  else ctx.drawImage(sampleTexture(W,H),0,0,W,H);
  drawWatermark(ctx,W,H);
  if(view==='named') drawNameBox(ctx,W,H, name||'pattern-name');
  else if(view==='storefront') drawInfoBox(ctx,W,H,text);
}

export async function makeProof(srcBitmap, kind, name, info){
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
  if(kind==='storefront') drawInfoBox(ctx,d.w,d.h,info);
  return canvasToBlob(canvas);
}
