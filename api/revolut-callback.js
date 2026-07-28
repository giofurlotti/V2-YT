// ============================================================
// GET /api/revolut-callback?code=...&state=...
// Receives the OAuth code from TrueLayer, exchanges it for tokens,
// and bounces back to /finance.html with the tokens in the URL
// hash. The hash never reaches the server — only the browser
// reads it, then stores the tokens in localStorage.
//
// Env vars required on Vercel:
//   TRUELAYER_CLIENT_ID
//   TRUELAYER_CLIENT_SECRET
//
// The redirect_uri used here must be registered exactly (same
// scheme + host + path) as an allowed Redirect URI on the
// TrueLayer Console application — same requirement as WHOOP.
// ============================================================
export default async function handler(req, res) {
  const code = req.query && req.query.code;
  const errorParam = req.query && req.query.error;
  if (errorParam) return res.status(400).send('TrueLayer auth error: ' + errorParam);
  if (!code) return res.status(400).send('Missing code parameter.');

  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).send('Server not configured (missing TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET).');
  }

  // ALWAYS derive the redirect from the live host — TrueLayer sends the
  // browser back to whatever redirect_uri was used at login, so deriving
  // it here guarantees the token-exchange redirect_uri matches the
  // authorize redirect_uri, regardless of any env var.
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = proto + '://' + host + '/api/revolut-callback';

  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch('https://auth.truelayer.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await tokenRes.text();
    if (!tokenRes.ok) return res.status(500).send('TrueLayer token exchange failed: ' + text);
    let json;
    try { json = JSON.parse(text); } catch (e) {
      return res.status(500).send('TrueLayer returned non-JSON: ' + text);
    }

    const access = json.access_token || '';
    const refresh = json.refresh_token || '';
    const expiresIn = json.expires_in || 3600;
    const hash = new URLSearchParams({
      revolut_access: access,
      revolut_refresh: refresh,
      revolut_expires: String(Date.now() + expiresIn * 1000),
    }).toString();
    res.writeHead(302, { Location: '/finance.html#' + hash });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected error: ' + (e && e.message ? e.message : String(e)));
  }
}
