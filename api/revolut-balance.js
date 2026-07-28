// ============================================================
// GET /api/revolut-balance?account=<gocardless account id>
// Returns { amount, currency, amountChf } for one connected
// account. Converts to CHF (this dashboard's base currency for
// net worth) via the free, keyless frankfurter.app rate API when
// the account isn't already in CHF.
// ============================================================
const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

export default async function handler(req, res) {
  const accountId = req.query && req.query.account;
  if (!accountId) return res.status(400).json({ error: 'Missing account id.' });

  const secretId = process.env.GOCARDLESS_SECRET_ID;
  const secretKey = process.env.GOCARDLESS_SECRET_KEY;
  if (!secretId || !secretKey) {
    return res.status(500).json({ error: 'Server not configured (missing GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY).' });
  }

  try {
    const tokenRes = await fetch(GC_BASE + '/token/new/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_id: secretId, secret_key: secretKey }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) return res.status(500).json({ error: 'GoCardless auth failed', detail: tokenJson });
    const access = tokenJson.access;

    const balRes = await fetch(GC_BASE + '/accounts/' + encodeURIComponent(accountId) + '/balances/', {
      headers: { Authorization: 'Bearer ' + access },
    });
    const balJson = await balRes.json();
    if (!balRes.ok) return res.status(balRes.status).json({ error: 'Balance fetch failed', detail: balJson });

    const balances = balJson.balances || [];
    const pick = balances.find((b) => b.balanceType === 'interimAvailable')
      || balances.find((b) => b.balanceType === 'closingBooked')
      || balances[0];
    if (!pick) return res.status(404).json({ error: 'No balance returned for this account.' });

    const amount = parseFloat(pick.balanceAmount.amount);
    const currency = pick.balanceAmount.currency;
    let amountChf = amount;
    if (currency !== 'CHF') {
      try {
        const fxRes = await fetch('https://api.frankfurter.app/latest?amount=' + amount + '&from=' + currency + '&to=CHF');
        const fxJson = await fxRes.json();
        if (fxJson && fxJson.rates && typeof fxJson.rates.CHF === 'number') amountChf = fxJson.rates.CHF;
      } catch (e) { /* fall back to raw amount if the rate lookup fails */ }
    }

    res.status(200).json({ amount, currency, amountChf: Math.round(amountChf * 100) / 100 });
  } catch (e) {
    res.status(500).json({ error: e && e.message ? e.message : String(e) });
  }
}
