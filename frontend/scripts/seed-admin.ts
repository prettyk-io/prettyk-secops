/**
 * AUTH-PROD-3: Seed admin user on first startup.
 *
 * Использует Better Auth API client для создания пользователя.
 * Миграции выполняются автоматически через drizzleAdapter.
 */
import { authClient } from '../src/auth/clientAuth';
import { pgPool } from '../src/auth/server/db/pg';

async function main() {
  console.log('🌱 Seeding admin user...');

  try {
    // Wait for PostgreSQL to be ready
    await pgPool.query('SELECT 1');
    console.log('   PostgreSQL ready.');
  } catch (err: any) {
    console.error('❌ PostgreSQL not available:', err.message);
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL || 'admin@prettyk.io';
  const password = process.env.ADMIN_PASSWORD || 'admin123!';
  const name = process.env.ADMIN_NAME || 'Boss Admin';

  try {
    // Import directly from the auth instance (not client — server-side)
    const { auth } = await import('../src/auth/server/betterAuth');

    // Try to create the admin user
    try {
      await auth.api.signUpEmail({
        body: { email, password, name },
        headers: new Headers({ 'Content-Type': 'application/json' }),
        query: {},
      } as any);
      console.log(`✅ Admin user created: ${email}`);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      if (msg.includes('already exists') || msg.includes('duplicate') || msg.includes('unique')) {
        console.log(`   Admin user already exists: ${email}`);
      } else {
        console.error('❌ Admin creation error:', msg);
      }
    }
  } catch (err: any) {
    console.error('❌ Seed error:', err?.message ?? err);
  }

  await pgPool.end();
  process.exit(0);
}

main();