export function initializeRoles(db){
 db.exec(`
  UPDATE users SET role='superadmin'
  WHERE id=(SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1)
    AND NOT EXISTS(SELECT 1 FROM users WHERE role='superadmin');
  CREATE UNIQUE INDEX IF NOT EXISTS users_single_superadmin ON users(role) WHERE role='superadmin';
 `);
}
