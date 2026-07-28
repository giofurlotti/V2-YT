// ============================================================
// POST /api/revolut-refresh   body: { refresh_token }
// Exchanges a TrueLayer refresh token for a new access token.
// Mirrors api/whoop-refresh.js.
// ============================================================
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const clientSecret = process.env.TRUELAYER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Server not configured (missing TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET).' });
  }

  let refreshToken;
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    refreshToken = body.refresh_token;
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh_token.' });

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    const r = await fetch('https://auth.truelayer.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const text = await r.text();
    if (!r.ok) return res.status(500).json({ error: 'TrueLayer refresh failed', detail: text });
    let json;
    try { json = JSON.parse(text); } catch (e) {
      return res.status(500).json({ error: 'TrueLayer returned non-JSON', detail: text });
    }
    res.status(200).json(json);
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : String(e) });
  }
}
