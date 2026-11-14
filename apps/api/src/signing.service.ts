import { createPrivateKey, createPublicKey, generateKeyPairSync, KeyObject, sign, verify } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Inject, Injectable } from '@nestjs/common';
import { canonicalJson } from '../../../packages/contract/canonical';
import { LeaseV1 } from '../../../packages/contract/policy';
import { DatabaseService } from './database.service';
import { nowSql } from './util';

const KID = 'ed25519-1';

export interface PublicSigningKey {
  kid: string;
  alg: 'Ed25519';
  status: string;
  publicKeyPem: string;
  publicKeyRaw: string;
}

@Injectable()
export class SigningService {
  private privateKey!: KeyObject;
  private publicKey!: KeyObject;
  kid = KID;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async init(): Promise<void> {
    const dir = process.env.SIGNING_DIR || join(process.cwd(), 'storage', 'keys');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, KID + '.pem');
    if (!existsSync(file)) {
      const pair = generateKeyPairSync('ed25519');
      writeFileSync(file, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
      this.privateKey = pair.privateKey;
      this.publicKey = pair.publicKey;
    } else {
      const pem = readFileSync(file, 'utf8');
      this.privateKey = createPrivateKey(pem);
      this.publicKey = createPublicKey(this.privateKey);
    }
    const raw = rawPublicKey(this.publicKey);
    const pem = this.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    await this.db.query(
      `INSERT INTO signing_keys (id, algorithm, public_key_pem, public_key_raw, status, created_at)
       VALUES (?, 'Ed25519', ?, ?, 'current', ?)
       ON DUPLICATE KEY UPDATE public_key_pem = VALUES(public_key_pem), public_key_raw = VALUES(public_key_raw), status = 'current'`,
      [KID, pem, raw, nowSql()],
    );
  }

  async publicKeys(): Promise<PublicSigningKey[]> {
    const rows = await this.db.query(
      'SELECT id, algorithm, public_key_pem, public_key_raw, status FROM signing_keys ORDER BY created_at',
    );
    return rows.map((row) => ({
      kid: String(row.id),
      alg: 'Ed25519',
      status: String(row.status),
      publicKeyPem: String(row.public_key_pem),
      publicKeyRaw: String(row.public_key_raw),
    }));
  }

  signLease(lease: LeaseV1): { lease: LeaseV1; signature: string; alg: 'Ed25519'; kid: string } {
    const bytes = Buffer.from(canonicalJson(lease), 'utf8');
    const signature = sign(null, bytes, this.privateKey);
    return {
      lease,
      signature: signature.toString('base64url'),
      alg: 'Ed25519',
      kid: this.kid,
    };
  }

  verifyLease(lease: LeaseV1, signature: string): boolean {
    const bytes = Buffer.from(canonicalJson(lease), 'utf8');
    return verify(null, bytes, this.publicKey, Buffer.from(signature, 'base64url'));
  }
}

function rawPublicKey(key: KeyObject): string {
  const der = key.export({ type: 'spki', format: 'der' }) as Buffer;
  if (der.length < 32) {
    throw new Error('Ed25519 public key is shorter than expected.');
  }
  return Buffer.from(der.subarray(der.length - 32)).toString('base64url');
}
