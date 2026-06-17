// Pure helpers — no DOM, no shared state.

export function sanitize(name){
  return name.trim().replace(/[\/\\:*?"<>|]+/g,'').replace(/\s+/g,' ').trim();
}
export function humanSize(b){
  if(b<1024) return b+' B';
  if(b<1048576) return (b/1024).toFixed(0)+' KB';
  return (b/1048576).toFixed(1)+' MB';
}
export function fitDims(w,h,cap){
  const long=Math.max(w,h);
  if(long<=cap) return {w,h};
  const k=cap/long;
  return {w:Math.round(w*k), h:Math.round(h*k)};
}
export function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
