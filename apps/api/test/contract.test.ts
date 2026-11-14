import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../../../packages/contract/canonical';
import { LeaseV1, assembleLease, decideAccess, effectiveStatus } from '../../../packages/contract/policy';

const root = resolve(__dirname, '../../..');
const php = process.env.PHP_BIN || 'C:\\xampp\\php\\php.exe';

function runPhp(script: string, arg: string) {
  return spawnSync(php, ['-d', 'extension=sodium', script, arg], { encoding: 'utf8' });
}
const expects = [
  '{"a":{"c":"x","d":true},"b":1}',
  '{"m":"Cafe é"}',
  '{"q":"say \\"hi\\"\\n"}',
  '{"a":[],"b":{}}',
  '{"x":0,"y":false,"z":null}',
];

test('canonical JSON matches the published vectors', () => {
  const values = JSON.parse(readFileSync(join(root, 'packages/contract/vectors.json'), 'utf8')) as unknown[];
  values.forEach((value, index) => {
    assert.equal(canonicalJson(value), expects[index]);
  });
});

test('PHP canonical JSON matches the TypeScript bytes', () => {
  const run = runPhp(join(root, 'examples/php/canonical.php'), join(root, 'packages/contract/vectors.json'));
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const lines = run.stdout.trim().split(/\r?\n/);
  assert.deepEqual(lines, expects);
});

test('access decisions match in TypeScript and PHP', () => {
  const cases = JSON.parse(readFileSync(join(root, 'packages/contract/decisions.json'), 'utf8')) as Array<{
    name: string;
    now: number;
    transportFailed: boolean;
    fresh: LeaseV1 | null;
    stored: LeaseV1 | null;
    access: string;
    source: string;
    reason: string;
  }>;
  for (const item of cases) {
    const decision = decideAccess(item);
    assert.equal(decision.access, item.access, item.name);
    assert.equal(decision.source, item.source, item.name);
    assert.equal(decision.reason, item.reason, item.name);
  }
  const run = runPhp(join(root, 'examples/php/decide.php'), join(root, 'packages/contract/decisions.json'));
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const lines = run.stdout.trim().split(/\r?\n/);
  lines.forEach((line, index) => {
    assert.deepEqual(JSON.parse(line), {
      access: cases[index].access,
      source: cases[index].source,
      reason: cases[index].reason,
    });
  });
});

test('PHP libsodium verifies a Node Ed25519 lease signature', () => {
  const pair = generateKeyPairSync('ed25519');
  const lease = assembleLease({
    now: 1700000000,
    product: 'crm',
    subscriptionId: 'sub',
    licenseKeyId: 'key',
    instanceId: 'instance-1',
    verdict: 'active',
    status: 'active',
    termStartsAt: '2026-01-01',
    termEndsAt: '2027-01-01',
    graceDays: 14,
    seatUnit: 'user',
    seatLimit: 5,
    seatsUsed: 2,
    enforceSeats: false,
    entitlementsMode: 'all',
    features: [],
    limits: {},
    bindingKind: 'host',
    bindingPolicy: 'bind_first',
    bindingValue: 'crm.client.com',
    allowed: ['crm.client.com'],
    channel: 'stable',
    latest: null,
    pinned: null,
    minimum: null,
    hasPackage: false,
    blockOutdated: false,
    reportedVersion: '1.0.0',
    commands: [],
  });
  const canonical = canonicalJson(lease);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), pair.privateKey);
  assert.equal(verify(null, Buffer.from(canonical, 'utf8'), pair.publicKey, signature), true);
  const der = pair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
  const file = join(mkdtempSync(join(tmpdir(), 'altamid-')), 'sig.json');
  writeFileSync(
    file,
    JSON.stringify({
      publicKeyRaw: Buffer.from(der.subarray(der.length - 32)).toString('base64url'),
      canonical,
      signature: signature.toString('base64url'),
    }),
  );
  const run = runPhp(join(root, 'examples/php/verify_sig.php'), file);
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.equal(run.stdout.trim(), 'ok');
});

test('term dates drive grace and expiry', () => {
  assert.equal(effectiveStatus('active', '2026-01-01', '2026-01-10', 14, Date.parse('2026-01-10T23:59:59Z')), 'active');
  assert.equal(effectiveStatus('active', '2026-01-01', '2026-01-10', 14, Date.parse('2026-01-11T00:00:00Z')), 'grace');
  assert.equal(effectiveStatus('active', '2026-01-01', '2026-01-10', 14, Date.parse('2026-01-25T00:00:00Z')), 'expired');
  assert.equal(effectiveStatus('revoked', '2026-01-01', '2027-01-01', 14, Date.parse('2026-06-01T00:00:00Z')), 'revoked');
  assert.equal(effectiveStatus('active', '2026-06-01', '2027-01-01', 14, Date.parse('2026-01-01T00:00:00Z')), 'not_started');
});

test('seat enforcement and blocked updates change the verdict', () => {
  const base = {
    now: 1700000000,
    product: 'crm',
    subscriptionId: 'sub',
    licenseKeyId: 'key',
    instanceId: 'instance-1',
    verdict: 'active' as const,
    status: 'active',
    termStartsAt: '2026-01-01',
    termEndsAt: '2027-01-01',
    graceDays: 14,
    seatUnit: 'user',
    seatLimit: 2,
    seatsUsed: 3,
    enforceSeats: true,
    entitlementsMode: 'all' as const,
    features: [],
    limits: {},
    bindingKind: 'host' as const,
    bindingPolicy: 'any' as const,
    bindingValue: 'crm.client.com',
    allowed: [],
    channel: 'stable',
    latest: '1.4.0',
    pinned: null,
    minimum: null,
    hasPackage: false,
    blockOutdated: false,
    reportedVersion: '1.0.0',
    commands: [],
  };
  const over = assembleLease(base);
  assert.equal(over.verdict, 'seats_exceeded');
  assert.equal(over.usable, false);
  const update = assembleLease({ ...base, seatsUsed: 1, blockOutdated: true });
  assert.equal(update.verdict, 'update_required');
  assert.equal(update.release.mustUpdate, true);
  assert.equal(update.usable, false);
});

test('outlet subscriptions add usable outlets to the main lease', () => {
  const base = {
    now: 1700000000,
    product: 'hrms-payroll',
    subscriptionId: 'main',
    licenseKeyId: 'key',
    instanceId: 'instance-1',
    verdict: 'active' as const,
    status: 'active',
    termStartsAt: '2026-01-01',
    termEndsAt: '2027-01-01',
    graceDays: 14,
    seatUnit: 'employee',
    seatLimit: null,
    seatsUsed: 30,
    enforceSeats: false,
    entitlementsMode: 'all' as const,
    features: [],
    limits: {},
    bindingKind: 'host' as const,
    bindingPolicy: 'any' as const,
    bindingValue: 'hr.client.com',
    allowed: [],
    channel: 'stable',
    latest: null,
    pinned: null,
    minimum: null,
    hasPackage: false,
    blockOutdated: false,
    reportedVersion: '1.0.0',
    commands: [],
  };
  assert.equal(assembleLease(base).outlets, undefined);
  const lease = assembleLease({
    ...base,
    mainOutletSeats: 14,
    extraOutlets: [
      { subscriptionId: 'blr', verdict: 'active', termEndsAt: '2026-12-31', seatLimit: null, seatsUsed: 9, enforceSeats: false },
      { subscriptionId: 'us', verdict: 'expired', termEndsAt: '2026-06-30', seatLimit: null, seatsUsed: 4, enforceSeats: false },
      { subscriptionId: 'pune', verdict: 'active', termEndsAt: '2026-12-31', seatLimit: 5, seatsUsed: 6, enforceSeats: true },
    ],
  });
  assert.equal(lease.outlets?.allowed, 2);
  assert.deepEqual(lease.outlets?.units.map((unit) => [unit.subscriptionId, unit.main, unit.verdict, unit.usable]), [
    ['main', true, 'active', true],
    ['blr', false, 'active', true],
    ['us', false, 'expired', false],
    ['pune', false, 'seats_exceeded', false],
  ]);
  assert.equal(lease.outlets?.units[0].seatsUsed, 14);
  assert.equal(lease.outlets?.units[1].termEndsAt, '2026-12-31T23:59:59Z');
  assert.doesNotThrow(() => canonicalJson(lease));
  const capped = { ...base, seatLimit: 20, enforceSeats: true, seatsUsed: 35, mainOutletSeats: 18, extraOutlets: [{ subscriptionId: 'blr', verdict: 'active' as const, termEndsAt: '2026-12-31', seatLimit: null, seatsUsed: 17, enforceSeats: false }] };
  assert.equal(assembleLease(capped).usable, true);
  assert.equal(assembleLease({ ...capped, mainOutletSeats: 21 }).verdict, 'seats_exceeded');
  const dead = assembleLease({ ...base, verdict: 'suspended', extraOutlets: [{ subscriptionId: 'blr', verdict: 'active', termEndsAt: '2026-12-31', seatLimit: null, seatsUsed: 1, enforceSeats: false }] });
  assert.equal(dead.outlets?.allowed, 0);
  assert.equal(dead.outlets?.units[1].usable, false);
});
