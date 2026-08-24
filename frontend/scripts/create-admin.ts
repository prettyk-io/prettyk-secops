/**
 * SPIKE-B-1: Create admin user + trigger Better Auth migrations.
 *
 * Запуск: npx tsx scripts/create-admin.ts
 */
import { auth } from '../src/auth/server/betterAuth';

async function main() {
  console.log('🔐 Creating admin user and triggering migrations...');

  try {
    const ctx = await auth.$context;

    // Try sign-up — this triggers migrations + creates user
    const result = await auth.api.signUpEmail({
      body: {
        email: 'admin@prettyk.io',
        password: 'admin123!',
        name: 'Boss Admin',
      },
      headers: new Headers({ 'Content-Type': 'application/json' }),
      query: {},
      // We need to provide a minimal context for the internal API call
    } as any);

    console.log('✅ Admin user created:', result?.user?.email ?? JSON.stringify(result).slice(0, 200));
  } catch (err: any) {
    console.error('❌ Error:', err?.message ?? err);
  }

  process.exit(0);
}

main();