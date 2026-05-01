// ============================================================
// Event Photo Share — Google Apps Script Backend
// ============================================================
// Deploy as: Execute as Me, Anyone can access (anonymous).
//
// Script Properties (set once in the Apps Script editor):
//   ADMIN_KEY        — long random string guarding admin actions
//   PARENT_FOLDER_ID — Drive folder ID for all event subfolders
//   EVENTS           — JSON array, initialise to []
// ============================================================

var props = PropertiesService.getScriptProperties();

// ── Helpers ──────────────────────────────────────────────────

function jsonResponse(data, status) {
  var output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function error(msg) {
  return jsonResponse({ ok: false, error: msg });
}

function getEvents() {
  var raw = props.getProperty('EVENTS');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveEvents(events) {
  props.setProperty('EVENTS', JSON.stringify(events));
}

function findEvent(token) {
  return getEvents().find(function(ev) {
    if (ev.token !== token) return false;
    if (ev.revoked) return false;
    if (ev.expiresAt && new Date(ev.expiresAt) < new Date()) return false;
    return true;
  }) || null;
}

function generateToken() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function validateAdminKey(key) {
  var adminKey = props.getProperty('ADMIN_KEY');
  if (!adminKey) return false;
  // Constant-time comparison to prevent timing attacks
  if (key.length !== adminKey.length) return false;
  var diff = 0;
  for (var i = 0; i < key.length; i++) {
    diff |= key.charCodeAt(i) ^ adminKey.charCodeAt(i);
  }
  return diff === 0;
}

function corsHeaders() {
  // Apps Script web apps don't support OPTIONS preflight.
  // Callers must use Content-Type: text/plain to avoid preflight.
  return {};
}

// ── GET handler ──────────────────────────────────────────────

function doGet(e) {
  var action = e.parameter.action;

  if (action === 'getEvent') {
    var token = e.parameter.token;
    if (!token) return error('Missing token');
    var ev = findEvent(token);
    if (!ev) return error('Invalid token');
    return jsonResponse({ ok: true, name: ev.name, createdAt: ev.createdAt });
  }

  return error('Unknown action');
}

// ── POST handler ─────────────────────────────────────────────

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return error('Invalid JSON body');
  }

  var action = body.action;

  if (action === 'upload') {
    return handleUpload(body);
  }
  if (action === 'createUploadSession') {
    return handleCreateUploadSession(body);
  }
  if (action === 'createEvent') {
    return handleCreateEvent(body);
  }
  if (action === 'listEvents') {
    return handleListEvents(body);
  }
  if (action === 'revokeEvent') {
    return handleRevokeEvent(body);
  }
  if (action === 'reopenEvent') {
    return handleReopenEvent(body);
  }

  return error('Unknown action');
}

// ── Action: upload ────────────────────────────────────────────
// Body: { action, token, filename, mimeType, data (base64) }
// Legacy fallback — prefer createUploadSession for larger files.

function handleUpload(body) {
  if (!body.token)    return error('Missing token');
  if (!body.filename) return error('Missing filename');
  if (!body.mimeType) return error('Missing mimeType');
  if (!body.data)     return error('Missing data');

  var ev = findEvent(body.token);
  if (!ev) return error('Invalid token');

  // Sanitise filename — strip path traversal, keep extension
  var safeName = body.filename.replace(/[^a-zA-Z0-9.\-_ ()]/g, '_');
  if (safeName.length === 0) safeName = 'photo';

  try {
    var folder = DriveApp.getFolderById(ev.folderId);
    var decoded = Utilities.base64Decode(body.data);
    var blob = Utilities.newBlob(decoded, body.mimeType, safeName);
    folder.createFile(blob);
    return jsonResponse({ ok: true });
  } catch (err) {
    Logger.log('Upload error: ' + err.toString());
    return error('Upload failed: ' + err.message);
  }
}

// ── Action: createUploadSession ───────────────────────────────
// Body: { action, token, filename, mimeType }
// Returns a short-lived OAuth token + folderId so the BROWSER can initiate
// the Drive resumable session itself. Browser-initiated sessions are required
// for CORS to work on the subsequent PUT: the browser's Origin header causes
// Drive to include Access-Control-Allow-Origin on the session responses.
// Token has full drive scope but expires in ~1 hour.

function handleCreateUploadSession(body) {
  if (!body.token)    return error('Missing token');
  if (!body.filename) return error('Missing filename');
  if (!body.mimeType) return error('Missing mimeType');

  var ev = findEvent(body.token);
  if (!ev) return error('Invalid token');

  var safeName = body.filename.replace(/[^a-zA-Z0-9.\-_ ()]/g, '_');
  if (safeName.length === 0) safeName = 'file';

  return jsonResponse({
    ok: true,
    uploadToken: ScriptApp.getOAuthToken(),
    folderId: ev.folderId,
    safeName: safeName,
  });
}

// ── Action: createEvent ───────────────────────────────────────
// Body: { action, adminKey, name, expiryDays? }

function handleCreateEvent(body) {
  if (!body.adminKey) return error('Missing adminKey');
  if (!validateAdminKey(body.adminKey)) return error('Invalid adminKey');

  var name = (body.name || '').trim();
  if (!name) return error('Missing event name');
  if (name.length > 100) return error('Event name too long');

  var expiryDays = parseInt(body.expiryDays, 10);
  if (isNaN(expiryDays) || expiryDays < 1) expiryDays = 14;
  if (expiryDays > 365) expiryDays = 365;
  var expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  var parentId = props.getProperty('PARENT_FOLDER_ID');
  if (!parentId) return error('PARENT_FOLDER_ID not configured');

  try {
    var parent = DriveApp.getFolderById(parentId);
    var subfolder = parent.createFolder(name + ' — ' + new Date().toISOString().slice(0, 10));
    var token = generateToken();
    var events = getEvents();
    events.push({
      token: token,
      name: name,
      folderId: subfolder.getId(),
      folderUrl: subfolder.getUrl(),
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt,
      revoked: false,
    });
    saveEvents(events);
    return jsonResponse({ ok: true, token: token, folderId: subfolder.getId(), folderUrl: subfolder.getUrl(), expiresAt: expiresAt });
  } catch (err) {
    Logger.log('createEvent error: ' + err.toString());
    return error('Failed to create event: ' + err.message);
  }
}

// ── Action: listEvents ────────────────────────────────────────
// Body: { action, adminKey }

function handleListEvents(body) {
  if (!body.adminKey) return error('Missing adminKey');
  if (!validateAdminKey(body.adminKey)) return error('Invalid adminKey');

  var events = getEvents().map(function(ev) {
    return {
      name: ev.name,
      token: ev.token,
      folderId: ev.folderId,
      folderUrl: ev.folderUrl,
      createdAt: ev.createdAt,
      expiresAt: ev.expiresAt || null,
      revoked: ev.revoked || false,
    };
  });

  return jsonResponse({ ok: true, events: events });
}

// ── Action: revokeEvent ───────────────────────────────────────
// Body: { action, adminKey, token }

function handleRevokeEvent(body) {
  if (!body.adminKey) return error('Missing adminKey');
  if (!validateAdminKey(body.adminKey)) return error('Invalid adminKey');
  if (!body.token) return error('Missing token');

  var events = getEvents();
  var ev = events.find(function(e) { return e.token === body.token; });
  if (!ev) return error('Event not found');
  ev.revoked = true;
  saveEvents(events);
  return jsonResponse({ ok: true });
}

// ── Action: reopenEvent ───────────────────────────────────────
// Body: { action, adminKey, token, expiryDays? }
// Clears revoked flag. If the event is expired, extends expiresAt.

function handleReopenEvent(body) {
  if (!body.adminKey) return error('Missing adminKey');
  if (!validateAdminKey(body.adminKey)) return error('Invalid adminKey');
  if (!body.token) return error('Missing token');

  var expiryDays = parseInt(body.expiryDays, 10);
  if (isNaN(expiryDays) || expiryDays < 1) expiryDays = 14;
  if (expiryDays > 365) expiryDays = 365;

  var events = getEvents();
  var ev = events.find(function(e) { return e.token === body.token; });
  if (!ev) return error('Event not found');

  ev.revoked = false;
  // Extend expiry if it is in the past (or missing)
  if (!ev.expiresAt || new Date(ev.expiresAt) < new Date()) {
    ev.expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
  }
  saveEvents(events);
  return jsonResponse({ ok: true, expiresAt: ev.expiresAt });
}
