// The Google Drive Picker behind the "From Drive" buttons: load the Picker API,
// open it filtered to a mime set, and download the bytes of a chosen file.
import { GOOGLE_API_KEY, GOOGLE_APP_ID, inv } from './google-config.js';
import { invRequestToken } from './google-auth.js';
import { invReflectSignedIn } from './inventory.js';

let pickerApiLoaded = false;
function loadPickerApi(){
  return new Promise((res,rej)=>{
    if(pickerApiLoaded){ res(); return; }
    if(typeof gapi==='undefined'){ rej(new Error('Google API not loaded yet — try again in a moment.')); return; }
    gapi.load('picker', {
      callback: ()=>{ pickerApiLoaded=true; res(); },
      onerror:  ()=>rej(new Error('Picker failed to load.'))
    });
  });
}

// open the Picker filtered to the given mime types; resolves to the chosen
// doc ({id,name,mimeType,...}) or null if the user cancelled
export async function openDrivePicker(mimeTypes){
  if(!inv.token){
    await invRequestToken(false);
    invReflectSignedIn();   // keep the inventory panels in sync with this sign-in
  }
  await loadPickerApi();
  return new Promise((resolve, reject)=>{
    try{
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes((mimeTypes||[]).join(','))
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false)
        .setMode(google.picker.DocsViewMode.GRID);
      const picker = new google.picker.PickerBuilder()
        .setAppId(GOOGLE_APP_ID)
        .setOAuthToken(inv.token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .addView(view)
        .setCallback(data=>{
          if(data.action===google.picker.Action.PICKED) resolve(data.docs && data.docs[0]);
          else if(data.action===google.picker.Action.CANCEL) resolve(null);
        })
        .build();
      // The picker appends its iframe to <body> and grabs focus, which nudges
      // the page to scroll. Pin the scroll position so the page stays put.
      const sx=window.scrollX, sy=window.scrollY;
      const pin=()=>window.scrollTo(sx,sy);
      picker.setVisible(true);
      [0,50,150,300].forEach(t=>setTimeout(pin,t));
    }catch(e){ reject(e); }
  });
}

// download a picked Drive file's bytes and wrap them in a File
export async function driveDownload(doc){
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
    { headers:{ 'Authorization':'Bearer '+inv.token } });
  if(r.status===401){ await invRequestToken(true); return driveDownload(doc); }
  if(!r.ok) throw new Error('download failed ('+r.status+')');
  const blob = await r.blob();
  return new File([blob], doc.name || 'drive-file', { type: doc.mimeType || blob.type });
}
