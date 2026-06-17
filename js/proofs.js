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

export async function makeProof(srcBitmap, kind, name){
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
