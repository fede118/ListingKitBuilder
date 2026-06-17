// All Google Sheets / Drive REST calls for the inventory: the fetch wrapper,
// 401 retry, sheet/folder provisioning, row helpers, and category CRUD.
import {
  inv, INV_SHEET_NAME, INV_FOLDER_NAME, INV_ID_PREFIX, INV_ID_WIDTH,
  INV_HEADERS, CAT_SHEET_NAME
} from './google-config.js';
import { invRequestToken } from './google-auth.js';

// ---- API helpers ----
export async function invCall(url, opts={}){
  const r = await fetch(url, {
    ...opts,
    headers:{'Authorization':'Bearer '+inv.token,'Content-Type':'application/json',...(opts.headers||{})}
  });
  if(r.status===401){ const e=new Error('auth'); e.status=401; throw e; }
  if(!r.ok){ let m='API error '+r.status; try{const j=await r.json();m=j.error?.message||m;}catch(_){} throw new Error(m); }
  return r.json();
}
export async function invWithRetry(fn){
  try{ return await fn(); }
  catch(e){ if(e.status===401){ await invRequestToken(true); return fn(); } throw e; }
}

// ---- provisioning ----
export async function invEnsureFolder(){
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
export async function invEnsureSheet(){
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
export async function invGetRows(){
  const r=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/A:F`);
  return r.values || [INV_HEADERS];
}
export function invNextId(rows){
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
export async function invEnsureCatSheet(){
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
export async function invGetCategories(){
  const r=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A2:A`);
  return (r.values||[]).map(row=>row[0]).filter(Boolean);
}
export async function invAddCategory(name){
  await invCall(
    `https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A:A:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {method:'POST',body:JSON.stringify({values:[[name]]})}
  );
}
export async function invDeleteCategory(name){
  const r=await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}/values/${CAT_SHEET_NAME}!A:A`);
  const vals=r.values||[];
  const rowIdx=vals.findIndex((row,i)=>i>0&&row[0]===name);
  if(rowIdx<0) return;
  await invCall(`https://sheets.googleapis.com/v4/spreadsheets/${inv.spreadsheetId}:batchUpdate`,{
    method:'POST',
    body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:inv.catSheetId,dimension:'ROWS',startIndex:rowIdx,endIndex:rowIdx+1}}}]})
  });
}
export async function invRenameCategory(oldName, newName){
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
