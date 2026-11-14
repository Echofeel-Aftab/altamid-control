import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { join } from 'node:path';
import { LeaseV1 } from '../../../packages/contract/policy';
import { ControlService } from '../src/control.service';
import { DatabaseService } from '../src/database.service';
import { SigningService } from '../src/signing.service';

process.env.DB_NAME = 'altamid_control_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.CONTROL_ADMIN_EMAIL = 'admin@altamidsolutions.com';
process.env.CONTROL_ADMIN_PASSWORD = 'test-admin-pass-123';
process.env.SIGNING_DIR = join(process.cwd(), 'storage', 'test-keys');

const db = new DatabaseService();
const signing = new SigningService(db);
const control = new ControlService(db, signing);
let token = '';
let customerId = '';
let subscriptionId = '';
let licenseKey = '';
let keyId = '';

async function reset(): Promise<void> {
  const tables = [
    'commands',
    'instances',
    'license_keys',
    'audit_log',
    'subscriptions',
    'offers',
    'releases',
    'plans',
    'customers',
    'products',
    'staff_users',
  ];
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of tables) await db.query('DELETE FROM ' + table);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  await control.seed();
}

async function asOwner(): Promise<{ id: string; email: string; name: string; role: 'owner'; status: string }> {
  const header = 'Bearer ' + token;
  const staff = await control.requireStaff(header, 'subscribers');
  return staff as { id: string; email: string; name: string; role: 'owner'; status: string };
}

after(async () => {
  if (db.pool) await db.pool.end();
});

describe('lease check against MariaDB', () => {
  before(async () => {
    await db.init();
    await signing.init();
    await reset();
    const login = await control.login('admin@altamidsolutions.com', 'test-admin-pass-123', '127.0.0.1');
    token = login.token;
  });

  it('issues a key and accepts the first host', async () => {
    const actor = await asOwner();
    const customer = await control.createCustomer(actor, { name: 'Northwind Traders', contactEmail: 'owner@northwind.test' }, '127.0.0.1');
    customerId = String(customer.id);
    const subscription = await control.createSubscription(
      actor,
      { customerId, productCode: 'crm', planCode: 'growth' },
      '127.0.0.1',
    );
    subscriptionId = String(subscription.id);
    const issued = await control.issueKey(actor, subscriptionId, 'Production', '127.0.0.1');
    licenseKey = String(issued.licenseKey);
    keyId = String(issued.id);
    assert.match(licenseKey, /^AS1\.CRM\.[0-9A-HJKMNP-TV-Z]{20}$/);

    const signed = await control.checkLease(
      {
        product: 'crm',
        license_key: licenseKey,
        instance_id: 'install-northwind-1',
        host: 'Crm.Northwind.Test',
        runtime: 'php',
        version: '1.3.9',
        usage: { seats: 4 },
      },
      '127.0.0.1',
    );
    assert.equal(signing.verifyLease(signed.lease, signed.signature), true);
    assert.equal(signed.lease.usable, true);
    assert.equal(signed.lease.verdict, 'active');
    assert.equal(signed.lease.binding.value, 'crm.northwind.test');
    assert.deepEqual(signed.lease.binding.allowed, ['crm.northwind.test']);
    const again = await control.getSubscription(subscriptionId);
    assert.equal((again.instances as unknown[]).length, 1);
  });

  it('rejects a second host and a second install until binding is reset', async () => {
    const mismatch = await control.checkLease(
      {
        product: 'crm',
        licenseKey: licenseKey,
        instanceId: 'install-other',
        binding: 'other.example',
        runtime: 'php',
        version: '1.3.9',
      },
      '127.0.0.1',
    );
    assert.equal(mismatch.lease.verdict, 'binding_mismatch');
    assert.equal(mismatch.lease.usable, false);
    const capped = await control.checkLease(
      {
        product: 'crm',
        license_key: licenseKey,
        instance_id: 'install-second-slot',
        host: 'crm.northwind.test',
        runtime: 'node',
        version: '1.3.9',
      },
      '127.0.0.1',
    );
    assert.equal(capped.lease.verdict, 'instance_limit');
    const actor = await asOwner();
    await control.resetBinding(actor, subscriptionId, '127.0.0.1');
    const rebound = await control.checkLease(
      {
        product: 'crm',
        license_key: licenseKey,
        instance_id: 'install-northwind-1',
        host: 'crm.northwind.test',
        runtime: 'php',
        version: '1.3.9',
      },
      '127.0.0.1',
    );
    assert.equal(rebound.lease.usable, true);
  });

  it('keeps a mismatched product and an unknown key from looking like a valid lease', async () => {
    const wrong = await control.checkLease(
      { product: 'hrms-payroll', license_key: licenseKey, instance_id: 'install-northwind-1', host: 'hr.northwind.test' },
      '127.0.0.1',
    );
    assert.equal(wrong.lease.verdict, 'product_mismatch');
    assert.equal(wrong.lease.subscriptionId, '');
    assert.equal(signing.verifyLease(wrong.lease, wrong.signature), true);
    const missing = await control.checkLease(
      { product: 'crm', license_key: 'AS1.CRM.NOTAREALKEY00000000', instance_id: 'install-northwind-1' },
      '127.0.0.1',
    );
    assert.equal(missing.lease.verdict, 'unknown_key');
    assert.equal(missing.lease.usable, false);
  });

  it('revokes on the next check-in and can require an update', async () => {
    const actor = await asOwner();
    await control.createRelease(actor, 'crm', { version: '1.4.0', channel: 'stable', notes: 'Safer follow-up rules.' }, '127.0.0.1');
    const product = await control.getProduct('crm');
    const release = (product.releases as Array<{ id: string; version: string }>).find((item) => item.version === '1.4.0');
    assert.ok(release);
    await control.publishRelease(actor, release.id, '127.0.0.1');
    const offered = await control.checkLease(
      { product: 'crm', license_key: licenseKey, instance_id: 'install-northwind-1', host: 'crm.northwind.test', version: '1.3.9', runtime: 'php' },
      '127.0.0.1',
    );
    assert.equal(offered.lease.usable, true);
    assert.equal(offered.lease.release.latest, '1.4.0');
    assert.equal(offered.lease.release.mustUpdate, true);

    await control.updateSubscription(actor, subscriptionId, { blockOutdated: true, enforceSeatLimit: true, seatLimit: 2 }, '127.0.0.1');
    const blocked = await control.checkLease(
      {
        product: 'crm',
        license_key: licenseKey,
        instance_id: 'install-northwind-1',
        host: 'crm.northwind.test',
        version: '1.3.9',
        runtime: 'php',
        usage: { seats: 5 },
      },
      '127.0.0.1',
    );
    assert.equal(blocked.lease.verdict, 'seats_exceeded');
    assert.equal(blocked.lease.usable, false);

    await control.updateSubscription(actor, subscriptionId, { enforceSeatLimit: false, seatLimit: null }, '127.0.0.1');
    const versionBlock = await control.checkLease(
      { product: 'crm', license_key: licenseKey, instance_id: 'install-northwind-1', host: 'crm.northwind.test', version: '1.3.9', runtime: 'php' },
      '127.0.0.1',
    );
    assert.equal(versionBlock.lease.verdict, 'update_required');

    await control.revokeKey(actor, subscriptionId, keyId, '127.0.0.1');
    const revoked = await control.checkLease(
      { product: 'crm', license_key: licenseKey, instance_id: 'install-northwind-1', host: 'crm.northwind.test', version: '1.4.0', runtime: 'php' },
      '127.0.0.1',
    );
    assert.equal(revoked.lease.verdict, 'revoked');
    assert.equal(revoked.lease.usable, false);
    const tampered = { ...revoked.lease, usable: true } as LeaseV1;
    assert.equal(signing.verifyLease(tampered, revoked.signature), false);
  });

  it('counts outlet subscriptions on the main HRMS key and keeps their rules', async () => {
    const actor = await asOwner();
    const main = await control.createSubscription(actor, { customerId, productCode: 'hrms-payroll', planCode: 'payroll' }, '127.0.0.1');
    const mainId = String(main.id);
    const key = String((await control.issueKey(actor, mainId, 'Production', '127.0.0.1')).licenseKey);
    const check = (outlets?: Record<string, number>) => control.checkLease(
      { product: 'hrms-payroll', license_key: key, instance_id: 'hrms-northwind-1', host: 'hr.northwind.test', runtime: 'node', version: '1.0.0', usage: { seats: 20, outlets } },
      '127.0.0.1',
    );
    const single = await check();
    assert.equal(single.lease.outlets?.allowed, 1);
    assert.equal(single.lease.outlets?.units.length, 1);

    const blr = await control.createSubscription(actor, { customerId, productCode: 'hrms-payroll', planCode: 'payroll', outletOf: mainId }, '127.0.0.1');
    const blrId = String(blr.id);
    assert.equal(blr.outletOf, mainId);
    await assert.rejects(control.issueKey(actor, blrId, 'Production', '127.0.0.1'), /main subscription key/);
    await assert.rejects(
      control.createSubscription(actor, { customerId, productCode: 'hrms-payroll', planCode: 'payroll', outletOf: blrId }, '127.0.0.1'),
      /itself an outlet/,
    );
    await assert.rejects(
      control.createSubscription(actor, { customerId, productCode: 'crm', planCode: 'growth', outletOf: mainId }, '127.0.0.1'),
      /does not run outlets/,
    );
    await assert.rejects(control.updateSubscription(actor, mainId, { outletOf: blrId }, '127.0.0.1'), /stay a main subscription/);

    const two = await check({ [mainId]: 12, [blrId]: 8 });
    assert.equal(signing.verifyLease(two.lease, two.signature), true);
    assert.equal(two.lease.outlets?.allowed, 2);
    assert.deepEqual(two.lease.outlets?.units.map((unit) => [unit.subscriptionId, unit.main, unit.usable, unit.seatsUsed]), [
      [mainId, true, true, 12],
      [blrId, false, true, 8],
    ]);

    await control.updateSubscription(actor, blrId, { status: 'suspended' }, '127.0.0.1');
    const paused = await check({ [mainId]: 12, [blrId]: 8 });
    assert.equal(paused.lease.usable, true);
    assert.equal(paused.lease.outlets?.allowed, 1);
    assert.equal(paused.lease.outlets?.units[1].verdict, 'suspended');

    const detail = await control.getSubscription(mainId);
    assert.equal(detail.outletsAllowed, 1);
    assert.equal((detail.outlets as unknown[]).length, 1);
    assert.equal((await control.getSubscription(blrId)).outletMain && true, true);
    await assert.rejects(check({ 'bad id!': 1 }), /usage.outlets/);
  });
});
