/**
 * SPIKE-B-7: Idempotent role assignment for existing Keycloak users.
 *
 * Запуск: npx tsx scripts/assign-keycloak-roles.ts
 */
const KEYCLOAK = 'http://127.0.0.1:8082';

async function main() {
  const tokenRes = await fetch(`${KEYCLOAK}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: 'admin' }),
  });
  const { access_token } = await tokenRes.json() as any;
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${access_token}` };

  // Fetch roles
  const rolesList = await (await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/roles`, { headers })).json() as any[];
  const roleIdMap: Record<string, string> = {};
  for (const r of rolesList) roleIdMap[r.name] = r.id;

  // Fetch users
  const usersList = await (await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/users`, { headers })).json() as any[];
  console.log('Existing users:', usersList.map(u => u.username).join(', '));

  const mapping: Record<string, string> = {
    'admin-sec': 'admin_sec',
    'admin-service': 'admin_service',
    'sec-expert': 'sec_expert',
    'user': 'user',
  };

  for (const u of usersList) {
    const roleName = mapping[u.username];
    if (!roleName) continue;
    const roleId = roleIdMap[roleName];
    if (!roleId) continue;

    const roleRes = await fetch(`${KEYCLOAK}/admin/realms/prettyk-dev/users/${u.id}/role-mappings/realm`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ id: roleId, name: roleName }]),
    });
    console.log(`   ${u.username} → ${roleName}: ${roleRes.status}`);
  }

  console.log('✅ Roles assigned');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });