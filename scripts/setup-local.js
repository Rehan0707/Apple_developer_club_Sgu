import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes, scryptSync } from 'node:crypto';
if (existsSync('.env')) { console.log('.env already exists; leaving it unchanged.'); process.exit(0); }
const password = randomBytes(18).toString('base64url');
const salt = randomBytes(16).toString('hex');
writeFileSync('.env', `LOCAL_PREVIEW=true\nHOST=127.0.0.1\nPORT=3001\nADMIN_USERNAME=admin\nADMIN_PASSWORD_HASH=${salt}:${scryptSync(password,salt,64).toString('hex')}\n`, { mode: 0o600 });
writeFileSync('.local-access.txt', `Local admin: http://127.0.0.1:3001/admin/login.html\nUsername: admin\nPassword: ${password}\n`, { mode: 0o600 });
console.log('Local setup created. Admin credentials are in .local-access.txt (gitignored).');
