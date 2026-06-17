// Drop-zone wiring: click/drag/drop a file, pull one "From Drive", or clear it.
// Shared by both the bench (watermark/license) and the new-listing originals.
import { $ } from './dom.js';
import { openDrivePicker, driveDownload } from './google-picker.js';

// ---- file binding for a drop zone ----
export function bindZone(zoneSel, inputSel, accept, onLoad, driveMimes, onClear){
  const zone=$(zoneSel), input=$(inputSel);
  const set = async file => {
    if(!file) return;
    if(accept && !accept(file)){ flash(zone); return; }
    // Snapshot the bytes into memory now, while the file is definitely
    // readable. A native-picker/drop File is just a handle to the file on
    // disk — if that file is moved or re-exported before the next build,
    // reading it (e.g. JSZip on a reused license) throws NotFoundError.
    // An in-memory copy is immune to that.
    let stable = file;
    try{
      const buf = await file.arrayBuffer();
      stable = new File([buf], file.name, { type:file.type });
    }catch(_){ /* keep the original File if the snapshot fails */ }
    onLoad(stable, zone);
  };
  zone.addEventListener('click',()=>input.click());
  input.addEventListener('change',e=>set(e.target.files[0]));
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('over')});
  zone.addEventListener('dragleave',()=>zone.classList.remove('over'));
  zone.addEventListener('drop',e=>{
    e.preventDefault();zone.classList.remove('over');
    set(e.dataTransfer.files[0]);
  });

  // "From Drive" button — opens the Google Picker, downloads the chosen file.
  // Visibility is decided in init (after the Google config consts are defined).
  const driveBtn = zone.querySelector('.dz-drive');
  if(driveBtn){
    driveBtn.addEventListener('click', async e=>{
      e.stopPropagation();   // don't also trigger the zone's file dialog
      const label = driveBtn.textContent;
      driveBtn.disabled=true; driveBtn.textContent='Opening…';
      try{
        const doc = await openDrivePicker(driveMimes);
        if(doc){
          driveBtn.textContent='Downloading…';
          set(await driveDownload(doc));
        }
      }catch(err){
        flash(zone);
        markSub(zone, 'Drive: '+(err.message||err));
      }finally{
        driveBtn.disabled=false; driveBtn.textContent=label;
      }
    });
  }

  // "×" clear button — drops the file and its persisted copy. Shown only
  // while the zone is loaded (CSS keys off .drop.loaded).
  const clearBtn = zone.querySelector('.dz-clear');
  if(clearBtn && onClear){
    clearBtn.addEventListener('click', e=>{
      e.stopPropagation();   // don't also trigger the zone's file dialog
      onClear(zone);
    });
  }
}
export function markSub(zone, text){
  const sub=zone.querySelector('.dz-sub'); if(sub) sub.textContent=text;
}
export function flash(zone){
  zone.classList.add('over');
  setTimeout(()=>zone.classList.remove('over'),300);
}
export function markLoaded(zone,mainText,subText){
  zone.classList.add('loaded');
  zone.querySelector('.dz-main').textContent=mainText;
  zone.querySelector('.dz-sub').textContent=subText;
}
export function markCleared(zone,mainText){
  zone.classList.remove('loaded');
  zone.querySelector('.dz-main').textContent=mainText;
  zone.querySelector('.dz-sub').textContent='or click to choose';
  const input=zone.querySelector('input[type=file]'); if(input) input.value='';
}
