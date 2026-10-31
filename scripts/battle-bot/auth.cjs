'use strict';
const toID = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
async function getAssertion(config, challenge, fetchImpl = fetch) {
  const password = config.passwordEnv && process.env[config.passwordEnv];
  if (config.passwordEnv && !password) throw new Error(`Missing environment variable ${config.passwordEnv}`);
  const url = new URL(config.loginServer || 'https://play.pokemonshowdown.com/action.php');
  if (url.protocol !== 'https:') throw new Error('Showdown authentication requires HTTPS.');
  const body = password ? new URLSearchParams({act: 'login', name: config.username, pass: password, challstr: challenge}) :
    new URLSearchParams({act: 'getassertion', userid: toID(config.username), challstr: challenge});
  const response = await fetchImpl(url, {method: 'POST', body, signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Login service HTTP ${response.status}`);
  const raw = (await response.text()).trim();
  let assertion;
  if (password) {
    let result;
    try {result = JSON.parse(raw.startsWith(']') ? raw.slice(1) : raw);} catch {throw new Error('Invalid login-service response.');}
    if (!(result.actionsuccess || result.curuser?.loggedin) || !result.assertion) throw new Error('Login rejected. Check account credentials and loginServer.');
    assertion = result.assertion;
  } else assertion = raw;
  if (typeof assertion !== 'string' || !assertion || assertion.startsWith(';')) throw new Error('This name requires a password. Configure passwordEnv for this bot account.');
  if (assertion.includes('\n') || assertion.includes('\r') || assertion.includes('<') || !assertion.includes(',')) throw new Error('Invalid assertion from login service.');
  return assertion;
}
module.exports = {getAssertion};
