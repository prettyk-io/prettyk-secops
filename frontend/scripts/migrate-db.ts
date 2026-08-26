/**
 * AUTH-PROD-3: Миграции More Auth не нужны.
 *
 * Таблицы создаются автоматически через drizzleAdapter при первом запуске auth-server.ts.
 * SQLite spike-auth.db больше не используется.
 *
 * Эта утилита сохранена для справки. Для продакшена она не нужна.
 */
console.log('⚠️  migrate-db.ts больше не нужен.');
console.log('   Таблицы Better Auth создаются автоматически через drizzleAdapter.');
console.log('   Используйте: npx tsx auth-server.ts');