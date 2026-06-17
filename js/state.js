// Builder session state — a single shared mutable object, imported by every
// module in the builder domain (live binding, identical to the old closure var).

export const state = {
  wmFile:null, wmBitmap:null,
  licFile:null,
  fmt:'jpg',
  pngFile:null, jpgFile:null,
  blobs:{} // generated
};

export const PREVIEW_MAX = 2000;   // longest edge cap for storefront proofs
export const CROP_FRAC   = 0.42;   // centre crop fraction for proof 3

export const fmtMeta = () => state.fmt==='png'
  ? {ext:'png', mime:'image/png', q:undefined}
  : {ext:'jpg', mime:'image/jpeg', q:0.92};
