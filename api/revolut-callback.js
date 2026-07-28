// ============================================================
// GET /api/revolut-callback?ref=...
// GoCardless redirects here once the viewer approves the Revolut
// connection. `ref` is the reference we generated and attached to
// the requisition in /api/revolut-connect — we look that
// requisition up (GoCardless doesn't echo the requisition id back
// itself) to read the resulting account id(s), then bounce back to
// /finance.html with them in the URL hash. The hash never reaches
// the server — only the browser reads it and stores it locally.
// ============================================================
const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

export default async function handler(req, res) {
  const ref = req.query && req.query.ref;
  const errorParam = req.query && req.query.error;
  if (errorParam) return res.status(400).send('Revolut connection error: ' + errorParam);
  if (!ref) return res.status(400).send('Missing ref parameter.');

  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;
  if (!secretId || !secretKey) {
    return res.status(500).send('Server not configured (missing GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY).');
  }

  try {
    const tokenRes = await fetch(GC_BASE + '/token/new/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) return res.status(500).send('GoCardless auth failed: ' + JSON.stringify(tokenJson));
    const access = tokenJson.access;

    let found = null;
    let url = GC_BASE + '/requisitions/?limit=100';
    for (let i = 0; i < 20 && url && !found; i++) {
      const listRes = await fetch(url, { headers: { Authorization: 'Bearer ' + access } });
      const list = await listRes.json();
      if (!listRes.ok) return res.status(500).send('Requisition lookup failed: ' + JSON.stringify(list));
      found = (list.results || []).find((r) => r.reference === ref);
      url = !found && list.next ? list.next : null;
    }
    if (!found) return res.status(404).send('Could not find the requisition for this connection. Try connecting again.');
    if (!found.accounts || !found.accounts.length) {
      return res.status(400).send('Revolut connection completed but no accounts were returned — the consent may have been declined.');
    }

    const hash = new URLSearchParams({
      revolut_accounts: JSON.stringify(found.accounts),
      revolut_requisition: found.id,
    }).toString();
    res.writeHead(302, { Location: '/finance.html#' + hash });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected error: ' + (e && e.message ? e.message : String(e)));
  }
}
