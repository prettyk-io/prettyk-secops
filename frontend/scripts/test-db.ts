// Script mode: test better-auth table creation
import { betterAuth } from 'better-auth';
import Database from 'better-sqlite3';

const dbPath = './spike-auth.db';
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

console.log('📁 DB opened:', dbPath);

const auth = betterAuth({
  database: db,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  trustedOrigins: ['http://localhost:5173'],
});

console.log('✅ betterAuth initialized');

// Check tables after a short delay (migrations are async)
setTimeout(() => {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
  console.log('📊 Tables:', tables.map(t => t.name).join(', ') || 'NONE');
  
  if (tables.length === 0) {
    console.log('⚠️ No tables — migrations may need explicit trigger');
    console.log('Try: auth.api.signUpEmail({ body: {...}, headers: new Headers() })');
  }
  
  db.close();
  process.exit(0);
}, 3000);