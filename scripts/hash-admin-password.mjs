import {randomBytes,scryptSync} from 'node:crypto';

let input='';
process.stdin.setEncoding('utf8');
process.stderr.write('Enter the new admin password, then press Enter:\n');
for await (const chunk of process.stdin){input+=chunk;if(input.includes('\n'))break}
const password=input.split(/\r?\n/)[0]||'';
if(password.length<12){process.stderr.write('Password must be at least 12 characters.\n');process.exit(1)}
const salt=randomBytes(24).toString('base64url');
const hash=scryptSync(password,salt,64).toString('base64url');
process.stdout.write('scrypt$'+salt+'$'+hash+'\n');
