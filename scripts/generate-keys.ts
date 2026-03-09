/**
 * Generate RSA Key Pair for JWT Signing
 * Run with: npx tsx scripts/generate-keys.ts
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const keysDir = path.resolve(__dirname, '../keys');

// Ensure keys directory exists
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

// Generate RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

// Write keys to files
fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);

console.log('✅ RSA key pair generated successfully!');
console.log(`   Private key: ${path.join(keysDir, 'private.pem')}`);
console.log(`   Public key:  ${path.join(keysDir, 'public.pem')}`);
