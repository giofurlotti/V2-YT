// ============================================================
// GET /api/revolut-connect?country=IT
// Starts an Open Banking connection to Revolut via GoCardless
// Bank Account Data (formerly Nordigen). Creates an end-user
// agreement + requisition, then redirects the browser to the
// bank's own consent page. GoCardless redirects back to
// /api/revolut-callback once the user approves.
//
// Env vars required on Vercel:
//   GOCARDLESS_SECRET_ID
//   GOCARDLESS_SECRET_KEY
//   (free at https://bankaccountdata.gocardless.com/)
//
// `country` must be a 2-letter ISO code for an EU/EEA or UK
// country where the viewer's Revolut account is registered —
// GoCardless/Open Banking doesn't cover Switzerland or most
// non-EEA countries.
// ============================================================
const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

export default async function handler(req, res) {
  const country = String((req.query && req.query.country) || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) {
    return res.status(400).send('Missing or invalid country (expected a 2-letter code, e.g. IT, DE, FR).');
  }

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

    const instRes = await fetch(GC_BASE + '/institutions/?country=' + encodeURIComponent(country), {
      headers: { Authorization: 'Bearer ' + access },
    });
    const institutions = await instRes.json();
    const revolut = Array.isArray(institutions) ? institutions.find((i) => /revolut/i.test(i.name)) : null;
    if (!revolut) {
      return res.status(404).send('No Revolut institution found for country "' + country + '". Double-check the country your Revolut account is registered in.');
    }

    const agreementRes = await fetch(GC_BASE + '/agreements/enduser/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
      body: JSON.stringify({
        institution_id: revolut.id,
        max_historical_days: 0,
        access_valid_for_days: 90,
        access_scope: ['balances', 'details'],
      }),
    });
    const agreement = await agreementRes.json();
    if (!agreementRes.ok) return res.status(500).send('Agreement creation failed: ' + JSON.stringify(agreement));

    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const ref = 'giorgio-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

    const reqRes = await fetch(GC_BASE + '/requisitions/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + access },
      body: JSON.stringify({
        redirect: proto + '://' + host + '/api/revolut-callback?ref=' + encodeURIComponent(ref),
        institution_id: revolut.id,
        reference: ref,
        agreement: agreement.id,
        user_language: 'EN',
      }),
    });
    const requisition = await reqRes.json();
    if (!reqRes.ok) return res.status(500).send('Requisition creation failed: ' + JSON.stringify(requisition));

    res.writeHead(302, { Location: requisition.link });
    res.end();
  } catch (e) {
    res.status(500).send('Unexpected error: ' + (e && e.message ? e.message : String(e)));
  }
}
