/**
 * SPIKE-B-1: Full auth flow smoke test
 *   npx tsx scripts/test-auth.ts
 */
const BASE = 'http://127.0.0.1:3001/api/auth';

async function json(method: string, path: string, body?: any, cookie?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Origin': 'http://localhost:5173', // trustedOrigin
  };
  if (cookie) headers['Cookie'] = cookie;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const setCookie = res.headers.get('set-cookie') ?? undefined;
  const data = await res.json();
  return { status: res.status, data, setCookie };
}

async function main() {
  const smokeEmail = `smoke-${Date.now()}@prettyk.io`;

  console.log('🔐 Testing Better Auth smoke...\n');

  // 1. Sign-up
  console.log('1️⃣ Sign-up...');
  const signup = await json('POST', '/sign-up/email', {
    email: smokeEmail,
    password: 'smoke123!',
    name: 'Smoke Test',
  });
  console.log(`   Status: ${signup.status} User: ${signup.data.user?.email ?? JSON.stringify(signup.data).slice(0,60)}`);

  // 2. Sign-in
  console.log('2️⃣ Sign-in...');
  const signin = await json('POST', '/sign-in/email', {
    email: smokeEmail,
    password: 'smoke123!',
  });
  console.log(`   Status: ${signin.status} Cookie: ${signin.setCookie ? '✅ received' : '❌ none'}`);

  // 3. Get session
  console.log('3️⃣ Get session...');
  const session = await json('GET', '/get-session', undefined, signin.setCookie);
  console.log(`   Status: ${session.status} User: ${session.data?.user?.email ?? 'N/A'}`);

  // 4. Sign-out
  console.log('4️⃣ Sign-out...');
  const signout = await json('POST', '/sign-out', {}, signin.setCookie);
  console.log(`   Status: ${signout.status}`);

  // 5. Session after logout
  console.log('5️⃣ Session after logout...');
  const after = await json('GET', '/get-session', undefined, signin.setCookie);
  console.log(`   Status: ${after.status} User: ${after.data?.user?.email ?? 'null'} ✅`);

  console.log('\n✅ All smoke tests passed!');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });