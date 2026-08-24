/**
 * SPIKE-B-7: Keycloak realm setup — prettyk-dev realm, client, roles, users.
 *
 * Запуск: npx tsx scripts/setup-keycloak.ts
 * Использует Admin REST API (admin/admin).
 */
const KEYCLOAK = 'http://127.0.0.1:8082';

async function main() {
  console.log('🔑 Setting up Keycloak prettyk-dev realm...\n');

  // 1. Get admin token
  const tokenRes = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: 'admin',
    }),
  });
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) {
    console.error('❌ Admin auth failed:', tokenData);
    process.exit(1);
  }
  const adminToken = tokenData.access_token;
  console.log('✅ Admin authenticated');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
  };

  // 2. Create realm prettyk-dev
  console.log('2️⃣ Creating realm prettyk-dev...');
  const realmRes = await fetch(`${KEYCLOAK}/admin/realms`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      realm: 'prettyk-dev',
      enabled: true,
      displayName: 'PrettyK Dev',
    }),
  });
  console.log(`   Realm status: ${realmRes.status}`);

  // 3. Create public client prettyk-editor (PKCE)
  console.log('3️⃣ Creating client prettyk-editor...');
  const clientRes = await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/clients`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      clientId: 'prettyk-editor',
      publicClient: true,
      enabled: true,
      protocol: 'openid-connect',
      directAccessGrantsEnabled: true,
      redirectUris: [
        'http://localhost:5173/*',
        'http://127.0.0.1:5173/*',
      ],
      webOrigins: ['+'],
      standardFlowEnabled: true,
    }),
  });
  console.log(`   Client status: ${clientRes.status}`);

  // 4. Create realm roles
  console.log('4️⃣ Creating roles...');
  const roles = ['admin_sec', 'admin_service', 'sec_expert', 'user'];
  for (const role of roles) {
    const roleRes = await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/roles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: role }),
    });
    console.log(`   Role ${role}: ${roleRes.status}`);
  }

  // 5. Create test users (one per role)
  console.log('5️⃣ Creating test users...');

  // Fetch role IDs first
  const rolesRes = await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/roles`, { headers });
  const rolesList = await rolesRes.json() as any[];
  const roleIdMap: Record<string, string> = {};
  for (const r of rolesList) roleIdMap[r.name] = r.id;

  const users = [
    { username: 'admin-sec', email: 'admin-sec@prettyk.io', role: 'admin_sec', name: 'Администратор ИБ' },
    { username: 'admin-service', email: 'admin-service@prettyk.io', role: 'admin_service', name: 'Администратор' },
    { username: 'sec-expert', email: 'sec-expert@prettyk.io', role: 'sec_expert', name: 'Эксперт ИБ' },
    { username: 'user', email: 'user@prettyk.io', role: 'user', name: 'Пользователь' },
  ];

  for (const u of users) {
    const userRes = await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: u.username,
        email: u.email,
        enabled: true,
        emailVerified: true,
        firstName: u.name,
        credentials: [{ type: 'password', value: 'verysecure', temporary: false }],
      }),
    });

    if (userRes.status === 201) {
      const location = userRes.headers.get('location');
      const userId = location?.split('/').pop();
      console.log(`   User ${u.username}: created (${userId})`);

      // Assign realm role by ID
      const roleId = roleIdMap[u.role];
      const roleRes = await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/users/${userId}/role-mappings/realm`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{ id: roleId, name: u.role }]),
      });
      console.log(`     Role ${u.role}: ${roleRes.status}`);
    } else {
      console.log(`   User ${u.username}: ${userRes.status} (may already exist)`);
    }
  }

  console.log('\n✅ Keycloak setup complete!');
  console.log('   Admin Console: http://localhost:8082 (admin/admin)');
  console.log('   Realm: prettyk-dev');
  console.log('   Client: prettyk-editor (public, PKCE)');
}

main().catch(e => { console.error('❌', e); process.exit(1); });