// Builder session state — a single shared mutable object, imported by every
// module in the builder domain (live binding, identical to the old closure var).

export const state = {
  wmFile:null, wmBitmap:null,
  licFile:null,
  fmt:'jpg',
  pngFile:null, jpgFile:null,
  // bundle mode: one pattern in many colour variations. Each variation carries
  // its own png/jpg plus a pre-decoded bitmap (reused by both preview and build,
  // so we don't re-decode on every keystroke). The storefront proofs are a
  // mosaic — each variation owns one tile, showing its own slice of the image.
  bundleMode:false,
  variations:[],    // [{label, pngFile, jpgFile, bitmap}]
  sfText:'',        // storefront info text (bullets); persisted in localStorage
  fontFamily:'Space Mono',  // font for the proof name/info text; persisted
  blobs:{} // generated
};

export const PREVIEW_MAX = 2000;   // longest edge cap for storefront proofs
export const CROP_FRAC   = 0.42;   // centre crop fraction for proof 3

export const fmtMeta = () => state.fmt==='png'
  ? {ext:'png', mime:'image/png', q:undefined}
  : {ext:'jpg', mime:'image/jpeg', q:0.92};
