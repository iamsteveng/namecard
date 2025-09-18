/*
 Minimal test: login/register via Auth, then call Cards list with ID token.
 Usage: node scripts/test-cards-list.mjs
*/

const AUTH_BASE = process.env.AUTH_BASE || 'https://6kvci203w1.execute-api.ap-southeast-1.amazonaws.com/staging';
const CARDS_BASE = process.env.CARDS_BASE || 'https://v7h0gz3ozi.execute-api.ap-southeast-1.amazonaws.com/staging';

async function jsonPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

function tokenInfo(t) {
  if (!t || typeof t !== 'string') return { dotCount: 0, len: 0 };
  return { dotCount: (t.match(/\./g) || []).length, len: t.length };
}

(async () => {
  try {
    const email = `cli.cards.${Date.now()}@example.com`;
    const password = 'Passw0rd!';

    // Register then login (explicit)
    await jsonPost(`${AUTH_BASE}/register`, { email, password, name: 'Cards Test' });
    let { status, data } = await jsonPost(`${AUTH_BASE}/login`, { email, password });

    if (!data?.success) {
      console.error('Auth login failed:', status, data);
      process.exit(1);
    }

    const idToken = data.data?.session?.idToken;
    console.log('ID token info:', tokenInfo(idToken));

    const res = await fetch(`${CARDS_BASE}/`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const bodyText = await res.text();
    console.log('Cards list status:', res.status);
    try { console.log('Cards list JSON:', JSON.parse(bodyText)); }
    catch { console.log('Cards list raw:', bodyText); }
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  }
})();
