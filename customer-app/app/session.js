let sessionToken = null;
export function setNativeSession(token) { sessionToken = token || null; }
export function getNativeSession() { return sessionToken; }
