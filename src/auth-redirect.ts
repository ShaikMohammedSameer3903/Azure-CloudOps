/**
 * auth-redirect.ts — Production-Grade MSAL Popup Redirect Bridge
 * 
 * Extracts the state parameter from the authentication response URL,
 * decodes the library state to retrieve the unique request UUID, and
 * broadcasts the response back to the parent tab via MSAL's native BroadcastChannel.
 */

console.log('[AUTH_REDIRECT] Broadcast bridge script starting...');

const getMsalStateId = (): string | null => {
  try {
    const params = new URLSearchParams(window.location.hash.substring(1) || window.location.search);
    const stateParam = params.get('state');
    if (!stateParam) {
      console.warn('[AUTH_REDIRECT] No state parameter found in URL.');
      return null;
    }

    // Split state parameter to get libraryState (MSAL format: userState|libraryState or just libraryState)
    const parts = stateParam.split('|');
    const libraryStateStr = parts[parts.length - 1];
    
    // Decode Base64 string to JSON
    const decoded = atob(libraryStateStr);
    const parsed = JSON.parse(decoded);
    
    console.log('[AUTH_REDIRECT] Parsed state ID:', parsed.id);
    return parsed.id || null;
  } catch (e) {
    console.error('[AUTH_REDIRECT] Failed to extract library state ID:', e);
    return null;
  }
};

const stateId = getMsalStateId();
const hash = window.location.hash || window.location.search;

if (stateId && hash) {
  console.log('[AUTH_REDIRECT] Initializing BroadcastChannel with state ID:', stateId);
  // Open the channel matching the unique request UUID
  const channel = new BroadcastChannel(stateId);
  
  // Post the payload inside the object structure expected by MSAL's onmessage listener
  channel.postMessage({
    payload: hash,
    v: 1
  });
  
  console.log('[AUTH_REDIRECT] Successfully broadcasted payload to parent window.');
  channel.close();
} else {
  console.error('[AUTH_REDIRECT] Missing state ID or authentication hash. Cannot bridge response.');
}

// Close the popup window
setTimeout(() => {
  console.log('[AUTH_REDIRECT] Closing popup window.');
  window.close();
}, 200);
