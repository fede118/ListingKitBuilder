// =====================================================================
// GOOGLE SHEETS INVENTORY + DRIVE PICKER — shared config & session state
// =====================================================================
// One-time setup in Google Cloud Console (https://console.cloud.google.com):
//   1. Create a project → enable "Google Sheets API" + "Google Drive API".
//   2. OAuth consent screen → External → add your account as Test User.
//   3. Credentials → Create → OAuth 2.0 Client ID → Web application.
//      Add your GitHub Pages origin to Authorized JavaScript origins.
//   4. Paste the Client ID below.
// =====================================================================

export const GOOGLE_CLIENT_ID = '228023879001-4blf1jo5ara42ohqhrvrhvbd6scde7qs.apps.googleusercontent.com';
export const INV_SHEET_NAME   = 'Pattern Studio Inventory';
export const INV_FOLDER_NAME  = 'Pattern Studio';
export const INV_ID_PREFIX    = 'P';
export const INV_ID_WIDTH     = 6;
export const INV_HEADERS      = ['ID','Category','Title','Date Added','Source Link','Notes'];
export const CAT_SHEET_NAME   = 'Categories';

export const inv = {
  token: null, tokenClient: null,
  spreadsheetId: localStorage.getItem('ps_sheet') || null,
  folderId:      localStorage.getItem('ps_folder') || null,
  catSheetId: null,
  authResolve: null, authReject: null
};

export const invConfigured = () =>
  GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID';

// =====================================================================
// GOOGLE DRIVE PICKER  (the "From Drive" buttons on every drop zone)
// =====================================================================
// Lets you pull originals straight out of Drive instead of dropping them.
// Reuses the same OAuth sign-in with the drive.readonly scope, which lets the
// Picker render real image thumbnails (drive.file can't read files until after
// they're picked, so previews come up blank). Note: drive.readonly is a Google
// "restricted" scope — fine while the app is in Testing, but publishing to all
// users requires OAuth verification + a CASA security assessment.
//
// One-time setup, in addition to the OAuth Client ID above:
//   1. Same Google Cloud project → enable the "Google Picker API".
//   2. Credentials → Create → API key. Restrict it to the Picker API and to
//      your site's origin (HTTP referrers), then paste it below.
// Leave GOOGLE_API_KEY blank and the Drive buttons simply hide themselves.
// =====================================================================
export const GOOGLE_API_KEY = 'AIzaSyDN9zZ_EnYP6TXynv9nYjwjSqOAlfq_FhA';   // developer key for the Picker — see notes above
export const GOOGLE_APP_ID  = (GOOGLE_CLIENT_ID.split('-')[0]) || '';  // project number

export const driveConfigured = () => invConfigured() && !!GOOGLE_API_KEY;
