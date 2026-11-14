import { compare, hash } from 'bcryptjs';
import { randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { sign, verify } from 'jsonwebtoken';
import { join } from 'path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  AssembleInput,
  EffectiveStatus,
  LeaseV1,
  StoredStatus,
  Verdict,
  assembleLease,
  effectiveStatus,
  isSemver,
  normalizeBinding,
  compareSemver,
} from '../../../packages/contract/policy';
import { CATALOG, opensOutlets } from './catalog';
import { ALL_SLUGS, PERMISSIONS, ROLE_PRESETS } from './permissions';
import { DatabaseService, SqlRow, connQuery } from './database.service';
import { ControlError } from './errors';
import { sendMail } from './mail';
import { GeoFix, SettingsService } from './settings.service';
import { RateLimit } from './rate-limit';
import { SigningService } from './signing.service';
import {
  addPeriod,
  asArray,
  asObject,
  clampText,
  flag,
  id,
  isDay,
  nowSql,
  randomKeyBody,
  sha256,
  sqlToIso,
  todayUtc,
} from './util';

const CUSTOMER_LABELS = ['vip', 'priority', 'trial', 'at-risk', 'key-account', 'new'];
const CUSTOMER_ALERTS = ['renewal', 'payment', 'licence', 'call', 'hold'];
const CUSTOMER_BEHAVIOUR = ['positive', 'careful', 'bad', 'stop'];

export interface Staff {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: string;
  roleName: string;
  status: string;
  presence: string;
  presenceLabel: string;
  presenceSource: string;
  hasAvatar: boolean;
  lastSeenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  permissions: string[];
  locationDue?: boolean;
}

interface CheckInput {
  product: string;
  licenseKey: string;
  instanceId: string;
  binding: string;
  runtime: string;
  version: string;
  agent: string;
  seats: number | null;
  /** Headcount per outlet, keyed by the subscription that opened the outlet. */
  outletSeats: Record<string, number> | null;
}

const SUB_STATUS = new Set(['trialing', 'active', 'past_due', 'suspended', 'revoked', 'cancelled']);
const HOST_POLICY = new Set(['inherit', 'any', 'bind_first', 'allowlist']);
const PRODUCT_POLICY = new Set(['any', 'bind_first', 'allowlist']);

const REPORTS: Array<{ type: string; title: string; summary: string; columns: Array<{ key: string; label: string; pill?: boolean }> }> = [
  {
    type: 'subscriptions',
    title: 'Subscription register',
    summary: 'Companies, the plan they hold, and whether that subscription is active, in grace, or expired.',
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'product', label: 'Product' },
      { key: 'plan', label: 'Plan' },
      { key: 'status', label: 'Status', pill: true },
      { key: 'starts', label: 'Starts' },
      { key: 'ends', label: 'Ends' },
      { key: 'seats', label: 'Seats' },
      { key: 'opened', label: 'Opened' },
    ],
  },
  {
    type: 'customers',
    title: 'Customer register',
    summary: 'Companies on file, who to contact, and how many subscriptions they hold.',
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'contact', label: 'Contact' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'status', label: 'Status', pill: true },
      { key: 'subscriptions', label: 'Subscriptions' },
      { key: 'since', label: 'Since' },
    ],
  },
  {
    type: 'licenses',
    title: 'License keys',
    summary: 'Keys that were issued in the dates you choose. Only the hint is listed. The full key is never written into a report.',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'customer', label: 'Customer' },
      { key: 'label', label: 'Label' },
      { key: 'hint', label: 'Hint' },
      { key: 'status', label: 'Status', pill: true },
      { key: 'issued', label: 'Issued' },
      { key: 'revoked', label: 'Revoked' },
    ],
  },
  {
    type: 'installs',
    title: 'Install check-ins',
    summary: 'Hosts that checked in during the dates you choose, with the version and the last verdict.',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'customer', label: 'Customer' },
      { key: 'instance', label: 'Install' },
      { key: 'runtime', label: 'Runtime' },
      { key: 'version', label: 'Version' },
      { key: 'verdict', label: 'Verdict', pill: true },
      { key: 'seen', label: 'Last seen' },
    ],
  },
  {
    type: 'catalog',
    title: 'Catalog snapshot',
    summary: 'Every product as it stands now. The date range does not filter this snapshot.',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'code', label: 'Code' },
      { key: 'tag', label: 'Key tag' },
      { key: 'seat', label: 'Seat' },
      { key: 'connection', label: 'Connection', pill: true },
      { key: 'status', label: 'Status', pill: true },
      { key: 'plans', label: 'Plans' },
      { key: 'subscribers', label: 'Subscribers' },
    ],
  },
  {
    type: 'revenue',
    title: 'Subscriber purchases',
    summary: 'List cost, offer taken off, and the amount each subscriber purchased. Cancelled subscriptions are left out.',
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'product', label: 'Product' },
      { key: 'plan', label: 'Plan' },
      { key: 'seats', label: 'Seats' },
      { key: 'periods', label: 'Periods' },
      { key: 'list', label: 'List cost' },
      { key: 'offer', label: 'Offer' },
      { key: 'discount', label: 'Discount' },
      { key: 'purchase', label: 'Purchase' },
      { key: 'status', label: 'Status', pill: true },
    ],
  },
  {
    type: 'activity',
    title: 'Team activity',
    summary: 'Staff actions in the dates you choose. License keys are not included.',
    columns: [
      { key: 'when', label: 'When' },
      { key: 'who', label: 'Who' },
      { key: 'action', label: 'Action' },
      { key: 'record', label: 'Record' },
      { key: 'ip', label: 'IP' },
    ],
  },
];

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function inr(value: unknown): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function periodsBetween(start: string, end: string, billing: string): number {
  const a = new Date(start.slice(0, 10) + 'T00:00:00Z');
  const b = new Date(end.slice(0, 10) + 'T00:00:00Z');
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (billing === 'yearly' || billing === 'custom') return Math.max(1, Math.round(months / 12) || 1);
  return Math.max(1, months);
}

function showDay(value: unknown): string {
  return showWhen(value, false);
}

function showWhen(value: unknown, withTime = true): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!match) return text;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0)));
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
  if (withTime && match[4]) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }
  return date.toLocaleString('en-GB', options);
}

@Injectable()
export class ControlService {
  bootstrapFile = '';
  private readonly loginLimit = new RateLimit();
  private readonly leaseLimit = new RateLimit();
  private readonly otpLimit = new RateLimit();
  private jwtSecret = '';

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SigningService) private readonly signing: SigningService,
    @Optional() @Inject(SettingsService) private readonly settings: SettingsService | null = null,
  ) {}

  async seed(): Promise<void> {
    this.jwtSecret = this.loadJwtSecret();
    const now = nowSql();
    for (const item of CATALOG) {
      let product = await this.db.one('SELECT id FROM products WHERE code = ?', [item.code]);
      if (!product) {
        const productId = id();
        await this.db.query(
          `INSERT INTO products
            (id, code, key_tag, name, summary, status, instance_kind, seat_unit, host_policy, connection_state, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', 'host', ?, 'bind_first', 'catalog_only', ?, ?)`,
          [productId, item.code, item.keyTag, item.name, item.summary, item.seatUnit, now, now],
        );
        product = { id: productId } as SqlRow;
      }
      for (const plan of item.plans) {
        const exists = await this.db.one('SELECT id FROM plans WHERE product_id = ? AND code = ?', [
          product.id,
          plan.code,
        ]);
        if (exists) {
          if (plan.priceAmount > 0) {
            await this.db.query(
              'UPDATE plans SET price_amount = ?, price_basis = ? WHERE id = ? AND price_amount = 0',
              [plan.priceAmount, plan.priceBasis, exists.id],
            );
          }
          continue;
        }
        await this.db.query(
          `INSERT INTO plans
            (id, product_id, code, name, billing_period, seat_limit, entitlements_mode, features, limits_json, price_note, price_amount, price_basis, status, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, 'all', '[]', '{}', ?, ?, ?, 'active', ?, ?, ?)`,
          [id(), product.id, plan.code, plan.name, plan.billingPeriod, plan.priceNote, plan.priceAmount, plan.priceBasis, plan.sort, now, now],
        );
      }
    }
    await this.db.query(
      `UPDATE subscriptions s
       JOIN plans pl ON pl.id = s.plan_id
       SET s.seats_purchased = IF(pl.price_basis = 'flat', 1, IF(s.seat_limit IS NULL OR s.seat_limit < 1, 1, s.seat_limit)),
           s.periods = 1,
           s.list_amount = CASE WHEN pl.price_basis = 'flat' THEN pl.price_amount ELSE pl.price_amount * IF(s.seat_limit IS NULL OR s.seat_limit < 1, 1, s.seat_limit) END,
           s.discount_amount = 0,
           s.purchase_amount = CASE WHEN pl.price_basis = 'flat' THEN pl.price_amount ELSE pl.price_amount * IF(s.seat_limit IS NULL OR s.seat_limit < 1, 1, s.seat_limit) END
       WHERE s.list_amount = 0 AND s.purchase_amount = 0 AND s.offer_code = '' AND pl.price_amount > 0`,
    );

    await this.seedAccess(now);
    const staff = await this.db.one('SELECT COUNT(*) AS n FROM staff_users');
    if (Number(staff?.n ?? 0) === 0) {
      const email = (process.env.CONTROL_ADMIN_EMAIL || 'admin@altamidsolutions.com').trim().toLowerCase();
      const provided = process.env.CONTROL_ADMIN_PASSWORD || '';
      const password = provided || randomBytes(9).toString('base64url');
      const superAdmin = await this.db.one(`SELECT id FROM roles WHERE slug = 'super_admin'`);
      await this.db.query(
        `INSERT INTO staff_users (id, email, name, password_hash, role, role_id, status, created_at, updated_at)
         VALUES (?, ?, 'Altamid Owner', ?, 'super_admin', ?, 'active', ?, ?)`,
        [id(), email, await hash(password, 10), superAdmin?.id || null, now, now],
      );
      if (!provided) {
        const dir = join(process.cwd(), 'storage');
        mkdirSync(dir, { recursive: true });
        this.bootstrapFile = join(dir, 'admin.txt');
        writeFileSync(this.bootstrapFile, 'email=' + email + '\npassword=' + password + '\n', { encoding: 'utf8' });
      }
    }
  }

  async login(email: string, password: string, ip: string, where?: GeoFix, remember = false): Promise<{ token: string; staff: Staff }> {
    if (!this.loginLimit.allow(ip || 'local', 8, 10 * 60 * 1000)) {
      throw new ControlError(429, 'rate_limited', 'Too many sign-in attempts. Wait a few minutes.');
    }
    const row = await this.db.one('SELECT * FROM staff_users WHERE email = ?', [email.trim().toLowerCase()]);
    const valid = row ? await compare(password, String(row.password_hash)) : false;
    if (!row || !valid || String(row.status) !== 'active') {
      throw new ControlError(401, 'unauthorized', 'Email or password is not valid.');
    }
    if (this.settings) await this.settings.assertEntry(row, ip, where, 'login');
    const now = nowSql();
    const manual = String(row.presence_source || 'auto') === 'manual' && !['online', 'away'].includes(String(row.presence || 'online'));
    if (manual) {
      await this.db.query('UPDATE staff_users SET last_seen_at = ? WHERE id = ?', [now, row.id]);
    } else {
      await this.db.query(
        `UPDATE staff_users SET presence = 'online', presence_label = '', presence_source = 'auto', presence_at = ?, last_seen_at = ? WHERE id = ?`,
        [now, now, row.id],
      );
    }
    const fresh = await this.db.one('SELECT * FROM staff_users WHERE id = ?', [row.id]);
    const staff = await this.present((fresh || row) as SqlRow);
    const token = sign({ sub: staff.id, email: staff.email, role: staff.role }, this.jwtSecret, {
      expiresIn: remember ? '30d' : '12h',
      issuer: 'altamid-control',
    });
    await this.audit(staff.id, 'staff.login', 'staff', staff.id, {}, ip);
    return { token, staff };
  }

  async forgotPassword(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      throw new ControlError(400, 'invalid_request', 'Enter the email on the account.');
    }
    if (!this.otpLimit.allow('reset:' + normalized, 1, 60 * 1000)) {
      throw new ControlError(400, 'invalid_request', 'A code was just sent. Wait a minute, then send another.');
    }
    const row = await this.db.one('SELECT id, email, status FROM staff_users WHERE email = ?', [normalized]);
    if (!row || String(row.status) !== 'active') return;
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const now = nowSql();
    await this.db.query(
      `UPDATE staff_otps SET used_at = ? WHERE staff_id = ? AND purpose = 'reset' AND used_at IS NULL`,
      [now, row.id],
    );
    const otpId = id();
    await this.db.query(
      `INSERT INTO staff_otps (id, staff_id, purpose, code_hash, expires_at, created_at) VALUES (?, ?, 'reset', ?, ?, ?)`,
      [otpId, row.id, this.otpHash(code, 'reset'), nowSql(new Date(Date.now() + 10 * 60 * 1000)), now],
    );
    try {
      const mailbox = this.settings ? await this.settings.mailbox('staff') : null;
      await sendMail(
        String(row.email),
        'Altamid Control password reset',
        'Your Altamid Control password reset code is ' +
          code +
          '.\n\nIt expires in 10 minutes. If you did not ask to reset the password, you can ignore this email.',
        mailbox || undefined,
      );
    } catch (error) {
      await this.db.query('UPDATE staff_otps SET used_at = ? WHERE id = ?', [nowSql(), otpId]);
      throw error;
    }
  }

  async resetPassword(email: string, code: string, password: string, ip: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (password.length < 10) throw new ControlError(400, 'invalid_request', 'Password must be at least 10 characters.');
    const row = await this.db.one('SELECT id, status FROM staff_users WHERE email = ?', [normalized]);
    if (!row || String(row.status) !== 'active') {
      throw new ControlError(400, 'invalid_request', 'That code is not valid.');
    }
    await this.consumeOtp(String(row.id), code.replace(/\s/g, ''), 'reset');
    const now = nowSql();
    await this.db.query('UPDATE staff_users SET password_hash = ?, updated_at = ? WHERE id = ?', [await hash(password, 10), now, row.id]);
    await this.audit(String(row.id), 'staff.password_reset', 'staff', String(row.id), {}, ip);
  }

  staffFromAuth(header: string | undefined): Staff {
    const token = (header || '').startsWith('Bearer ') ? (header || '').slice(7).trim() : '';
    if (!token) throw new ControlError(401, 'unauthorized', 'Sign in again.');
    try {
      const payload = verify(token, this.jwtSecret, { issuer: 'altamid-control' }) as { sub?: string };
      if (!payload.sub) throw new Error('missing subject');
      return {
        id: payload.sub,
        email: '',
        name: '',
        phone: '',
        role: 'viewer',
        roleName: 'Viewer',
        status: 'active',
        presence: 'online',
        presenceLabel: '',
        presenceSource: 'auto',
        hasAvatar: false,
        lastSeenAt: null,
        createdAt: null,
        updatedAt: null,
        permissions: [],
      };
    } catch {
      throw new ControlError(401, 'unauthorized', 'Sign in again.');
    }
  }

  async requireStaff(header: string | undefined, permission = ''): Promise<Staff> {
    const session = this.staffFromAuth(header);
    const row = await this.db.one('SELECT * FROM staff_users WHERE id = ?', [session.id]);
    if (!row || String(row.status) !== 'active') {
      throw new ControlError(401, 'unauthorized', 'Sign in again.');
    }
    const staff = await this.present(row);
    if (!permission || staff.role === 'super_admin' || staff.permissions.includes(permission)) return staff;
    throw new ControlError(403, 'forbidden', 'This account cannot do that.');
  }

  async requireAny(header: string | undefined, permissions: string[]): Promise<Staff> {
    const staff = await this.requireStaff(header);
    if (staff.role === 'super_admin' || permissions.some((item) => staff.permissions.includes(item))) return staff;
    throw new ControlError(403, 'forbidden', 'This account cannot do that.');
  }

  async overview(): Promise<Record<string, unknown>> {
    const products = await this.db.query('SELECT * FROM products ORDER BY name');
    const subs = await this.db.query(
      'SELECT id, product_id, status, starts_at, ends_at, grace_days FROM subscriptions',
    );
    const seenSince = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 23).replace('T', ' ');
    const planRows = await this.db.query('SELECT product_id, COUNT(*) AS n FROM plans GROUP BY product_id');
    const planMap = new Map(planRows.map((row) => [String(row.product_id), Number(row.n)]));
    const installs = await this.db.query(
      `SELECT s.product_id, COUNT(*) AS n
       FROM instances i JOIN subscriptions s ON s.id = i.subscription_id
       WHERE i.last_seen_at >= ? GROUP BY s.product_id`,
      [seenSince],
    );
    const installMap = new Map(installs.map((row) => [String(row.product_id), Number(row.n)]));
    const now = Date.now();
    const statusCounts = new Map<string, number>();
    const cards = products.map((product) => {
      const mine = subs.filter((row) => String(row.product_id) === String(product.id));
      let attention = 0;
      for (const row of mine) {
        const effective = effectiveStatus(
          String(row.status) as StoredStatus,
          String(row.starts_at),
          String(row.ends_at),
          Number(row.grace_days),
          now,
        );
        statusCounts.set(effective, (statusCounts.get(effective) ?? 0) + 1);
        if (['grace', 'past_due', 'expired', 'suspended', 'revoked'].includes(effective)) attention += 1;
      }
      return {
        ...this.productJson(product),
        subscribers: mine.filter((row) => String(row.status) !== 'cancelled').length,
        installs7d: installMap.get(String(product.id)) ?? 0,
        plans: planMap.get(String(product.id)) ?? 0,
        attention,
      };
    });
    const customers = await this.db.one("SELECT COUNT(*) AS n FROM customers WHERE status = 'active'");
    return {
      contractVersion: 1,
      customers: Number(customers?.n ?? 0),
      products: cards,
      attention: cards.reduce((sum, card) => sum + card.attention, 0),
      statuses: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
    };
  }

  async listProducts(): Promise<Record<string, unknown>[]> {
    const rows = await this.db.query('SELECT * FROM products ORDER BY name');
    const subs = await this.db.query(
      `SELECT product_id, COUNT(*) AS n FROM subscriptions WHERE status <> 'cancelled' GROUP BY product_id`,
    );
    const plans = await this.db.query('SELECT product_id, COUNT(*) AS n FROM plans GROUP BY product_id');
    const subMap = new Map(subs.map((row) => [String(row.product_id), Number(row.n)]));
    const planMap = new Map(plans.map((row) => [String(row.product_id), Number(row.n)]));
    return rows.map((row) => ({
      ...this.productJson(row),
      subscribers: subMap.get(String(row.id)) ?? 0,
      plans: planMap.get(String(row.id)) ?? 0,
    }));
  }

  async getProduct(code: string): Promise<Record<string, unknown>> {
    const product = await this.productByCode(code);
    const plans = await this.db.query('SELECT * FROM plans WHERE product_id = ? ORDER BY sort_order, name', [
      product.id,
    ]);
    const releases = await this.db.query(
      'SELECT * FROM releases WHERE product_id = ? ORDER BY created_at DESC',
      [product.id],
    );
    return { ...this.productJson(product), plans: plans.map((row) => this.planJson(row)), releases: releases.map((row) => this.releaseJson(row)) };
  }

  async updateProduct(actor: Staff, code: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const product = await this.productByCode(code);
    const name = body.name === undefined ? String(product.name) : clampText(body.name, 120);
    const summary = body.summary === undefined ? String(product.summary) : clampText(body.summary, 400);
    const status = body.status === undefined ? String(product.status) : String(body.status);
    const connectionState = body.connectionState === undefined ? String(product.connection_state) : String(body.connectionState);
    const hostPolicy = body.hostPolicy === undefined ? String(product.host_policy) : String(body.hostPolicy);
    const seatUnit = body.seatUnit === undefined ? String(product.seat_unit) : clampText(body.seatUnit, 32);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Product name is required.');
    if (!['draft', 'active', 'retired'].includes(status)) {
      throw new ControlError(400, 'invalid_request', 'Product status must be draft, active, or retired.');
    }
    if (!['catalog_only', 'ready', 'connected'].includes(connectionState)) {
      throw new ControlError(400, 'invalid_request', 'Connection state must be catalog_only, ready, or connected.');
    }
    if (!PRODUCT_POLICY.has(hostPolicy)) {
      throw new ControlError(400, 'invalid_request', 'Host policy must be any, bind_first, or allowlist.');
    }
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(seatUnit)) {
      throw new ControlError(400, 'invalid_request', 'Seat unit must be a short code such as user, employee, or outlet.');
    }
    await this.db.query(
      `UPDATE products SET name = ?, summary = ?, status = ?, connection_state = ?, host_policy = ?, seat_unit = ?, updated_at = ? WHERE id = ?`,
      [name, summary, status, connectionState, hostPolicy, seatUnit, nowSql(), product.id],
    );
    await this.audit(actor.id, 'product.update', 'product', String(product.id), { code, connectionState, hostPolicy }, ip);
    return this.getProduct(code);
  }

  async createProduct(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const code = String(body.code || '').trim().toLowerCase();
    const name = clampText(body.name, 120);
    const summary = clampText(body.summary, 400);
    const keyTag = String(body.keyTag || '').trim().toUpperCase();
    const seatUnit = String(body.seatUnit || 'user').trim().toLowerCase();
    const hostPolicy = String(body.hostPolicy || 'bind_first');
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(code)) {
      throw new ControlError(400, 'invalid_request', 'Product code must be a short slug such as field-sales. It cannot be changed later.');
    }
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Product name is required.');
    if (!/^[A-Z][A-Z0-9]{1,7}$/.test(keyTag)) {
      throw new ControlError(400, 'invalid_request', 'Key tag must be 2 to 8 letters, such as FIELD. It is printed on every license key.');
    }
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(seatUnit)) {
      throw new ControlError(400, 'invalid_request', 'Seat unit must be a short code such as user, employee, or outlet.');
    }
    if (!PRODUCT_POLICY.has(hostPolicy)) {
      throw new ControlError(400, 'invalid_request', 'Host policy must be any, bind_first, or allowlist.');
    }
    this.assertPlan(body.planCode, body.billingPeriod, body.priceBasis, body.priceAmount);
    const taken = await this.db.one('SELECT code, key_tag FROM products WHERE code = ? OR key_tag = ?', [code, keyTag]);
    if (taken) {
      throw new ControlError(400, 'invalid_request', String(taken.code) === code ? 'That product code is already used.' : 'That key tag is already used.');
    }
    const now = nowSql();
    const productId = id();
    await this.db.query(
      `INSERT INTO products
        (id, code, key_tag, name, summary, status, instance_kind, seat_unit, host_policy, connection_state, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', 'host', ?, ?, 'catalog_only', ?, ?)`,
      [productId, code, keyTag, name, summary, seatUnit, hostPolicy, now, now],
    );
    await this.insertPlan(productId, {
      code: body.planCode,
      name: body.planName,
      billingPeriod: body.billingPeriod,
      priceNote: body.priceNote,
      priceAmount: body.priceAmount,
      priceBasis: body.priceBasis,
    }, 0);
    await this.audit(actor.id, 'product.create', 'product', productId, { code, keyTag }, ip);
    return this.getProduct(code);
  }

  async createPlan(actor: Staff, code: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const product = await this.productByCode(code);
    const count = await this.db.one('SELECT COUNT(*) AS n FROM plans WHERE product_id = ?', [product.id]);
    await this.insertPlan(String(product.id), body, Number(count?.n ?? 0));
    await this.audit(actor.id, 'plan.create', 'plan', String(product.id), { code, plan: String(body.code || '') }, ip);
    return this.getProduct(code);
  }

  async listCustomers(search: string, status: string): Promise<Record<string, unknown>[]> {
    const params: unknown[] = [];
    let sql = 'SELECT * FROM customers WHERE 1 = 1';
    if (status !== 'all') {
      sql += ' AND status = ?';
      params.push(status === 'archived' ? 'archived' : 'active');
    }
    if (search.trim()) {
      sql += ' AND (name LIKE ? OR contact_email LIKE ? OR contact_name LIKE ?)';
      const like = '%' + search.trim().replace(/[\\%_]/g, '\\$&') + '%';
      params.push(like, like, like);
    }
    sql += ' ORDER BY name LIMIT 200';
    const rows = await this.db.query(sql, params);
    return rows.map((row) => this.customerJson(row));
  }

  async getCustomer(customerId: string): Promise<Record<string, unknown>> {
    const customer = await this.customerById(customerId);
    const subs = await this.db.query(
      `SELECT s.*, p.code AS product_code, p.name AS product_name, pl.name AS plan_name, pl.code AS plan_code
       FROM subscriptions s
       JOIN products p ON p.id = s.product_id
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.customer_id = ?
       ORDER BY s.created_at DESC`,
      [customerId],
    );
    return { ...this.customerJson(customer), subscriptions: subs.map((row) => this.subscriptionBrief(row)) };
  }

  async createCustomer(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const name = clampText(body.name, 190);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Customer name is required.');
    const contactEmail = this.emailOrEmpty(body.contactEmail);
    const phone = this.phoneOrEmpty(body.phone);
    const customerId = id();
    const now = nowSql();
    await this.db.query(
      `INSERT INTO customers (id, name, contact_name, contact_email, phone, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [
        customerId,
        name,
        clampText(body.contactName, 120),
        contactEmail,
        phone,
        clampText(body.notes, 5000),
        now,
        now,
      ],
    );
    await this.audit(actor.id, 'customer.create', 'customer', customerId, { name }, ip);
    return this.getCustomer(customerId);
  }

  async updateCustomer(actor: Staff, customerId: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const customer = await this.customerById(customerId);
    const status = body.status === undefined ? String(customer.status) : String(body.status);
    if (!['active', 'archived'].includes(status)) {
      throw new ControlError(400, 'invalid_request', 'Customer status must be active or archived.');
    }
    const name = body.name === undefined ? String(customer.name) : clampText(body.name, 190);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Customer name is required.');
    const contactEmail = body.contactEmail === undefined ? String(customer.contact_email) : this.emailOrEmpty(body.contactEmail);
    const phone = body.phone === undefined ? String(customer.phone) : this.phoneOrEmpty(body.phone);
    const labels = body.labels === undefined ? this.jsonIds(customer.labels_json) : this.cleanIds(body.labels, CUSTOMER_LABELS);
    const alerts = body.alerts === undefined ? this.jsonIds(customer.alerts_json) : this.cleanIds(body.alerts, CUSTOMER_ALERTS);
    const blocked = body.blocked === undefined ? flag(customer.blocked) : Boolean(body.blocked);
    const blockReason = body.blockReason === undefined ? String(customer.block_reason || '') : clampText(body.blockReason, 240);
    let behaviour = this.behaviourList(customer.behaviour_json);
    const removeId = clampText(body.behaviourRemove, 40);
    if (removeId) behaviour = behaviour.filter((item) => item.id !== removeId);
    const added = this.plainRecord(body.behaviourNote);
    if (added && (added.kind || added.note)) {
      const kind = String(added.kind || '');
      const note = clampText(added.note, 500);
      if (!CUSTOMER_BEHAVIOUR.includes(kind)) throw new ControlError(400, 'invalid_request', 'Choose a behaviour from the list.');
      if (note.length < 2) throw new ControlError(400, 'invalid_request', 'Write a short note about this customer.');
      behaviour = [{ id: id(), kind, note, at: new Date().toISOString(), by: actor.name }, ...behaviour].slice(0, 40);
    }
    await this.db.query(
      `UPDATE customers SET name = ?, contact_name = ?, contact_email = ?, phone = ?, notes = ?, status = ?,
        labels_json = ?, alerts_json = ?, blocked = ?, block_reason = ?, behaviour_json = ?, updated_at = ? WHERE id = ?`,
      [
        name,
        body.contactName === undefined ? String(customer.contact_name) : clampText(body.contactName, 120),
        contactEmail,
        phone,
        body.notes === undefined ? String(customer.notes) : clampText(body.notes, 5000),
        status,
        JSON.stringify(labels),
        JSON.stringify(alerts),
        blocked ? 1 : 0,
        blocked ? blockReason : '',
        JSON.stringify(behaviour),
        nowSql(),
        customerId,
      ],
    );
    await this.audit(actor.id, 'customer.update', 'customer', customerId, { status, blocked, labels, alerts }, ip);
    return this.getCustomer(customerId);
  }

  async createSubscription(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const customer = await this.customerById(String(body.customerId || ''));
    if (flag(customer.blocked)) {
      throw new ControlError(400, 'invalid_request', 'This customer is blocked. Unblock them before opening a subscription.');
    }
    const product = await this.productByCode(String(body.productCode || body.product || ''));
    const plan = await this.db.one('SELECT * FROM plans WHERE product_id = ? AND code = ?', [
      product.id,
      String(body.planCode || '').trim(),
    ]);
    if (String(product.status) !== 'active') {
      throw new ControlError(400, 'invalid_request', 'This product is not active, so a new subscription cannot be opened.');
    }
    if (!plan || String(plan.status) !== 'active') {
      throw new ControlError(400, 'invalid_request', 'Choose an active plan for that product.');
    }
    const startsAt = body.startsAt ? String(body.startsAt) : todayUtc();
    if (!isDay(startsAt)) throw new ControlError(400, 'invalid_request', 'Start date must be YYYY-MM-DD.');
    const endsAt = body.endsAt ? String(body.endsAt) : addPeriod(startsAt, String(plan.billing_period));
    if (!isDay(endsAt) || endsAt < startsAt) {
      throw new ControlError(400, 'invalid_request', 'End date must be on or after the start date.');
    }
    const subId = id();
    const now = nowSql();
    const status = String(plan.billing_period) === 'trial' ? 'trialing' : 'active';
    const bought = await this.priceSubscription(plan, String(product.id), startsAt, endsAt, body.seatsPurchased ?? 1, String(body.offerCode || ''));
    const coupon = await this.pickedCoupon(String(body.couponCode || ''), String(product.id));
    const outletOf = await this.outletParent(body.outletOf, String(customer.id), String(product.id), String(product.code), null);
    await this.db.query(
      `INSERT INTO subscriptions
        (id, customer_id, product_id, plan_id, status, starts_at, ends_at, grace_days, seat_limit, enforce_seat_limit,
         entitlements_mode, features, limits_json, host_policy, bindings, max_instances, block_outdated, channel, notes,
         last_reject, seats_purchased, periods, list_amount, discount_amount, purchase_amount, offer_id, offer_code, coupon_id, coupon_code, outlet_of, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 14, ?, 0, 'inherit', NULL, NULL, 'inherit', '[]', 1, 0, 'stable', ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subId,
        customer.id,
        product.id,
        plan.id,
        status,
        startsAt,
        endsAt,
        body.seatLimit === undefined || body.seatLimit === null || body.seatLimit === '' ? null : this.seat(body.seatLimit),
        clampText(body.notes, 5000),
        bought.seats,
        bought.periods,
        bought.list,
        bought.discount,
        bought.purchase,
        bought.offerId,
        bought.offerCode,
        coupon.id,
        coupon.code,
        outletOf,
        now,
        now,
      ],
    );
    await this.audit(actor.id, 'subscription.create', 'subscription', subId, { product: product.code, plan: plan.code, outletOf }, ip);
    return this.getSubscription(subId);
  }

  async getSubscription(subId: string): Promise<Record<string, unknown>> {
    const row = await this.subscriptionRow(subId);
    const keys = await this.db.query(
      'SELECT id, key_hint, label, status, created_at, revoked_at FROM license_keys WHERE subscription_id = ? ORDER BY created_at DESC',
      [subId],
    );
    const instances = await this.db.query(
      'SELECT * FROM instances WHERE subscription_id = ? ORDER BY last_seen_at DESC',
      [subId],
    );
    const outlets = opensOutlets(String(row.product_code));
    const family = outlets
      ? await this.db.query(
        `SELECT s.*, p.code AS product_code, p.name AS product_name, pl.name AS plan_name, pl.code AS plan_code, c.name AS customer_name
         FROM subscriptions s
         JOIN products p ON p.id = s.product_id
         JOIN plans pl ON pl.id = s.plan_id
         JOIN customers c ON c.id = s.customer_id
         WHERE s.customer_id = ? AND s.product_id = ? AND s.id <> ?
         ORDER BY s.created_at, s.id`,
        [row.customer_id, row.product_id, subId],
      )
      : [];
    const outletRows = family.filter((item) => String(item.outlet_of || '') === subId).map((item) => this.subscriptionBrief(item));
    const usable = (item: Record<string, unknown>) => (USABLE as readonly string[]).includes(String(item.effectiveStatus));
    const self = this.subscriptionFull(row);
    return {
      ...self,
      opensOutlets: outlets,
      outlets: outletRows,
      outletsAllowed: row.outlet_of ? null : (usable(self) ? 1 : 0) + outletRows.filter((item) => usable(item) && usable(self)).length,
      outletMain: row.outlet_of ? family.filter((item) => String(item.id) === String(row.outlet_of)).map((item) => this.subscriptionBrief(item))[0] || null : null,
      mainChoices: outlets
        ? family.filter((item) => !item.outlet_of).map((item) => ({ id: String(item.id), label: String(item.plan_name) + ' · ' + String(item.starts_at).slice(0, 10) + ' to ' + String(item.ends_at).slice(0, 10) }))
        : [],
      keys: keys.map((key) => ({
        id: key.id,
        hint: key.key_hint,
        label: key.label,
        status: key.status,
        createdAt: sqlToIso(String(key.created_at)),
        revokedAt: sqlToIso(key.revoked_at ? String(key.revoked_at) : null),
      })),
      instances: instances.map((item) => ({
        id: item.id,
        instanceId: item.instance_id,
        binding: item.binding,
        runtime: item.runtime,
        version: item.version,
        lastVerdict: item.last_verdict,
        lastSeenAt: sqlToIso(String(item.last_seen_at)),
        usage: asObject(item.usage_json),
      })),
    };
  }

  async updateSubscription(actor: Staff, subId: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const row = await this.subscriptionRow(subId);
    const currentOutlet = row.outlet_of ? String(row.outlet_of) : null;
    const wantedOutlet = body.outletOf === undefined ? currentOutlet : String(body.outletOf || '').trim() || null;
    const outletOf = wantedOutlet === currentOutlet
      ? currentOutlet
      : await this.outletParent(wantedOutlet, String(row.customer_id), String(row.product_id), String(row.product_code), subId);
    const status = body.status === undefined ? String(row.status) : String(body.status);
    if (!SUB_STATUS.has(status)) throw new ControlError(400, 'invalid_request', 'That subscription status is not valid.');
    const startsAt = body.startsAt === undefined ? String(row.starts_at) : String(body.startsAt);
    const endsAt = body.endsAt === undefined ? String(row.ends_at) : String(body.endsAt);
    if (!isDay(startsAt) || !isDay(endsAt) || endsAt < startsAt) {
      throw new ControlError(400, 'invalid_request', 'Check the start and end dates.');
    }
    const graceDays = body.graceDays === undefined ? Number(row.grace_days) : Number(body.graceDays);
    if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 90) {
      throw new ControlError(400, 'invalid_request', 'Grace days must be a whole number from 0 to 90.');
    }
    const hostPolicy = body.hostPolicy === undefined ? String(row.host_policy) : String(body.hostPolicy);
    if (!HOST_POLICY.has(hostPolicy)) throw new ControlError(400, 'invalid_request', 'Host policy is not valid.');
    const maxInstances = body.maxInstances === undefined ? Number(row.max_instances) : Number(body.maxInstances);
    if (!Number.isInteger(maxInstances) || maxInstances < 1 || maxInstances > 100) {
      throw new ControlError(400, 'invalid_request', 'Install limit must be from 1 to 100.');
    }
    const channel = body.channel === undefined ? String(row.channel) : String(body.channel);
    if (!/^[a-z][a-z0-9-]{0,15}$/.test(channel)) {
      throw new ControlError(400, 'invalid_request', 'Channel must be a short code such as stable or beta.');
    }
    let planId = String(row.plan_id);
    if (body.planCode !== undefined) {
      const plan = await this.db.one('SELECT id FROM plans WHERE product_id = ? AND code = ?', [
        row.product_id,
        String(body.planCode),
      ]);
      if (!plan) throw new ControlError(400, 'invalid_request', 'That plan is not on this product.');
      planId = String(plan.id);
    }
    const pricedPlan = await this.db.one('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!pricedPlan) throw new ControlError(400, 'invalid_request', 'That plan is not on this product.');
    const offerCode = body.offerCode === undefined ? String(row.offer_code || '') : String(body.offerCode || '');
    const coupon = body.couponCode === undefined
      ? { id: (row.coupon_id as string | null) || null, code: String(row.coupon_code || '') }
      : await this.pickedCoupon(String(body.couponCode || ''), String(row.product_id));
    const seatsPurchased = body.seatsPurchased === undefined ? Number(row.seats_purchased || 1) : body.seatsPurchased;
    const bought = await this.priceSubscription(pricedPlan, String(row.product_id), startsAt, endsAt, seatsPurchased, offerCode);
    const seatLimit =
      body.seatLimit === undefined
        ? row.seat_limit
        : body.seatLimit === null || body.seatLimit === ''
          ? null
          : this.seat(body.seatLimit);
    const bindings = body.bindings === undefined ? String(row.bindings || '[]') : JSON.stringify(this.bindingList(body.bindings, String(row.instance_kind) as 'host' | 'device' | 'tenant'));
    const pin = this.optionalVersion(body.versionPin, row.version_pin);
    const minimum = this.optionalVersion(body.minVersion, row.min_version);
    await this.db.query(
      `UPDATE subscriptions SET plan_id = ?, status = ?, starts_at = ?, ends_at = ?, grace_days = ?, seat_limit = ?,
        enforce_seat_limit = ?, host_policy = ?, bindings = ?, max_instances = ?, version_pin = ?, min_version = ?,
        block_outdated = ?, channel = ?, notes = ?, seats_purchased = ?, periods = ?, list_amount = ?, discount_amount = ?,
        purchase_amount = ?, offer_id = ?, offer_code = ?, coupon_id = ?, coupon_code = ?, updated_at = ? WHERE id = ?`,
      [
        planId,
        status,
        startsAt,
        endsAt,
        graceDays,
        seatLimit,
        body.enforceSeatLimit === undefined ? (flag(row.enforce_seat_limit) ? 1 : 0) : flag(body.enforceSeatLimit) ? 1 : 0,
        hostPolicy,
        bindings,
        maxInstances,
        pin,
        minimum,
        body.blockOutdated === undefined ? (flag(row.block_outdated) ? 1 : 0) : flag(body.blockOutdated) ? 1 : 0,
        channel,
        body.notes === undefined ? String(row.notes || '') : clampText(body.notes, 5000),
        bought.seats,
        bought.periods,
        bought.list,
        bought.discount,
        bought.purchase,
        bought.offerId,
        bought.offerCode,
        coupon.id,
        coupon.code,
        nowSql(),
        subId,
      ],
    );
    if (outletOf !== currentOutlet) {
      await this.db.query('UPDATE subscriptions SET outlet_of = ? WHERE id = ?', [outletOf, subId]);
    }
    await this.audit(actor.id, 'subscription.update', 'subscription', subId, { status, hostPolicy, maxInstances, outletOf }, ip);
    return this.getSubscription(subId);
  }

  /** Checks that a subscription may add an outlet to `value`, the main subscription of the same customer and product. */
  private async outletParent(value: unknown, customerId: string, productId: string, productCode: string, selfId: string | null): Promise<string | null> {
    const target = String(value ?? '').trim();
    if (!target) return null;
    if (!opensOutlets(productCode)) {
      throw new ControlError(400, 'invalid_request', 'This product does not run outlets, so a subscription cannot be added as an outlet.');
    }
    if (target === selfId) throw new ControlError(400, 'invalid_request', 'A subscription cannot be an outlet of itself.');
    if (selfId) {
      const children = await this.db.one('SELECT COUNT(*) AS n FROM subscriptions WHERE outlet_of = ?', [selfId]);
      if (Number(children?.n ?? 0) > 0) {
        throw new ControlError(400, 'invalid_request', 'Other subscriptions add outlets to this one, so it has to stay a main subscription.');
      }
      const keys = await this.db.one("SELECT COUNT(*) AS n FROM license_keys WHERE subscription_id = ? AND status = 'active'", [selfId]);
      if (Number(keys?.n ?? 0) > 0) {
        throw new ControlError(400, 'invalid_request', "Revoke this subscription's keys first. An outlet runs on the main subscription key.");
      }
    }
    const main = await this.db.one('SELECT id, customer_id, product_id, outlet_of FROM subscriptions WHERE id = ?', [target]);
    if (!main || String(main.customer_id) !== customerId || String(main.product_id) !== productId) {
      throw new ControlError(400, 'invalid_request', 'Choose a main subscription of the same customer and product.');
    }
    if (main.outlet_of) {
      throw new ControlError(400, 'invalid_request', 'That subscription is itself an outlet. Choose the main subscription it belongs to.');
    }
    return target;
  }

  async issueKey(actor: Staff, subId: string, label: string, ip: string): Promise<Record<string, unknown>> {
    const row = await this.subscriptionRow(subId);
    if (row.outlet_of) {
      throw new ControlError(400, 'invalid_request', 'This subscription adds an outlet to another subscription. The install uses the main subscription key.');
    }
    const plain = 'AS1.' + String(row.key_tag) + '.' + randomKeyBody();
    const keyId = id();
    const hint = 'AS1.' + String(row.key_tag) + '.••••' + plain.slice(-4);
    await this.db.query(
      `INSERT INTO license_keys (id, subscription_id, key_hash, key_hint, label, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [keyId, subId, sha256(plain), hint, clampText(label || 'Production', 80) || 'Production', nowSql()],
    );
    await this.audit(actor.id, 'license.issue', 'license_key', keyId, { subscriptionId: subId, hint }, ip);
    return { id: keyId, hint, licenseKey: plain };
  }

  async revokeKey(actor: Staff, subId: string, keyId: string, ip: string): Promise<Record<string, unknown>> {
    const key = await this.db.one('SELECT * FROM license_keys WHERE id = ? AND subscription_id = ?', [keyId, subId]);
    if (!key) throw new ControlError(404, 'not_found', 'That license key was not found.');
    await this.db.query('UPDATE license_keys SET status = ?, revoked_at = ? WHERE id = ?', ['revoked', nowSql(), keyId]);
    await this.audit(actor.id, 'license.revoke', 'license_key', keyId, { hint: key.key_hint }, ip);
    return this.getSubscription(subId);
  }

  async resetBinding(actor: Staff, subId: string, ip: string): Promise<Record<string, unknown>> {
    await this.subscriptionRow(subId);
    await this.db.tx(async (conn) => {
      await connQuery(conn, 'UPDATE subscriptions SET bindings = ?, last_reject = ?, last_reject_at = NULL, updated_at = ? WHERE id = ?', [
        '[]',
        '',
        nowSql(),
        subId,
      ]);
      await connQuery(conn, 'DELETE FROM instances WHERE subscription_id = ?', [subId]);
    });
    await this.audit(actor.id, 'subscription.reset_binding', 'subscription', subId, {}, ip);
    return this.getSubscription(subId);
  }

  async createRelease(actor: Staff, code: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const product = await this.productByCode(code);
    const version = String(body.version || '').trim();
    if (!isSemver(version)) throw new ControlError(400, 'invalid_request', 'Version must look like 1.4.0.');
    const channel = String(body.channel || 'stable');
    if (!/^[a-z][a-z0-9-]{0,15}$/.test(channel)) {
      throw new ControlError(400, 'invalid_request', 'Channel must be a short code such as stable or beta.');
    }
    const notes = clampText(body.notes, 20000);
    if (!notes) throw new ControlError(400, 'invalid_request', 'Release notes are required.');
    const releaseId = id();
    const now = nowSql();
    try {
      await this.db.query(
        `INSERT INTO releases (id, product_id, version, channel, state, notes, has_package, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, 0, ?, ?)`,
        [releaseId, product.id, version, channel, notes, now, now],
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ControlError(400, 'invalid_request', 'That version already exists on this channel.');
      }
      throw error;
    }
    await this.audit(actor.id, 'release.create', 'release', releaseId, { code, version, channel }, ip);
    return this.getProduct(code);
  }

  async publishRelease(actor: Staff, releaseId: string, ip: string): Promise<Record<string, unknown>> {
    const release = await this.releaseById(releaseId);
    if (String(release.state) === 'yanked') {
      throw new ControlError(400, 'invalid_request', 'A yanked release stays yanked. Publish a new version.');
    }
    await this.db.tx(async (conn) => {
      await connQuery(
        conn,
        `UPDATE releases SET state = 'superseded', updated_at = ? WHERE product_id = ? AND channel = ? AND state = 'published'`,
        [nowSql(), release.product_id, release.channel],
      );
      await connQuery(conn, `UPDATE releases SET state = 'published', published_at = ?, updated_at = ? WHERE id = ?`, [
        nowSql(),
        nowSql(),
        releaseId,
      ]);
    });
    await this.audit(actor.id, 'release.publish', 'release', releaseId, { version: release.version }, ip);
    const product = await this.db.one('SELECT code FROM products WHERE id = ?', [release.product_id]);
    return this.getProduct(String(product?.code || ''));
  }

  async yankRelease(actor: Staff, releaseId: string, ip: string): Promise<Record<string, unknown>> {
    const release = await this.releaseById(releaseId);
    await this.db.query(`UPDATE releases SET state = 'yanked', updated_at = ? WHERE id = ?`, [nowSql(), releaseId]);
    await this.audit(actor.id, 'release.yank', 'release', releaseId, { version: release.version }, ip);
    const product = await this.db.one('SELECT code FROM products WHERE id = ?', [release.product_id]);
    return this.getProduct(String(product?.code || ''));
  }

  async listSubscriptions(code: string): Promise<Record<string, unknown>[]> {
    const product = await this.productByCode(code);
    const rows = await this.db.query(
      `SELECT s.*, p.code AS product_code, p.name AS product_name, p.instance_kind, p.key_tag, p.seat_unit AS product_seat_unit,
              pl.name AS plan_name, pl.code AS plan_code, c.name AS customer_name
       FROM subscriptions s
       JOIN products p ON p.id = s.product_id
       JOIN plans pl ON pl.id = s.plan_id
       JOIN customers c ON c.id = s.customer_id
       WHERE s.product_id = ?
       ORDER BY s.created_at DESC`,
      [product.id],
    );
    return rows.map((row) => this.subscriptionBrief(row));
  }

  async updatePlanPrice(actor: Staff, code: string, planCode: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const product = await this.productByCode(code);
    const plan = await this.db.one('SELECT * FROM plans WHERE product_id = ? AND code = ?', [product.id, planCode]);
    if (!plan) throw new ControlError(404, 'not_found', 'That plan was not found.');
    const amount = money(Number(body.priceAmount ?? plan.price_amount));
    const basis = String(body.priceBasis || plan.price_basis);
    const name = body.name === undefined ? String(plan.name) : clampText(body.name, 120);
    const billing = body.billingPeriod === undefined ? String(plan.billing_period) : String(body.billingPeriod);
    const note = body.priceNote === undefined ? String(plan.price_note || '') : clampText(body.priceNote, 160);
    const status = body.status === undefined ? String(plan.status) : String(body.status);
    let seatLimit: number | null = plan.seat_limit === null || plan.seat_limit === undefined ? null : Number(plan.seat_limit);
    if (body.seatLimit !== undefined) {
      const raw = String(body.seatLimit).trim();
      seatLimit = raw === '' ? null : Number(raw);
      if (seatLimit !== null && (!Number.isInteger(seatLimit) || seatLimit < 1 || seatLimit > 100000)) {
        throw new ControlError(400, 'invalid_request', 'Seat cap must be empty or a whole number.');
      }
    }
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Plan name is required.');
    if (!['trial', 'monthly', 'yearly', 'custom'].includes(billing)) {
      throw new ControlError(400, 'invalid_request', 'Billing must be trial, monthly, yearly, or custom.');
    }
    if (status !== 'active' && status !== 'retired') throw new ControlError(400, 'invalid_request', 'A plan is active or retired.');
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) {
      throw new ControlError(400, 'invalid_request', 'Price must be zero or a rupee amount.');
    }
    if (basis !== 'seat' && basis !== 'flat') throw new ControlError(400, 'invalid_request', 'Price is either per seat or a flat amount.');
    await this.db.query(
      `UPDATE plans SET name = ?, billing_period = ?, price_note = ?, price_amount = ?, price_basis = ?, status = ?, seat_limit = ?, updated_at = ? WHERE id = ?`,
      [name, billing, note, amount, basis, status, seatLimit, nowSql(), plan.id],
    );
    await this.audit(actor.id, 'plan.price', 'plan', String(plan.id), { code, planCode, amount, basis, status }, ip);
    return this.getProduct(code);
  }

  async listOffers(): Promise<Record<string, unknown>[]> {
    const rows = await this.db.query(
      `SELECT o.*, p.code AS product_code, p.name AS product_name
       FROM offers o
       LEFT JOIN products p ON p.id = o.product_id
       ORDER BY o.created_at DESC`,
    );
    return rows.map((row) => this.offerJson(row));
  }

  async createOffer(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const code = String(body.code || '').trim().toLowerCase();
    const name = clampText(body.name, 120);
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(code)) throw new ControlError(400, 'invalid_request', 'Offer code must be a short slug such as diwali-20.');
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Offer name is required.');
    const scope = String(body.scope || '');
    if (scope !== 'all' && scope !== 'product') throw new ControlError(400, 'invalid_request', 'An offer covers one product or all products.');
    const kind = String(body.kind || '');
    if (kind !== 'percent' && kind !== 'amount') throw new ControlError(400, 'invalid_request', 'Discount is a percent or a rupee amount.');
    const value = money(Number(body.value));
    if (kind === 'percent' && (value <= 0 || value > 100)) throw new ControlError(400, 'invalid_request', 'Percent must be from 0.01 to 100.');
    if (kind === 'amount' && (value <= 0 || value > 10000000)) throw new ControlError(400, 'invalid_request', 'Discount amount must be greater than zero.');
    const startsAt = String(body.startsAt || '');
    const endsAt = String(body.endsAt || '');
    if (!isDay(startsAt) || !isDay(endsAt) || endsAt < startsAt) throw new ControlError(400, 'invalid_request', 'Check the offer dates.');
    let productId: string | null = null;
    if (scope === 'product') {
      const product = await this.productByCode(String(body.productCode || ''));
      productId = String(product.id);
    }
    await this.assertCodeFree(code, 'offers');
    const offerId = id();
    const status = body.release ? 'released' : 'draft';
    const now = nowSql();
    await this.db.query(
      `INSERT INTO offers (id, code, name, scope, product_id, kind, value, starts_at, ends_at, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [offerId, code, name, scope, productId, kind, value, startsAt, endsAt, status, clampText(body.note, 400), now, now],
    );
    await this.audit(actor.id, status === 'released' ? 'offer.release' : 'offer.create', 'offer', offerId, { code, scope }, ip);
    const row = await this.db.one(
      `SELECT o.*, p.code AS product_code, p.name AS product_name FROM offers o LEFT JOIN products p ON p.id = o.product_id WHERE o.id = ?`,
      [offerId],
    );
    return this.offerJson(row as SqlRow);
  }

  async setOfferStatus(actor: Staff, offerId: string, status: 'released' | 'ended', ip: string): Promise<Record<string, unknown>> {
    const row = await this.db.one('SELECT * FROM offers WHERE id = ?', [offerId]);
    if (!row) throw new ControlError(404, 'not_found', 'That offer was not found.');
    if (status === 'released' && String(row.status) === 'ended') {
      throw new ControlError(400, 'invalid_request', 'An ended offer stays ended. Create a new one.');
    }
    await this.db.query('UPDATE offers SET status = ?, updated_at = ? WHERE id = ?', [status, nowSql(), offerId]);
    await this.audit(actor.id, status === 'released' ? 'offer.release' : 'offer.end', 'offer', offerId, { code: row.code }, ip);
    const next = await this.db.one(
      `SELECT o.*, p.code AS product_code, p.name AS product_name FROM offers o LEFT JOIN products p ON p.id = o.product_id WHERE o.id = ?`,
      [offerId],
    );
    return this.offerJson(next as SqlRow);
  }

  async updateOffer(actor: Staff, offerId: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const row = await this.offerRow(offerId);
    if (String(row.status) === 'ended') throw new ControlError(400, 'invalid_request', 'An ended offer stays ended. Create a new one.');
    const draft = String(row.status) === 'draft';
    const name = body.name === undefined ? String(row.name) : clampText(body.name, 120);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Offer name is required.');
    const note = body.note === undefined ? String(row.note || '') : clampText(body.note, 400);
    const startsAt = body.startsAt === undefined ? String(row.starts_at).slice(0, 10) : String(body.startsAt);
    const endsAt = body.endsAt === undefined ? String(row.ends_at).slice(0, 10) : String(body.endsAt);
    if (!isDay(startsAt) || !isDay(endsAt) || endsAt < startsAt) throw new ControlError(400, 'invalid_request', 'Check the offer dates.');
    const kind = draft && body.kind !== undefined ? String(body.kind) : String(row.kind);
    const value = draft && body.value !== undefined ? money(Number(body.value)) : Number(row.value);
    this.assertDiscount(kind, value);
    let scope = String(row.scope);
    let productId = row.product_id as string | null;
    if (draft && body.scope !== undefined) {
      scope = String(body.scope);
      if (scope !== 'all' && scope !== 'product') throw new ControlError(400, 'invalid_request', 'An offer covers one product or all products.');
      productId = null;
      if (scope === 'product') {
        const product = await this.productByCode(String(body.productCode || ''));
        productId = String(product.id);
      }
    }
    await this.db.query(
      `UPDATE offers SET name = ?, scope = ?, product_id = ?, kind = ?, value = ?, starts_at = ?, ends_at = ?, note = ?, updated_at = ? WHERE id = ?`,
      [name, scope, productId, kind, value, startsAt, endsAt, note, nowSql(), offerId],
    );
    await this.audit(actor.id, 'offer.update', 'offer', offerId, { code: row.code }, ip);
    return this.offerJson(await this.offerJoined(offerId));
  }

  async deleteOffer(actor: Staff, offerId: string, ip: string): Promise<Record<string, unknown>> {
    const row = await this.offerRow(offerId);
    if (String(row.status) === 'ended') {
      throw new ControlError(400, 'invalid_request', 'An ended offer stays on the purchases already made.');
    }
    const used = await this.db.one('SELECT id FROM subscriptions WHERE offer_id = ? LIMIT 1', [offerId]);
    if (String(row.status) === 'draft' && !used) {
      await this.db.query('DELETE FROM offers WHERE id = ?', [offerId]);
      await this.audit(actor.id, 'offer.delete', 'offer', offerId, { code: row.code }, ip);
      return { deleted: true };
    }
    await this.db.query(`UPDATE offers SET status = 'ended', updated_at = ? WHERE id = ?`, [nowSql(), offerId]);
    await this.audit(actor.id, 'offer.end', 'offer', offerId, { code: row.code }, ip);
    return { deleted: false, offer: this.offerJson(await this.offerJoined(offerId)) };
  }

  async listCoupons(): Promise<Record<string, unknown>[]> {
    const rows = await this.db.query(
      `SELECT c.*, p.code AS product_code, p.name AS product_name
       FROM coupons c
       LEFT JOIN products p ON p.id = c.product_id
       ORDER BY c.created_at DESC`,
    );
    return rows.map((row) => this.couponJson(row));
  }

  async createCoupon(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const code = String(body.code || '').trim().toLowerCase();
    const name = clampText(body.name, 120);
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(code)) throw new ControlError(400, 'invalid_request', 'Coupon code must be a short slug such as diwali-20.');
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Coupon name is required.');
    const scope = String(body.scope || 'all');
    if (scope !== 'all' && scope !== 'product') throw new ControlError(400, 'invalid_request', 'A coupon covers one product or all products.');
    const kind = String(body.kind || '');
    const value = money(Number(body.value));
    this.assertDiscount(kind, value);
    const startsAt = String(body.startsAt || '');
    const endsAt = String(body.endsAt || '');
    if (!isDay(startsAt) || !isDay(endsAt) || endsAt < startsAt) throw new ControlError(400, 'invalid_request', 'Check the coupon dates.');
    let productId: string | null = null;
    if (scope === 'product') {
      const product = await this.productByCode(String(body.productCode || ''));
      productId = String(product.id);
    }
    await this.assertCodeFree(code, 'coupons');
    const couponId = id();
    const status = body.release ? 'released' : 'draft';
    const now = nowSql();
    await this.db.query(
      `INSERT INTO coupons (id, code, name, scope, product_id, kind, value, starts_at, ends_at, status, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [couponId, code, name, scope, productId, kind, value, startsAt, endsAt, status, clampText(body.note, 400), now, now],
    );
    await this.audit(actor.id, status === 'released' ? 'coupon.release' : 'coupon.create', 'coupon', couponId, { code, scope }, ip);
    return this.couponJson(await this.couponJoined(couponId));
  }

  async updateCoupon(actor: Staff, couponId: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const row = await this.couponRow(couponId);
    if (String(row.status) === 'ended') throw new ControlError(400, 'invalid_request', 'An ended coupon stays ended. Create a new one.');
    const draft = String(row.status) === 'draft';
    const name = body.name === undefined ? String(row.name) : clampText(body.name, 120);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Coupon name is required.');
    const note = body.note === undefined ? String(row.note || '') : clampText(body.note, 400);
    const startsAt = body.startsAt === undefined ? String(row.starts_at).slice(0, 10) : String(body.startsAt);
    const endsAt = body.endsAt === undefined ? String(row.ends_at).slice(0, 10) : String(body.endsAt);
    if (!isDay(startsAt) || !isDay(endsAt) || endsAt < startsAt) throw new ControlError(400, 'invalid_request', 'Check the coupon dates.');
    const kind = draft && body.kind !== undefined ? String(body.kind) : String(row.kind);
    const value = draft && body.value !== undefined ? money(Number(body.value)) : Number(row.value);
    this.assertDiscount(kind, value);
    let scope = String(row.scope);
    let productId = row.product_id as string | null;
    if (draft && body.scope !== undefined) {
      scope = String(body.scope);
      if (scope !== 'all' && scope !== 'product') throw new ControlError(400, 'invalid_request', 'A coupon covers one product or all products.');
      productId = null;
      if (scope === 'product') {
        const product = await this.productByCode(String(body.productCode || ''));
        productId = String(product.id);
      }
    }
    await this.db.query(
      `UPDATE coupons SET name = ?, scope = ?, product_id = ?, kind = ?, value = ?, starts_at = ?, ends_at = ?, note = ?, updated_at = ? WHERE id = ?`,
      [name, scope, productId, kind, value, startsAt, endsAt, note, nowSql(), couponId],
    );
    await this.audit(actor.id, 'coupon.update', 'coupon', couponId, { code: row.code }, ip);
    return this.couponJson(await this.couponJoined(couponId));
  }

  async setCouponStatus(actor: Staff, couponId: string, status: 'released' | 'ended', ip: string): Promise<Record<string, unknown>> {
    const row = await this.couponRow(couponId);
    if (status === 'released' && String(row.status) === 'ended') {
      throw new ControlError(400, 'invalid_request', 'An ended coupon stays ended. Create a new one.');
    }
    await this.db.query('UPDATE coupons SET status = ?, updated_at = ? WHERE id = ?', [status, nowSql(), couponId]);
    await this.audit(actor.id, status === 'released' ? 'coupon.release' : 'coupon.end', 'coupon', couponId, { code: row.code }, ip);
    return this.couponJson(await this.couponJoined(couponId));
  }

  async deleteCoupon(actor: Staff, couponId: string, ip: string): Promise<Record<string, unknown>> {
    const row = await this.couponRow(couponId);
    if (String(row.status) === 'ended') {
      throw new ControlError(400, 'invalid_request', 'An ended coupon stays on the customers it was given to.');
    }
    const used = await this.db.one('SELECT id FROM subscriptions WHERE coupon_id = ? LIMIT 1', [couponId]);
    if (String(row.status) === 'draft' && !used) {
      await this.db.query('DELETE FROM coupons WHERE id = ?', [couponId]);
      await this.audit(actor.id, 'coupon.delete', 'coupon', couponId, { code: row.code }, ip);
      return { deleted: true };
    }
    await this.db.query(`UPDATE coupons SET status = 'ended', updated_at = ? WHERE id = ?`, [nowSql(), couponId]);
    await this.audit(actor.id, 'coupon.end', 'coupon', couponId, { code: row.code }, ip);
    return { deleted: false, coupon: this.couponJson(await this.couponJoined(couponId)) };
  }

  async revenue(): Promise<Record<string, unknown>> {
    const totals = await this.db.one(
      `SELECT COUNT(*) AS n, COALESCE(SUM(list_amount), 0) AS list_amount, COALESCE(SUM(discount_amount), 0) AS discount_amount,
              COALESCE(SUM(purchase_amount), 0) AS purchase_amount
       FROM subscriptions WHERE status <> 'cancelled'`,
    );
    const rows = await this.db.query(
      `SELECT s.*, c.name AS customer_name, p.code AS product_code, p.name AS product_name, pl.name AS plan_name, pl.code AS plan_code
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN products p ON p.id = s.product_id
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.status <> 'cancelled'
       ORDER BY s.created_at DESC
       LIMIT 200`,
    );
    return {
      currency: 'INR',
      subscriptions: Number(totals?.n ?? 0),
      listAmount: Number(totals?.list_amount ?? 0),
      discountAmount: Number(totals?.discount_amount ?? 0),
      purchaseAmount: Number(totals?.purchase_amount ?? 0),
      purchases: rows.map((row) => this.subscriptionBrief(row)),
      offers: await this.listOffers(),
    };
  }

  async report(type: string, from: string, to: string): Promise<Record<string, unknown>> {
    const kind = type.trim().toLowerCase();
    const meta = REPORTS.find((item) => item.type === kind);
    if (!meta) throw new ControlError(400, 'invalid_request', 'That report is not available.');
    const range = this.dayRange(from, to);
    const rows = await this.reportRows(kind, range);
    return {
      type: kind,
      title: meta.title,
      summary: meta.summary,
      from: range.labelFrom,
      to: range.labelTo,
      generatedAt: new Date().toISOString(),
      columns: meta.columns,
      rows,
    };
  }

  async auditLog(): Promise<Record<string, unknown>[]> {
    const rows = await this.db.query(
      `SELECT a.*, u.email AS actor_email FROM audit_log a
       LEFT JOIN staff_users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT 200`,
    );
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      detail: typeof row.detail === 'string' ? JSON.parse(row.detail || '{}') : row.detail,
      actorEmail: row.actor_email || '',
      ip: row.ip,
      createdAt: sqlToIso(String(row.created_at)),
    }));
  }

  async listStaff(): Promise<Staff[]> {
    const rows = await this.db.query('SELECT * FROM staff_users ORDER BY name');
    const items: Staff[] = [];
    for (const row of rows) items.push(await this.present(row));
    return items;
  }

  async createStaff(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Staff> {
    const email = clampText(body.email, 190).toLowerCase();
    const name = clampText(body.name, 120);
    const roleSlug = String(body.role || '');
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ControlError(400, 'invalid_request', 'Enter a valid email.');
    }
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Name is required.');
    if (password.length < 10) throw new ControlError(400, 'invalid_request', 'Password must be at least 10 characters.');
    const phone = this.phoneOrEmpty(body.phone);
    const role = await this.roleBySlug(roleSlug);
    this.assertSuperChange(actor, '', roleSlug);
    if (roleSlug === 'super_admin') await this.assertSuperEdit(actor, actor, body);
    const staffId = id();
    const now = nowSql();
    try {
      await this.db.query(
        `INSERT INTO staff_users (id, email, name, phone, password_hash, role, role_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [staffId, email, name, phone, await hash(password, 10), roleSlug, role.id, now, now],
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ControlError(400, 'invalid_request', 'That email is already on the team.');
      }
      throw error;
    }
    await this.audit(actor.id, 'staff.create', 'staff', staffId, { email, role: roleSlug }, ip);
    const row = await this.db.one('SELECT * FROM staff_users WHERE id = ?', [staffId]);
    return this.present(row as SqlRow);
  }

  async getStaff(staffId: string): Promise<Staff> {
    const row = await this.db.one('SELECT * FROM staff_users WHERE id = ?', [staffId]);
    if (!row) throw new ControlError(404, 'not_found', 'That teammate was not found.');
    return this.present(row);
  }

  async updateStaff(actor: Staff, staffId: string, body: Record<string, unknown>, ip: string): Promise<Staff> {
    const current = await this.getStaff(staffId);
    const name = body.name !== undefined ? clampText(body.name, 120) : current.name;
    const email = body.email !== undefined ? clampText(body.email, 190).toLowerCase() : current.email;
    const phone = body.phone !== undefined ? this.phoneOrEmpty(body.phone) : current.phone || '';
    const nextSlug = body.role !== undefined ? String(body.role) : current.role;
    const status = body.status !== undefined ? String(body.status) : current.status;
    const nextPassword = String(body.password || '');
    this.assertPerson(name, email, phone);
    if (status !== 'active' && status !== 'disabled') {
      throw new ControlError(400, 'invalid_request', 'Account status must be active or disabled.');
    }
    if (nextPassword && nextPassword.length < 10) {
      throw new ControlError(400, 'invalid_request', 'Password must be at least 10 characters.');
    }
    const role = await this.roleBySlug(nextSlug);
    this.assertSuperChange(actor, current.role, nextSlug);
    if (current.role === 'super_admin' || nextSlug === 'super_admin') await this.assertSuperEdit(actor, current, body);
    if (current.role === 'super_admin' && (nextSlug !== 'super_admin' || status !== 'active')) {
      await this.assertSuperRemains(staffId);
    }
    const now = nowSql();
    try {
      await this.db.query(
        'UPDATE staff_users SET name = ?, email = ?, phone = ?, role = ?, role_id = ?, status = ?, updated_at = ? WHERE id = ?',
        [name, email, phone, nextSlug, role.id, status, now, staffId],
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ControlError(400, 'invalid_request', 'That email is already on the team.');
      }
      throw error;
    }
    if (nextPassword) {
      await this.db.query('UPDATE staff_users SET password_hash = ? WHERE id = ?', [await hash(nextPassword, 10), staffId]);
    }
    await this.audit(actor.id, 'staff.update', 'staff', staffId, { email, role: nextSlug, status }, ip);
    return this.getStaff(staffId);
  }

  async deleteStaff(actor: Staff, staffId: string, ip: string): Promise<void> {
    const current = await this.getStaff(staffId);
    if (current.role === 'super_admin') {
      throw new ControlError(400, 'invalid_request', 'A Super Admin cannot be deleted.');
    }
    if (actor.id === current.id) {
      throw new ControlError(400, 'invalid_request', 'You cannot delete your own account.');
    }
    this.removeAvatarFiles(staffId);
    await this.db.query('DELETE FROM staff_users WHERE id = ?', [staffId]);
    await this.audit(actor.id, 'staff.delete', 'staff', staffId, { email: current.email, role: current.role }, ip);
  }

  async updateProfile(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Staff> {
    const name = clampText(body.name, 120);
    const email = clampText(body.email, 190).toLowerCase();
    const phone = this.phoneOrEmpty(body.phone);
    this.assertPerson(name, email, phone);
    if (actor.role === 'super_admin') await this.assertProfileGate(actor, body);
    try {
      await this.db.query('UPDATE staff_users SET name = ?, email = ?, phone = ?, updated_at = ? WHERE id = ?', [
        name,
        email,
        phone,
        nowSql(),
        actor.id,
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ControlError(400, 'invalid_request', 'That email is already on the team.');
      }
      throw error;
    }
    await this.audit(actor.id, 'staff.profile', 'staff', actor.id, { email }, ip);
    return this.getStaff(actor.id);
  }

  async changePassword(actor: Staff, body: Record<string, unknown>, ip: string): Promise<void> {
    const password = String(body.password || '');
    const confirm = String(body.passwordConfirm || '');
    if (password.length < 10) throw new ControlError(400, 'invalid_request', 'Password must be at least 10 characters.');
    if (password !== confirm) throw new ControlError(400, 'invalid_request', 'New password and confirmation do not match.');
    if (actor.role === 'super_admin') await this.assertProfileGate(actor, body);
    else await this.assertOwnPassword(actor.id, body.currentPassword);
    await this.db.query('UPDATE staff_users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      await hash(password, 10),
      nowSql(),
      actor.id,
    ]);
    await this.audit(actor.id, 'staff.password', 'staff', actor.id, {}, ip);
  }

  async saveAvatar(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Staff> {
    if (actor.role === 'super_admin') await this.assertProfileGate(actor, body);
    const image = this.decodeImage(body);
    this.writeAvatar(actor.id, image.ext, image.bytes);
    await this.db.query('UPDATE staff_users SET avatar = ?, updated_at = ? WHERE id = ?', [
      actor.id + '.' + image.ext,
      nowSql(),
      actor.id,
    ]);
    await this.audit(actor.id, 'staff.avatar', 'staff', actor.id, {}, ip);
    return this.getStaff(actor.id);
  }

  async clearAvatar(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Staff> {
    if (actor.role === 'super_admin') await this.assertProfileGate(actor, body);
    this.removeAvatarFiles(actor.id);
    await this.db.query("UPDATE staff_users SET avatar = '', updated_at = ? WHERE id = ?", [nowSql(), actor.id]);
    await this.audit(actor.id, 'staff.avatar', 'staff', actor.id, { removed: true }, ip);
    return this.getStaff(actor.id);
  }

  async avatarData(actor: Staff, staffId: string): Promise<{ contentType: string; data: string }> {
    if (actor.id !== staffId && actor.role !== 'super_admin' && !actor.permissions.includes('users.view')) {
      throw new ControlError(403, 'forbidden', 'This account cannot do that.');
    }
    const row = await this.db.one('SELECT avatar FROM staff_users WHERE id = ?', [staffId]);
    const fileName = String(row?.avatar || '');
    const ext = fileName.split('.').pop() || '';
    const types: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    const path = join(this.avatarDir(), fileName);
    if (!row || !types[ext] || fileName !== staffId + '.' + ext || !existsSync(path)) {
      throw new ControlError(404, 'not_found', 'No photo is saved.');
    }
    return { contentType: types[ext], data: readFileSync(path).toString('base64') };
  }

  async setPresence(actor: Staff, body: Record<string, unknown>): Promise<Staff> {
    const presence = String(body.presence || '');
    const allowed = new Set(['online', 'busy', 'call', 'break', 'away', 'unavailable', 'custom']);
    if (!allowed.has(presence)) throw new ControlError(400, 'invalid_request', 'Choose a status from the list.');
    const source = body.source === 'auto' ? 'auto' : 'manual';
    if (source === 'auto' && presence !== 'online' && presence !== 'away') {
      throw new ControlError(400, 'invalid_request', 'Automatic status can only be online or away.');
    }
    const label = presence === 'custom' ? clampText(body.label, 40) : '';
    if (presence === 'custom' && label.length < 2) {
      throw new ControlError(400, 'invalid_request', 'Enter a short status, such as In a meeting.');
    }
    const now = nowSql();
    await this.db.query(
      'UPDATE staff_users SET presence = ?, presence_label = ?, presence_source = ?, presence_at = ?, last_seen_at = ? WHERE id = ?',
      [presence, label, source, now, now, actor.id],
    );
    if (source === 'manual') await this.audit(actor.id, 'staff.presence', 'staff', actor.id, { presence, label }, '');
    return this.getStaff(actor.id);
  }

  async touchSeen(actor: Staff, ip = '', where?: GeoFix): Promise<Staff> {
    const row = await this.db.one('SELECT * FROM staff_users WHERE id = ?', [actor.id]);
    if (row && this.settings) await this.settings.assertEntry(row, ip, where, 'recheck');
    await this.db.query('UPDATE staff_users SET last_seen_at = ? WHERE id = ?', [nowSql(), actor.id]);
    return this.getStaff(actor.id);
  }

  async listLayouts(actor: Staff): Promise<Record<string, Record<string, string[]>>> {
    const rows = await this.db.query('SELECT page_key, layout_json FROM staff_layouts WHERE staff_id = ?', [actor.id]);
    const layouts: Record<string, Record<string, string[]>> = {};
    for (const row of rows) {
      const page = this.layoutPage(String(row.page_key || ''));
      const cols = this.parseLayout(row.layout_json);
      if (page && cols) layouts[page] = cols;
    }
    return layouts;
  }

  async saveLayout(actor: Staff, page: string, cols: unknown): Promise<Record<string, string[]>> {
    const key = this.layoutPage(page);
    if (!key) throw new ControlError(400, 'invalid_request', 'That page cannot be saved.');
    const clean = this.cleanLayout(cols);
    await this.db.query(
      `INSERT INTO staff_layouts (staff_id, page_key, layout_json, updated_at) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json), updated_at = VALUES(updated_at)`,
      [actor.id, key, JSON.stringify(clean), nowSql()],
    );
    return clean;
  }

  async resetLayout(actor: Staff, page: string): Promise<void> {
    const key = this.layoutPage(page);
    if (!key) throw new ControlError(400, 'invalid_request', 'That page cannot be saved.');
    await this.db.query('DELETE FROM staff_layouts WHERE staff_id = ? AND page_key = ?', [actor.id, key]);
  }

  private layoutPage(page: string): string {
    const key = page.toLowerCase().trim();
    return /^[a-z0-9-]{1,40}$/.test(key) ? key : '';
  }

  private parseLayout(raw: unknown): Record<string, string[]> | null {
    try {
      const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return this.cleanLayout(value);
    } catch {
      return null;
    }
  }

  private cleanLayout(raw: unknown): Record<string, string[]> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ControlError(400, 'invalid_request', 'Choose where each card sits.');
    }
    const cols: Record<string, string[]> = {};
    const seen = new Set<string>();
    for (const [name, ids] of Object.entries(raw as Record<string, unknown>).slice(0, 8)) {
      const col = name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
      if (!col || !Array.isArray(ids)) continue;
      const list: string[] = [];
      for (const id of ids) {
        const box = String(id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
        if (!box || seen.has(box)) continue;
        seen.add(box);
        list.push(box);
        if (list.length >= 40) break;
      }
      cols[col] = list;
    }
    return cols;
  }

  async listRoles(): Promise<Record<string, unknown>[]> {
    const rank: Record<string, number> = { super_admin: 0, admin: 1, support: 2, release_manager: 3, viewer: 4 };
    const roles = await this.db.query('SELECT * FROM roles');
    roles.sort((a, b) => {
      const left = rank[String(a.slug)] ?? 50;
      const right = rank[String(b.slug)] ?? 50;
      if (left !== right) return left - right;
      return String(a.name).localeCompare(String(b.name));
    });
    const items: Record<string, unknown>[] = [];
    for (const role of roles) {
      const granted = await this.db.one('SELECT COUNT(*) AS n FROM role_permissions WHERE role_id = ?', [role.id]);
      const users = await this.db.one('SELECT COUNT(*) AS n FROM staff_users WHERE role_id = ?', [role.id]);
      items.push(this.roleCard(role, Number(granted?.n ?? 0), Number(users?.n ?? 0)));
    }
    return items;
  }

  async getRole(roleId: string): Promise<Record<string, unknown>> {
    const role = await this.db.one('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) throw new ControlError(404, 'not_found', 'That role was not found.');
    const granted = await this.db.query('SELECT permission FROM role_permissions WHERE role_id = ?', [roleId]);
    const members = await this.db.query('SELECT id, name, email, status FROM staff_users WHERE role_id = ? ORDER BY name', [roleId]);
    return {
      role: this.roleCard(role, granted.length, members.length),
      granted: String(role.slug) === 'super_admin' ? ALL_SLUGS : granted.map((row) => String(row.permission)),
      catalog: PERMISSIONS,
      members: members.map((row) => ({ id: row.id, name: row.name, email: row.email, status: row.status })),
    };
  }

  async createRole(actor: Staff, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const name = clampText(body.name, 80);
    const description = clampText(body.description, 240);
    const slug = this.roleSlug(name);
    if (name.length < 2 || slug.length < 2) throw new ControlError(400, 'invalid_request', 'Role name is required.');
    const taken = await this.db.one('SELECT id FROM roles WHERE slug = ?', [slug]);
    if (taken) throw new ControlError(400, 'invalid_request', 'A role with that name already exists.');
    const now = nowSql();
    const roleId = id();
    await this.db.query(
      `INSERT INTO roles (id, slug, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [roleId, slug, name, description, now, now],
    );
    await this.audit(actor.id, 'role.create', 'role', roleId, { slug }, ip);
    return this.getRole(roleId);
  }

  async updateRole(actor: Staff, roleId: string, body: Record<string, unknown>, ip: string): Promise<Record<string, unknown>> {
    const role = await this.db.one('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) throw new ControlError(404, 'not_found', 'That role was not found.');
    if (String(role.slug) === 'super_admin' && actor.role !== 'super_admin') {
      throw new ControlError(403, 'forbidden', 'Only a Super Admin can change the Super Admin role.');
    }
    const name = clampText(body.name, 80) || String(role.name);
    const description = body.description !== undefined ? clampText(body.description, 240) : String(role.description || '');
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Role name is required.');
    await this.db.query('UPDATE roles SET name = ?, description = ?, updated_at = ? WHERE id = ?', [name, description, nowSql(), roleId]);
    if (String(role.slug) !== 'super_admin' && Array.isArray(body.permissions)) {
      const allowed = new Set(ALL_SLUGS);
      const chosen = [...new Set(body.permissions.map((item) => String(item)))].filter((item) => allowed.has(item));
      await this.db.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
      for (const permission of chosen) {
        await this.db.query('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)', [roleId, permission]);
      }
    }
    await this.audit(actor.id, 'role.update', 'role', roleId, { slug: role.slug }, ip);
    return this.getRole(roleId);
  }

  async deleteRole(actor: Staff, roleId: string, ip: string): Promise<void> {
    const role = await this.db.one('SELECT * FROM roles WHERE id = ?', [roleId]);
    if (!role) throw new ControlError(404, 'not_found', 'That role was not found.');
    if (Number(role.is_system) === 1) throw new ControlError(400, 'invalid_request', 'A system role cannot be deleted.');
    const users = await this.db.one('SELECT COUNT(*) AS n FROM staff_users WHERE role_id = ?', [roleId]);
    if (Number(users?.n ?? 0) > 0) throw new ControlError(400, 'invalid_request', 'Move the people on this role before deleting it.');
    await this.db.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await this.db.query('DELETE FROM roles WHERE id = ?', [roleId]);
    await this.audit(actor.id, 'role.delete', 'role', roleId, { slug: role.slug }, ip);
  }

  async checkLease(body: unknown, ip: string): Promise<{ lease: LeaseV1; signature: string; alg: 'Ed25519'; kid: string }> {
    const caller = this.callerKey(ip);
    let parsed: CheckInput;
    try {
      parsed = this.parseCheck(body);
    } catch (error) {
      this.blockBurst(caller, 'bad', 30);
      throw error;
    }
    const now = Math.floor(Date.now() / 1000);
    const product = await this.db.one('SELECT * FROM products WHERE code = ?', [parsed.product]);
    if (!product) {
      this.blockBurst(caller, 'miss', 30);
      return this.signing.signLease(this.blankLease(parsed, 'unknown_product', now));
    }
    if (!parsed.licenseKey) {
      return this.signing.signLease(this.blankLease(parsed, 'unlicensed', now, product));
    }
    const key = await this.db.one(
      `SELECT k.*, p.code AS product_code
       FROM license_keys k
       JOIN subscriptions s ON s.id = k.subscription_id
       JOIN products p ON p.id = s.product_id
       WHERE k.key_hash = ?`,
      [sha256(parsed.licenseKey)],
    );
    if (!key || String(key.product_code) !== parsed.product) {
      this.blockBurst(caller, 'fail', 20);
      if (!key) return this.signing.signLease(this.blankLease(parsed, 'unknown_key', now, product));
      return this.signing.signLease(this.blankLease(parsed, 'product_mismatch', now, product));
    }
    this.blockBurst(sha256(parsed.licenseKey) + ':' + parsed.instanceId, 'ok', 180);
    const lease = await this.evaluateMatched(parsed, String(key.id), String(key.subscription_id), String(key.status), now);
    return this.signing.signLease(lease);
  }

  private blockBurst(caller: string, kind: string, limit: number): void {
    if (!this.leaseLimit.allow(kind + ':' + caller, limit, 60_000)) {
      throw new ControlError(429, 'rate_limited', 'Too many check-ins. Try again shortly. This is not a revoke.');
    }
  }

  private callerKey(ip: string): string {
    const clean = ip.replace(/^::ffff:/, '').trim().slice(0, 64);
    return clean || 'unknown';
  }

  private async evaluateMatched(
    parsed: CheckInput,
    keyId: string,
    subId: string,
    keyStatus: string,
    now: number,
  ): Promise<LeaseV1> {
    return this.db.tx(async (conn) => {
      const rows = await connQuery(
        conn,
        `SELECT s.*, p.code AS product_code, p.instance_kind, p.seat_unit AS product_seat_unit, p.host_policy AS product_host_policy, p.key_tag,
                pl.seat_limit AS plan_seat_limit, pl.entitlements_mode AS plan_mode, pl.features AS plan_features, pl.limits_json AS plan_limits
         FROM subscriptions s
         JOIN products p ON p.id = s.product_id
         JOIN plans pl ON pl.id = s.plan_id
         WHERE s.id = ? FOR UPDATE`,
        [subId],
      );
      const row = rows[0];
      if (!row) return this.blankLease(parsed, 'unknown_key', now);
      const kind = (String(row.instance_kind) || 'host') as 'host' | 'device' | 'tenant';
      let verdict: Verdict = keyStatus === 'active' ? this.liveVerdict(row, now) : 'revoked';
      const binding = this.resolveBinding(row, parsed.binding, kind, verdict);
      verdict = binding.verdict;
      const existing = await connQuery(
        conn,
        'SELECT id FROM instances WHERE subscription_id = ? AND instance_id = ?',
        [subId, parsed.instanceId],
      );
      const countRows = await connQuery(conn, 'SELECT COUNT(*) AS n FROM instances WHERE subscription_id = ?', [subId]);
      const count = Number(countRows[0]?.n ?? 0);
      if (!existing.length && binding.ok && count >= Number(row.max_instances)) {
        verdict = 'instance_limit';
      }
      const releases = await connQuery(
        conn,
        `SELECT version, has_package FROM releases WHERE product_id = ? AND channel = ? AND state = 'published'`,
        [row.product_id, row.channel],
      );
      const published = releases
        .map((item) => ({ version: String(item.version), hasPackage: flag(item.has_package) }))
        .filter((item) => isSemver(item.version))
        .sort((a, b) => compareSemver(b.version, a.version));
      const latest = published[0]?.version ?? null;
      let hasPackage = published[0]?.hasPackage ?? false;
      if (row.version_pin) {
        const pinned = await connQuery(
          conn,
          'SELECT has_package, state FROM releases WHERE product_id = ? AND channel = ? AND version = ?',
          [row.product_id, row.channel, row.version_pin],
        );
        hasPackage = pinned[0] && String(pinned[0].state) !== 'yanked' ? flag(pinned[0].has_package) : false;
      }
      const pending = await connQuery(
        conn,
        `SELECT id, command_type, payload FROM commands
         WHERE subscription_id = ? AND status = 'pending' AND (instance_id IS NULL OR instance_id = '' OR instance_id = ?)
         ORDER BY created_at LIMIT 10`,
        [subId, parsed.instanceId],
      );
      const commands = [];
      for (const command of pending) {
        const payload = primitivePayload(command.payload);
        if (!payload) continue;
        commands.push({ id: String(command.id), type: String(command.command_type), payload });
        await connQuery(conn, `UPDATE commands SET status = 'delivered', delivered_at = ? WHERE id = ?`, [
          nowSql(),
          command.id,
        ]);
      }
      const mode = String(row.entitlements_mode) === 'inherit' ? String(row.plan_mode) : String(row.entitlements_mode);
      const features = asArray(String(row.entitlements_mode) === 'inherit' ? row.plan_features : row.features);
      const limits = asObject(String(row.entitlements_mode) === 'inherit' ? row.plan_limits : row.limits_json);
      const seatLimit = row.seat_limit === null || row.seat_limit === undefined ? nullableInt(row.plan_seat_limit) : Number(row.seat_limit);
      let extraOutlets: AssembleInput['extraOutlets'];
      if (opensOutlets(String(row.product_code)) && !row.outlet_of) {
        const linked = await connQuery(
          conn,
          `SELECT s.*, pl.seat_limit AS plan_seat_limit FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id
           WHERE s.outlet_of = ? ORDER BY s.created_at, s.id`,
          [subId],
        );
        extraOutlets = linked.map((item) => ({
          subscriptionId: String(item.id),
          verdict: this.liveVerdict(item, now),
          termEndsAt: String(item.ends_at),
          seatLimit: item.seat_limit === null || item.seat_limit === undefined ? nullableInt(item.plan_seat_limit) : Number(item.seat_limit),
          seatsUsed: parsed.outletSeats?.[String(item.id)] ?? null,
          enforceSeats: flag(item.enforce_seat_limit),
        }));
      }
      const input: AssembleInput = {
        now,
        product: parsed.product,
        subscriptionId: subId,
        licenseKeyId: keyId,
        instanceId: parsed.instanceId,
        verdict,
        status: this.liveVerdict(row, now),
        termStartsAt: String(row.starts_at),
        termEndsAt: String(row.ends_at),
        graceDays: Number(row.grace_days),
        seatUnit: String(row.product_seat_unit),
        seatLimit,
        seatsUsed: parsed.seats,
        enforceSeats: flag(row.enforce_seat_limit),
        entitlementsMode: mode === 'list' ? 'list' : 'all',
        features,
        limits,
        bindingKind: kind,
        bindingPolicy: binding.policy,
        bindingValue: parsed.binding ? normalizeBinding(kind, parsed.binding) : '',
        allowed: binding.allowed,
        channel: String(row.channel || 'stable'),
        latest,
        pinned: row.version_pin ? String(row.version_pin) : null,
        minimum: row.min_version ? String(row.min_version) : null,
        hasPackage,
        blockOutdated: flag(row.block_outdated),
        reportedVersion: parsed.version,
        commands,
        extraOutlets,
        mainOutletSeats: parsed.outletSeats?.[subId] ?? null,
      };
      const lease = assembleLease(input);
      if (binding.verdict === 'binding_mismatch' || binding.verdict === 'binding_unbound') {
        await connQuery(conn, 'UPDATE subscriptions SET last_reject = ?, last_reject_at = ? WHERE id = ?', [
          (parsed.binding || '').slice(0, 190),
          nowSql(),
          subId,
        ]);
      } else if (binding.persist && lease.verdict !== 'instance_limit') {
        await connQuery(conn, 'UPDATE subscriptions SET bindings = ?, updated_at = ? WHERE id = ?', [
          JSON.stringify(binding.allowed),
          nowSql(),
          subId,
        ]);
      }
      const mayWrite = existing.length > 0 || (binding.ok && lease.verdict !== 'instance_limit');
      if (mayWrite) {
        const usage = JSON.stringify(parsed.outletSeats ? { seats: parsed.seats, outlets: parsed.outletSeats } : { seats: parsed.seats });
        if (existing.length) {
          await connQuery(
            conn,
            `UPDATE instances SET license_key_id = ?, binding = ?, runtime = ?, version = ?, usage_json = ?, agent_version = ?, last_verdict = ?, last_seen_at = ?
             WHERE subscription_id = ? AND instance_id = ?`,
            [
              keyId,
              lease.binding.value,
              parsed.runtime,
              parsed.version,
              usage,
              parsed.agent,
              lease.verdict,
              nowSql(),
              subId,
              parsed.instanceId,
            ],
          );
        } else {
          await connQuery(
            conn,
            `INSERT INTO instances
              (id, subscription_id, license_key_id, instance_id, binding, runtime, version, usage_json, agent_version, last_verdict, last_seen_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              id(),
              subId,
              keyId,
              parsed.instanceId,
              lease.binding.value,
              parsed.runtime,
              parsed.version,
              usage,
              parsed.agent,
              lease.verdict,
              nowSql(),
              nowSql(),
            ],
          );
        }
      }
      return lease;
    });
  }

  private liveVerdict(row: SqlRow, now: number): Verdict {
    const effective = effectiveStatus(
      String(row.status) as StoredStatus,
      String(row.starts_at),
      String(row.ends_at),
      Number(row.grace_days),
      now * 1000,
    );
    return effective as Verdict;
  }

  private resolveBinding(
    row: SqlRow,
    rawBinding: string,
    kind: 'host' | 'device' | 'tenant',
    verdict: Verdict,
  ): { ok: boolean; persist: boolean; verdict: Verdict; policy: 'any' | 'bind_first' | 'allowlist'; allowed: string[] } {
    const policyName = String(row.host_policy) === 'inherit' ? String(row.product_host_policy) : String(row.host_policy);
    const policy = (PRODUCT_POLICY.has(policyName) ? policyName : 'bind_first') as 'any' | 'bind_first' | 'allowlist';
    const allowed = asArray(row.bindings).map((item) => normalizeBinding(kind, item));
    if (!(USABLE as readonly string[]).includes(verdict)) {
      return { ok: false, persist: false, verdict, policy, allowed };
    }
    if (policy === 'any') return { ok: true, persist: false, verdict, policy, allowed };
    const value = rawBinding ? normalizeBinding(kind, rawBinding) : '';
    if (!value) return { ok: false, persist: false, verdict: 'binding_unbound', policy, allowed };
    if (allowed.length === 0) {
      if (policy === 'allowlist') return { ok: false, persist: false, verdict: 'binding_unbound', policy, allowed };
      return { ok: true, persist: true, verdict, policy, allowed: [value] };
    }
    if (!allowed.includes(value)) {
      return { ok: false, persist: false, verdict: 'binding_mismatch', policy, allowed };
    }
    return { ok: true, persist: false, verdict, policy, allowed };
  }

  private blankLease(parsed: CheckInput, verdict: Verdict, now: number, product?: SqlRow | null): LeaseV1 {
    return assembleLease({
      now,
      product: parsed.product,
      subscriptionId: '',
      licenseKeyId: '',
      instanceId: parsed.instanceId,
      verdict,
      status: verdict,
      termStartsAt: '1970-01-01',
      termEndsAt: '1970-01-01',
      graceDays: 0,
      seatUnit: product ? String(product.seat_unit || 'user') : 'user',
      seatLimit: null,
      seatsUsed: parsed.seats,
      enforceSeats: false,
      entitlementsMode: 'list',
      features: [],
      limits: {},
      bindingKind: product ? ((String(product.instance_kind) || 'host') as 'host' | 'device' | 'tenant') : 'host',
      bindingPolicy: 'allowlist',
      bindingValue: parsed.binding,
      allowed: [],
      channel: 'stable',
      latest: null,
      pinned: null,
      minimum: null,
      hasPackage: false,
      blockOutdated: false,
      reportedVersion: parsed.version,
      commands: [],
    });
  }

  private parseCheck(body: unknown): CheckInput {
    if (!body || typeof body !== 'object') {
      throw new ControlError(400, 'invalid_request', 'Check-in body must be a JSON object.');
    }
    const record = body as Record<string, unknown>;
    const product = String(record.product ?? '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(product)) {
      throw new ControlError(400, 'invalid_request', 'product must be the catalog code, such as crm or hrms-payroll.');
    }
    const licenseKey = String(record.license_key ?? record.licenseKey ?? '').trim();
    if (licenseKey.length > 120) throw new ControlError(400, 'invalid_request', 'license_key is too long.');
    const instanceId = String(record.instance_id ?? record.instanceId ?? '').trim();
    if (!/^[\x21-\x7E]{8,128}$/.test(instanceId)) {
      throw new ControlError(400, 'invalid_request', 'instance_id must be 8 to 128 printable characters and must stay the same for this install.');
    }
    const binding = String(record.binding ?? record.host ?? '').trim().slice(0, 190);
    const runtime = String(record.runtime ?? '').trim();
    if (runtime && !/^[A-Za-z0-9.+_-]{1,32}$/.test(runtime)) {
      throw new ControlError(400, 'invalid_request', 'runtime contains characters Control cannot store.');
    }
    const version = String(record.version ?? '').trim().slice(0, 32);
    const agent = String(record.agent_version ?? record.agentVersion ?? '').trim().slice(0, 32);
    let seats: number | null = null;
    if (record.usage && typeof record.usage === 'object') {
      const raw = (record.usage as Record<string, unknown>).seats;
      if (raw !== undefined && raw !== null && raw !== '') {
        const value = Number(raw);
        if (!Number.isSafeInteger(value) || value < 0) {
          throw new ControlError(400, 'invalid_request', 'usage.seats must be a whole number.');
        }
        seats = value;
      }
    }
    let outletSeats: Record<string, number> | null = null;
    const rawOutlets = record.usage && typeof record.usage === 'object' ? (record.usage as Record<string, unknown>).outlets : undefined;
    if (rawOutlets !== undefined && rawOutlets !== null) {
      if (typeof rawOutlets !== 'object' || Array.isArray(rawOutlets) || Object.keys(rawOutlets).length > 200) {
        throw new ControlError(400, 'invalid_request', 'usage.outlets must map each outlet subscription id to its headcount.');
      }
      outletSeats = {};
      for (const [subscriptionId, raw] of Object.entries(rawOutlets as Record<string, unknown>)) {
        const value = Number(raw);
        if (!/^[A-Za-z0-9-]{1,36}$/.test(subscriptionId) || !Number.isSafeInteger(value) || value < 0) {
          throw new ControlError(400, 'invalid_request', 'usage.outlets must map each outlet subscription id to a whole number.');
        }
        outletSeats[subscriptionId] = value;
      }
    }
    return { product, licenseKey, instanceId, binding, runtime, version, agent, seats, outletSeats };
  }

  private async productByCode(code: string): Promise<SqlRow> {
    const row = await this.db.one('SELECT * FROM products WHERE code = ?', [code.trim().toLowerCase()]);
    if (!row) throw new ControlError(404, 'not_found', 'That product is not in the catalog.');
    return row;
  }

  private async customerById(customerId: string): Promise<SqlRow> {
    const row = await this.db.one('SELECT * FROM customers WHERE id = ?', [customerId]);
    if (!row) throw new ControlError(404, 'not_found', 'That customer was not found.');
    return row;
  }

  private async subscriptionRow(subId: string): Promise<SqlRow> {
    const row = await this.db.one(
      `SELECT s.*, p.code AS product_code, p.name AS product_name, p.instance_kind, p.key_tag, p.seat_unit AS product_seat_unit,
              pl.name AS plan_name, pl.code AS plan_code, pl.seat_limit AS plan_seat_limit, pl.billing_period, pl.price_amount, pl.price_basis,
              c.name AS customer_name
       FROM subscriptions s
       JOIN products p ON p.id = s.product_id
       JOIN plans pl ON pl.id = s.plan_id
       JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`,
      [subId],
    );
    if (!row) throw new ControlError(404, 'not_found', 'That subscription was not found.');
    return row;
  }

  private async releaseById(releaseId: string): Promise<SqlRow> {
    const row = await this.db.one('SELECT * FROM releases WHERE id = ?', [releaseId]);
    if (!row) throw new ControlError(404, 'not_found', 'That release was not found.');
    return row;
  }

  private productJson(row: SqlRow): Record<string, unknown> {
    return {
      id: row.id,
      code: row.code,
      keyTag: row.key_tag,
      name: row.name,
      summary: row.summary,
      status: row.status,
      instanceKind: row.instance_kind,
      seatUnit: row.seat_unit,
      opensOutlets: opensOutlets(String(row.code)),
      hostPolicy: row.host_policy,
      connectionState: row.connection_state,
      createdAt: sqlToIso(String(row.created_at)),
      updatedAt: sqlToIso(String(row.updated_at)),
    };
  }

  private planJson(row: SqlRow): Record<string, unknown> {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      billingPeriod: row.billing_period,
      seatLimit: row.seat_limit === null || row.seat_limit === undefined ? null : Number(row.seat_limit),
      entitlementsMode: row.entitlements_mode,
      priceNote: row.price_note,
      priceAmount: Number(row.price_amount || 0),
      priceBasis: String(row.price_basis || 'seat'),
      status: row.status,
      createdAt: sqlToIso(String(row.created_at)),
      updatedAt: sqlToIso(String(row.updated_at)),
    };
  }

  private releaseJson(row: SqlRow): Record<string, unknown> {
    return {
      id: row.id,
      version: row.version,
      channel: row.channel,
      state: row.state,
      notes: row.notes,
      hasPackage: flag(row.has_package),
      publishedAt: sqlToIso(row.published_at ? String(row.published_at) : null),
      createdAt: sqlToIso(String(row.created_at)),
      updatedAt: sqlToIso(String(row.updated_at)),
    };
  }

  private customerJson(row: SqlRow): Record<string, unknown> {
    return {
      id: row.id,
      name: row.name,
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      phone: row.phone,
      notes: row.notes,
      status: row.status,
      labels: this.jsonIds(row.labels_json),
      alerts: this.jsonIds(row.alerts_json),
      blocked: flag(row.blocked),
      blockReason: String(row.block_reason || ''),
      behaviour: this.behaviourList(row.behaviour_json),
      createdAt: sqlToIso(String(row.created_at)),
      updatedAt: sqlToIso(String(row.updated_at)),
    };
  }

  private plainRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private jsonIds(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item));
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }

  private cleanIds(value: unknown, allowed: string[]): string[] {
    return [...new Set(this.jsonIds(value).filter((item) => allowed.includes(item)))];
  }

  private behaviourList(value: unknown): Array<{ id: string; kind: string; note: string; at: string; by: string }> {
    let rows: unknown[] = [];
    if (Array.isArray(value)) rows = value;
    else {
      try {
        const decoded = JSON.parse(String(value || '[]'));
        rows = Array.isArray(decoded) ? decoded : [];
      } catch {
        rows = [];
      }
    }
    return rows
      .map((item) => this.plainRecord(item))
      .filter((item): item is Record<string, unknown> => !!item && CUSTOMER_BEHAVIOUR.includes(String(item.kind || '')))
      .map((item) => ({
        id: String(item.id || ''),
        kind: String(item.kind),
        note: String(item.note || ''),
        at: String(item.at || ''),
        by: String(item.by || ''),
      }))
      .filter((item) => item.id && item.note);
  }

  private subscriptionBrief(row: SqlRow): Record<string, unknown> {
    const effective = effectiveStatus(
      String(row.status) as StoredStatus,
      String(row.starts_at),
      String(row.ends_at),
      Number(row.grace_days),
      Date.now(),
    );
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name || '',
      productCode: row.product_code,
      productName: row.product_name,
      planCode: row.plan_code,
      planName: row.plan_name,
      status: row.status,
      effectiveStatus: effective,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      seatLimit: row.seat_limit === null || row.seat_limit === undefined ? null : Number(row.seat_limit),
      seatsPurchased: Number(row.seats_purchased || 1),
      periods: Number(row.periods || 1),
      listAmount: Number(row.list_amount || 0),
      discountAmount: Number(row.discount_amount || 0),
      purchaseAmount: Number(row.purchase_amount || 0),
      offerCode: String(row.offer_code || ''),
      couponCode: String(row.coupon_code || ''),
      graceDays: Number(row.grace_days || 0),
      channel: String(row.channel || 'stable'),
      hostPolicy: String(row.host_policy || 'inherit'),
      maxInstances: Number(row.max_instances || 1),
      outletOf: row.outlet_of ? String(row.outlet_of) : null,
      createdAt: sqlToIso(String(row.created_at)),
      updatedAt: sqlToIso(String(row.updated_at)),
    };
  }

  private subscriptionFull(row: SqlRow): Record<string, unknown> {
    return {
      ...this.subscriptionBrief(row),
      graceDays: Number(row.grace_days),
      enforceSeatLimit: flag(row.enforce_seat_limit),
      planSeatLimit: row.plan_seat_limit === null || row.plan_seat_limit === undefined ? null : Number(row.plan_seat_limit),
      seatUnit: row.product_seat_unit,
      billingPeriod: row.billing_period || '',
      unitPrice: Number(row.price_amount || 0),
      priceBasis: String(row.price_basis || 'seat'),
      hostPolicy: row.host_policy,
      bindings: asArray(row.bindings),
      maxInstances: Number(row.max_instances),
      versionPin: row.version_pin || '',
      minVersion: row.min_version || '',
      blockOutdated: flag(row.block_outdated),
      channel: row.channel,
      notes: row.notes || '',
      lastReject: row.last_reject || '',
      lastRejectAt: sqlToIso(row.last_reject_at ? String(row.last_reject_at) : null),
      instanceKind: row.instance_kind,
    };
  }

  private async seedAccess(now: string): Promise<void> {
    for (const preset of ROLE_PRESETS) {
      let role = await this.db.one('SELECT id FROM roles WHERE slug = ?', [preset.slug]);
      if (!role) {
        const roleId = id();
        await this.db.query(
          `INSERT INTO roles (id, slug, name, description, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
          [roleId, preset.slug, preset.name, preset.description, now, now],
        );
        role = { id: roleId } as SqlRow;
      }
      const count = await this.db.one('SELECT COUNT(*) AS n FROM role_permissions WHERE role_id = ?', [role.id]);
      const fill = preset.slug === 'super_admin' || Number(count?.n ?? 0) === 0;
      if (!fill) continue;
      if (preset.slug === 'super_admin') await this.db.query('DELETE FROM role_permissions WHERE role_id = ?', [role.id]);
      for (const permission of preset.permissions) {
        await this.db.query('INSERT IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)', [role.id, permission]);
      }
    }
    const inherited = [
      'offers.view',
      'offers.create',
      'offers.update',
      'offers.delete',
      'coupons.view',
      'coupons.create',
      'coupons.update',
      'coupons.delete',
    ];
    const holders = await this.db.query(`SELECT DISTINCT role_id FROM role_permissions WHERE permission = 'offers.manage'`);
    for (const holder of holders) {
      for (const permission of inherited) {
        await this.db.query('INSERT IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)', [holder.role_id, permission]);
      }
    }
    await this.db.query(`DELETE FROM role_permissions WHERE permission = 'offers.manage'`);
    for (const preset of ROLE_PRESETS) {
      if (preset.slug === 'super_admin') continue;
      const role = await this.db.one('SELECT id FROM roles WHERE slug = ?', [preset.slug]);
      if (!role) continue;
      for (const permission of preset.permissions) {
        await this.db.query('INSERT IGNORE INTO role_permissions (role_id, permission) VALUES (?, ?)', [role.id, permission]);
      }
    }
    await this.db.query(`UPDATE staff_users SET role = 'super_admin' WHERE role = 'owner'`);
    await this.db.query(`UPDATE staff_users s JOIN roles r ON r.slug = s.role SET s.role_id = r.id WHERE s.role_id IS NULL`);
  }

  private async present(row: SqlRow): Promise<Staff> {
    const stored = String(row.role) === 'owner' ? 'super_admin' : String(row.role);
    const role = row.role_id
      ? await this.db.one('SELECT * FROM roles WHERE id = ?', [row.role_id])
      : await this.db.one('SELECT * FROM roles WHERE slug = ?', [stored]);
    const roleSlug = String(role?.slug || stored);
    let permissions: string[] = [];
    if (roleSlug === 'super_admin') permissions = [...ALL_SLUGS];
    else if (role) {
      const rows = await this.db.query('SELECT permission FROM role_permissions WHERE role_id = ?', [role.id]);
      permissions = rows.map((item) => String(item.permission));
    }
    const shown = this.shownPresence(row);
    return {
      id: String(row.id),
      email: String(row.email),
      name: String(row.name),
      phone: String(row.phone || ''),
      role: roleSlug,
      roleName: String(role?.name || 'Staff'),
      status: String(row.status),
      presence: shown.presence,
      presenceLabel: String(row.presence_label || ''),
      presenceSource: shown.source,
      hasAvatar: String(row.avatar || '').length > 0,
      lastSeenAt: sqlToIso(row.last_seen_at ? String(row.last_seen_at) : null),
      createdAt: sqlToIso(row.created_at ? String(row.created_at) : null),
      updatedAt: sqlToIso(row.updated_at ? String(row.updated_at) : null),
      permissions,
      locationDue: this.settings ? await this.settings.locationDue(row) : false,
    };
  }

  private roleCard(role: SqlRow, granted: number, users: number): Record<string, unknown> {
    const slug = String(role.slug);
    return {
      id: role.id,
      slug,
      name: role.name,
      description: role.description || '',
      system: Number(role.is_system) === 1,
      locked: slug === 'super_admin',
      protected: slug === 'super_admin' || slug === 'admin',
      granted: slug === 'super_admin' ? ALL_SLUGS.length : granted,
      total: ALL_SLUGS.length,
      users,
    };
  }

  private async roleBySlug(slug: string): Promise<SqlRow> {
    const role = await this.db.one('SELECT * FROM roles WHERE slug = ?', [slug]);
    if (!role) throw new ControlError(400, 'invalid_request', 'Choose a role from the list.');
    return role;
  }

  private emailOrEmpty(value: unknown): string {
    const email = clampText(value, 190);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ControlError(400, 'invalid_request', 'Enter a valid email, or leave it blank.');
    }
    return email;
  }

  private phoneOrEmpty(value: unknown): string {
    const phone = clampText(value, 40);
    if (phone && !/^\+?[0-9][0-9\s\-().]{5,22}$/.test(phone)) {
      throw new ControlError(400, 'invalid_request', 'Enter a phone number, or leave it blank.');
    }
    return phone;
  }

  private assertPerson(name: string, email: string, phone: string): void {
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ControlError(400, 'invalid_request', 'Enter a valid email.');
    if (phone && !/^\+?[0-9][0-9\s\-().]{5,22}$/.test(phone)) {
      throw new ControlError(400, 'invalid_request', 'Enter a phone number, or leave it blank.');
    }
  }

  async sendProfileOtp(actor: Staff): Promise<{ sentTo: string }> {
    if (actor.role !== 'super_admin') {
      throw new ControlError(403, 'forbidden', 'Only a Super Admin can request this code.');
    }
    if (!this.otpLimit.allow('profile:' + actor.id, 1, 60 * 1000)) {
      throw new ControlError(400, 'invalid_request', 'A code was just sent. Wait a minute, then send another.');
    }
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const now = nowSql();
    await this.db.query(
      `UPDATE staff_otps SET used_at = ? WHERE staff_id = ? AND purpose = 'profile' AND used_at IS NULL`,
      [now, actor.id],
    );
    const otpId = id();
    await this.db.query(
      `INSERT INTO staff_otps (id, staff_id, purpose, code_hash, expires_at, created_at) VALUES (?, ?, 'profile', ?, ?, ?)`,
      [otpId, actor.id, this.otpHash(code), nowSql(new Date(Date.now() + 10 * 60 * 1000)), now],
    );
    try {
      const mailbox = this.settings ? await this.settings.mailbox('staff') : null;
      await sendMail(
        actor.email,
        'Altamid Control confirmation code',
        'Your Altamid Control confirmation code is ' +
          code +
          '.\n\nIt expires in 10 minutes. If you did not ask for this, you can ignore the email.',
        mailbox || undefined,
      );
    } catch (error) {
      await this.db.query('UPDATE staff_otps SET used_at = ? WHERE id = ?', [nowSql(), otpId]);
      throw error;
    }
    return { sentTo: this.maskEmail(actor.email) };
  }

  private async assertProfileGate(actor: Staff, body: Record<string, unknown>): Promise<void> {
    const otp = String(body.otp || '').replace(/\s/g, '');
    if (otp) {
      await this.consumeOtp(actor.id, otp, 'profile');
      return;
    }
    if (!String(body.currentPassword || '')) {
      throw new ControlError(400, 'invalid_request', 'Enter your password, or the code sent to the Super Admin email.');
    }
    await this.assertOwnPassword(actor.id, body.currentPassword);
  }

  private otpHash(code: string, purpose = 'profile'): string {
    return sha256((process.env.JWT_SECRET || 'altamid-control') + ':' + purpose + ':' + code);
  }

  private async consumeOtp(staffId: string, code: string, purpose: string): Promise<void> {
    if (!/^\d{6}$/.test(code)) {
      throw new ControlError(400, 'invalid_request', 'Enter the 6-digit code from the email.');
    }
    const row = await this.db.one(
      `SELECT id, code_hash, expires_at, used_at FROM staff_otps WHERE staff_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1`,
      [staffId, purpose],
    );
    const expired = !row?.expires_at || Date.parse(sqlToIso(String(row.expires_at)) || '') < Date.now();
    const expected = this.otpHash(code, purpose);
    const actual = String(row?.code_hash || '');
    const same =
      expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    if (!row || row.used_at || expired || !same) {
      throw new ControlError(400, 'invalid_request', expired && row && !row.used_at
        ? 'That code has expired. Send a new one.'
        : 'That code is not valid.');
    }
    await this.db.query('UPDATE staff_otps SET used_at = ? WHERE id = ?', [nowSql(), row.id]);
  }

  private maskEmail(email: string): string {
    const [name, domain] = email.split('@');
    if (!domain) return email;
    const visible = name.slice(0, 1);
    return visible + '***@' + domain;
  }

  private async assertOwnPassword(staffId: string, password: unknown): Promise<void> {
    const row = await this.db.one('SELECT password_hash FROM staff_users WHERE id = ?', [staffId]);
    const valid = row ? await compare(String(password || ''), String(row.password_hash)) : false;
    if (!valid) throw new ControlError(400, 'invalid_request', 'Current password is not valid.');
  }

  private async assertSuperEdit(actor: Staff, target: Staff, body: Record<string, unknown>): Promise<void> {
    const confirm = clampText(body.confirmEmail, 190).toLowerCase();
    await this.assertOwnPassword(actor.id, body.currentPassword);
    if (confirm !== target.email.toLowerCase()) {
      throw new ControlError(400, 'invalid_request', 'To change a Super Admin, enter your current password and type that Super Admin email exactly.');
    }
  }

  private shownPresence(row: SqlRow): { presence: string; source: string } {
    const presence = String(row.presence || 'online');
    const source = String(row.presence_source || 'auto') === 'manual' ? 'manual' : 'auto';
    const seen = sqlToIso(row.last_seen_at ? String(row.last_seen_at) : null);
    const fresh = !!seen && Date.now() - Date.parse(seen) < 5 * 60 * 1000;
    if (!fresh && (presence === 'online' || source === 'auto')) return { presence: 'away', source: 'auto' };
    return { presence, source };
  }

  private avatarDir(): string {
    const dir = join(process.cwd(), 'storage', 'avatars');
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private removeAvatarFiles(staffId: string): void {
    if (!/^[0-9a-f-]{36}$/i.test(staffId)) return;
    for (const ext of ['jpg', 'png', 'webp', 'gif']) {
      const path = join(this.avatarDir(), staffId + '.' + ext);
      if (existsSync(path)) unlinkSync(path);
    }
  }

  private writeAvatar(staffId: string, ext: string, bytes: Buffer): void {
    this.removeAvatarFiles(staffId);
    writeFileSync(join(this.avatarDir(), staffId + '.' + ext), bytes);
  }

  private decodeImage(body: Record<string, unknown>): { ext: string; bytes: Buffer } {
    const type = String(body.contentType || '');
    const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
    const ext = map[type];
    if (!ext) throw new ControlError(400, 'invalid_request', 'Use a JPG, PNG, WEBP, or GIF photo.');
    const bytes = Buffer.from(String(body.data || '').replace(/^data:[^,]+,/, ''), 'base64');
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) {
      throw new ControlError(400, 'invalid_request', 'Photo must be under 2 MB.');
    }
    const head = bytes.subarray(0, 12);
    const jpeg = head[0] === 0xff && head[1] === 0xd8;
    const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const gif = head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46;
    const webp = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP';
    const ok = (ext === 'jpg' && jpeg) || (ext === 'png' && png) || (ext === 'gif' && gif) || (ext === 'webp' && webp);
    if (!ok) throw new ControlError(400, 'invalid_request', 'That file is not a valid photo.');
    return { ext, bytes };
  }

  private assertSuperChange(actor: Staff, from: string, to: string): void {
    if ((from === 'super_admin' || to === 'super_admin') && actor.role !== 'super_admin') {
      throw new ControlError(403, 'forbidden', 'Only a Super Admin can assign the Super Admin role.');
    }
  }

  private async assertSuperRemains(exceptId: string): Promise<void> {
    const others = await this.db.one(
      `SELECT COUNT(*) AS n FROM staff_users WHERE role = 'super_admin' AND status = 'active' AND id <> ?`,
      [exceptId],
    );
    if (Number(others?.n ?? 0) === 0) {
      throw new ControlError(400, 'invalid_request', 'Control needs at least one active Super Admin.');
    }
  }

  private roleSlug(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  private async priceSubscription(
    plan: SqlRow,
    productId: string,
    startsAt: string,
    endsAt: string,
    seatsRaw: unknown,
    offerCode: string,
  ): Promise<{ seats: number; periods: number; list: number; discount: number; purchase: number; offerId: string | null; offerCode: string }> {
    const basis = String(plan.price_basis) === 'flat' ? 'flat' : 'seat';
    const unit = Number(plan.price_amount) || 0;
    const seats = basis === 'flat' ? 1 : this.purchasedSeats(seatsRaw);
    const periods = periodsBetween(startsAt, endsAt, String(plan.billing_period));
    const offer = offerCode.trim() ? await this.releasedOffer(offerCode.trim().toLowerCase(), productId) : null;
    const list = money(unit * (basis === 'seat' ? seats : 1) * periods);
    let discount = 0;
    if (offer) {
      discount = offer.kind === 'percent' ? money((list * offer.value) / 100) : money(offer.value);
      if (discount > list) discount = list;
    }
    return {
      seats,
      periods,
      list,
      discount,
      purchase: money(list - discount),
      offerId: offer ? offer.id : null,
      offerCode: offer ? offer.code : '',
    };
  }

  private purchasedSeats(value: unknown): number {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 100000) {
      throw new ControlError(400, 'invalid_request', 'Seats purchased must be a whole number from 1 to 100000.');
    }
    return number;
  }

  private assertDiscount(kind: string, value: number): void {
    if (kind !== 'percent' && kind !== 'amount') throw new ControlError(400, 'invalid_request', 'Discount is a percent or a rupee amount.');
    if (kind === 'percent' && (value <= 0 || value > 100)) throw new ControlError(400, 'invalid_request', 'Percent must be from 0.01 to 100.');
    if (kind === 'amount' && (value <= 0 || value > 10000000)) throw new ControlError(400, 'invalid_request', 'Discount amount must be greater than zero.');
  }

  private async assertCodeFree(code: string, table: 'offers' | 'coupons'): Promise<void> {
    const offer = await this.db.one('SELECT id FROM offers WHERE code = ?', [code]);
    const coupon = await this.db.one('SELECT id FROM coupons WHERE code = ?', [code]);
    if ((table === 'offers' && offer) || (table === 'coupons' && coupon) || (table === 'offers' && coupon) || (table === 'coupons' && offer)) {
      throw new ControlError(400, 'invalid_request', 'That code is already used by an offer or a coupon.');
    }
  }

  private async offerRow(offerId: string): Promise<SqlRow> {
    const row = await this.db.one('SELECT * FROM offers WHERE id = ?', [offerId]);
    if (!row) throw new ControlError(404, 'not_found', 'That offer was not found.');
    return row;
  }

  private async offerJoined(offerId: string): Promise<SqlRow> {
    const row = await this.db.one(
      `SELECT o.*, p.code AS product_code, p.name AS product_name FROM offers o LEFT JOIN products p ON p.id = o.product_id WHERE o.id = ?`,
      [offerId],
    );
    if (!row) throw new ControlError(404, 'not_found', 'That offer was not found.');
    return row;
  }

  private async couponRow(couponId: string): Promise<SqlRow> {
    const row = await this.db.one('SELECT * FROM coupons WHERE id = ?', [couponId]);
    if (!row) throw new ControlError(404, 'not_found', 'That coupon was not found.');
    return row;
  }

  private async couponJoined(couponId: string): Promise<SqlRow> {
    const row = await this.db.one(
      `SELECT c.*, p.code AS product_code, p.name AS product_name FROM coupons c LEFT JOIN products p ON p.id = c.product_id WHERE c.id = ?`,
      [couponId],
    );
    if (!row) throw new ControlError(404, 'not_found', 'That coupon was not found.');
    return row;
  }

  private async pickedCoupon(code: string, productId: string): Promise<{ id: string | null; code: string }> {
    const trimmed = code.trim().toLowerCase();
    if (!trimmed) return { id: null, code: '' };
    const row = await this.db.one('SELECT * FROM coupons WHERE code = ?', [trimmed]);
    if (!row || String(row.status) !== 'released') throw new ControlError(400, 'invalid_request', 'That coupon is not released.');
    const today = todayUtc();
    if (String(row.starts_at).slice(0, 10) > today || String(row.ends_at).slice(0, 10) < today) {
      throw new ControlError(400, 'invalid_request', 'That coupon is outside its dates.');
    }
    if (String(row.scope) === 'product' && String(row.product_id) !== productId) {
      throw new ControlError(400, 'invalid_request', 'That coupon does not cover this product.');
    }
    return { id: String(row.id), code: String(row.code) };
  }

  private couponJson(row: SqlRow): Record<string, unknown> {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      scope: row.scope,
      productCode: row.product_code || '',
      productName: row.product_name || '',
      kind: row.kind,
      value: Number(row.value),
      startsAt: String(row.starts_at).slice(0, 10),
      endsAt: String(row.ends_at).slice(0, 10),
      status: row.status,
      note: row.note || '',
    };
  }

  private async releasedOffer(code: string, productId: string): Promise<{ id: string; code: string; kind: string; value: number }> {
    const row = await this.db.one('SELECT * FROM offers WHERE code = ?', [code]);
    if (!row || String(row.status) !== 'released') throw new ControlError(400, 'invalid_request', 'That offer is not released.');
    const today = todayUtc();
    if (String(row.starts_at).slice(0, 10) > today || String(row.ends_at).slice(0, 10) < today) {
      throw new ControlError(400, 'invalid_request', 'That offer is outside its dates.');
    }
    if (String(row.scope) === 'product' && String(row.product_id) !== productId) {
      throw new ControlError(400, 'invalid_request', 'That offer does not cover this product.');
    }
    return { id: String(row.id), code: String(row.code), kind: String(row.kind), value: Number(row.value) };
  }

  private offerJson(row: SqlRow): Record<string, unknown> {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      scope: row.scope,
      productCode: row.product_code || '',
      productName: row.product_name || '',
      kind: row.kind,
      value: Number(row.value),
      startsAt: String(row.starts_at).slice(0, 10),
      endsAt: String(row.ends_at).slice(0, 10),
      status: row.status,
      note: row.note || '',
    };
  }

  private assertPlan(codeRaw: unknown, billingRaw: unknown, basisRaw: unknown, amountRaw: unknown): void {
    const code = String(codeRaw || 'standard').trim().toLowerCase();
    const billing = String(billingRaw || 'monthly');
    const basis = String(basisRaw || 'seat');
    const amount = money(Number(amountRaw || 0));
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(code)) throw new ControlError(400, 'invalid_request', 'Plan code must be a short slug such as standard.');
    if (!['trial', 'monthly', 'yearly', 'custom'].includes(billing)) {
      throw new ControlError(400, 'invalid_request', 'Billing must be trial, monthly, yearly, or custom.');
    }
    if (basis !== 'seat' && basis !== 'flat') throw new ControlError(400, 'invalid_request', 'Price is either per seat or a flat amount.');
    if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) {
      throw new ControlError(400, 'invalid_request', 'Price must be zero or a rupee amount.');
    }
  }

  private async insertPlan(productId: string, body: Record<string, unknown>, sort: number): Promise<void> {
    this.assertPlan(body.code, body.billingPeriod, body.priceBasis, body.priceAmount);
    const code = String(body.code || 'standard').trim().toLowerCase();
    const name = clampText(body.name, 120) || 'Standard';
    const billing = String(body.billingPeriod || 'monthly');
    const basis = String(body.priceBasis || 'seat');
    const amount = money(Number(body.priceAmount || 0));
    const taken = await this.db.one('SELECT id FROM plans WHERE product_id = ? AND code = ?', [productId, code]);
    if (taken) throw new ControlError(400, 'invalid_request', 'That plan code is already on this product.');
    const now = nowSql();
    await this.db.query(
      `INSERT INTO plans
        (id, product_id, code, name, billing_period, seat_limit, entitlements_mode, features, limits_json, price_note, price_amount, price_basis, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, 'all', '[]', '{}', ?, ?, ?, 'active', ?, ?, ?)`,
      [id(), productId, code, name, billing, clampText(body.priceNote, 160), amount, basis, sort, now, now],
    );
  }

  private seat(value: unknown): number {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0 || number > 100000) {
      throw new ControlError(400, 'invalid_request', 'Seat limit must be empty for unlimited, or a whole number from 0 to 100000.');
    }
    return number;
  }

  private bindingList(value: unknown, kind: 'host' | 'device' | 'tenant'): string[] {
    const source = Array.isArray(value)
      ? value.map((item) => String(item))
      : String(value || '')
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean);
    return source.map((item) => normalizeBinding(kind, item)).filter(Boolean).slice(0, 20);
  }

  private optionalVersion(incoming: unknown, current: unknown): string | null {
    if (incoming === undefined) return current ? String(current) : null;
    const value = String(incoming || '').trim();
    if (!value) return null;
    if (value.length > 32) throw new ControlError(400, 'invalid_request', 'Version pin is too long.');
    return value;
  }

  private loadJwtSecret(): string {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    const file = join(process.cwd(), 'storage', 'jwt.secret');
    mkdirSync(join(process.cwd(), 'storage'), { recursive: true });
    try {
      const existing = require('fs').readFileSync(file, 'utf8').trim();
      if (existing) return existing;
    } catch {
      /* create below */
    }
    const secret = randomBytes(32).toString('base64url');
    writeFileSync(file, secret, { encoding: 'utf8' });
    return secret;
  }

  private dayRange(from: string, to: string): { start: string | null; end: string | null; labelFrom: string; labelTo: string } {
    const startDay = from.trim();
    const endDay = to.trim();
    if (startDay && !isDay(startDay)) throw new ControlError(400, 'invalid_request', 'From must be a date.');
    if (endDay && !isDay(endDay)) throw new ControlError(400, 'invalid_request', 'To must be a date.');
    if (startDay && endDay && startDay > endDay) throw new ControlError(400, 'invalid_request', 'From must be on or before To.');
    return {
      start: startDay ? startDay + ' 00:00:00.000' : null,
      end: endDay ? endDay + ' 23:59:59.999' : null,
      labelFrom: startDay,
      labelTo: endDay,
    };
  }

  private async reportRows(type: string, range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    if (type === 'subscriptions') return this.subscriptionReport(range);
    if (type === 'customers') return this.customerReport(range);
    if (type === 'licenses') return this.licenseReport(range);
    if (type === 'installs') return this.installReport(range);
    if (type === 'catalog') return this.catalogReport();
    if (type === 'revenue') return this.revenueReport(range);
    return this.activityReport(range);
  }

  private async subscriptionReport(range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT c.name AS customer, p.name AS product, pl.name AS plan, s.status, s.starts_at, s.ends_at, s.grace_days, s.seat_limit, s.created_at
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN products p ON p.id = s.product_id
       JOIN plans pl ON pl.id = s.plan_id
       WHERE (? IS NULL OR s.starts_at <= ?) AND (? IS NULL OR s.ends_at >= ?)
       ORDER BY c.name, p.name`,
      [range.end, range.end ? range.end.slice(0, 10) : null, range.start, range.start ? range.start.slice(0, 10) : null],
    );
    const now = Date.now();
    return rows.map((row) => ({
      customer: String(row.customer),
      product: String(row.product),
      plan: String(row.plan),
      status: effectiveStatus(String(row.status) as StoredStatus, String(row.starts_at).slice(0, 10), String(row.ends_at).slice(0, 10), Number(row.grace_days), now),
      starts: showDay(row.starts_at),
      ends: showDay(row.ends_at),
      seats: row.seat_limit == null || row.seat_limit === '' ? 'Plan default' : String(row.seat_limit),
      opened: showDay(row.created_at),
    }));
  }

  private async customerReport(range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT c.name, c.contact_name, c.contact_email, c.phone, c.status, c.created_at,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.customer_id = c.id AND s.status <> 'cancelled') AS subscriptions
       FROM customers c
       WHERE (? IS NULL OR c.created_at >= ?) AND (? IS NULL OR c.created_at <= ?)
       ORDER BY c.name`,
      [range.start, range.start, range.end, range.end],
    );
    return rows.map((row) => ({
      customer: String(row.name),
      contact: String(row.contact_name || ''),
      email: String(row.contact_email || ''),
      phone: String(row.phone || ''),
      status: String(row.status),
      subscriptions: String(row.subscriptions),
      since: showDay(row.created_at),
    }));
  }

  private async licenseReport(range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT p.name AS product, c.name AS customer, k.label, k.key_hint, k.status, k.created_at, k.revoked_at
       FROM license_keys k
       JOIN subscriptions s ON s.id = k.subscription_id
       JOIN products p ON p.id = s.product_id
       JOIN customers c ON c.id = s.customer_id
       WHERE (? IS NULL OR k.created_at >= ?) AND (? IS NULL OR k.created_at <= ?)
       ORDER BY k.created_at DESC`,
      [range.start, range.start, range.end, range.end],
    );
    return rows.map((row) => ({
      product: String(row.product),
      customer: String(row.customer),
      label: String(row.label || ''),
      hint: String(row.key_hint || ''),
      status: String(row.status),
      issued: showWhen(row.created_at),
      revoked: showWhen(row.revoked_at),
    }));
  }

  private async installReport(range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT p.name AS product, c.name AS customer, i.instance_id, i.runtime, i.version, i.last_verdict, i.last_seen_at
       FROM instances i
       JOIN subscriptions s ON s.id = i.subscription_id
       JOIN products p ON p.id = s.product_id
       JOIN customers c ON c.id = s.customer_id
       WHERE (? IS NULL OR i.last_seen_at >= ?) AND (? IS NULL OR i.last_seen_at <= ?)
       ORDER BY i.last_seen_at DESC`,
      [range.start, range.start, range.end, range.end],
    );
    return rows.map((row) => ({
      product: String(row.product),
      customer: String(row.customer),
      instance: String(row.instance_id),
      runtime: String(row.runtime || ''),
      version: String(row.version || ''),
      verdict: String(row.last_verdict || ''),
      seen: showWhen(row.last_seen_at),
    }));
  }

  private async catalogReport(): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT p.name, p.code, p.key_tag, p.seat_unit, p.connection_state, p.status,
              (SELECT COUNT(*) FROM plans pl WHERE pl.product_id = p.id) AS plans,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.product_id = p.id AND s.status <> 'cancelled') AS subscribers
       FROM products p
       ORDER BY p.name`,
    );
    return rows.map((row) => ({
      product: String(row.name),
      code: String(row.code),
      tag: String(row.key_tag),
      seat: String(row.seat_unit),
      connection: String(row.connection_state),
      status: String(row.status),
      plans: String(row.plans),
      subscribers: String(row.subscribers),
    }));
  }

  private async revenueReport(range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT c.name AS customer, p.name AS product, pl.name AS plan, s.seats_purchased, s.periods,
              s.list_amount, s.offer_code, s.discount_amount, s.purchase_amount, s.status, s.created_at
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN products p ON p.id = s.product_id
       JOIN plans pl ON pl.id = s.plan_id
       WHERE s.status <> 'cancelled'
         AND (? IS NULL OR s.created_at >= ?) AND (? IS NULL OR s.created_at <= ?)
       ORDER BY s.created_at DESC`,
      [range.start, range.start, range.end, range.end],
    );
    return rows.map((row) => ({
      customer: String(row.customer),
      product: String(row.product),
      plan: String(row.plan),
      seats: String(row.seats_purchased),
      periods: String(row.periods),
      list: inr(row.list_amount),
      offer: String(row.offer_code || ''),
      discount: inr(row.discount_amount),
      purchase: inr(row.purchase_amount),
      status: String(row.status),
    }));
  }

  private async activityReport(range: { start: string | null; end: string | null }): Promise<Array<Record<string, string>>> {
    const rows = await this.db.query(
      `SELECT a.created_at, a.action, a.entity_type, u.email AS actor_email, a.ip
       FROM audit_log a
       LEFT JOIN staff_users u ON u.id = a.actor_id
       WHERE (? IS NULL OR a.created_at >= ?) AND (? IS NULL OR a.created_at <= ?)
       ORDER BY a.created_at DESC
       LIMIT 500`,
      [range.start, range.start, range.end, range.end],
    );
    return rows.map((row) => ({
      when: showWhen(row.created_at),
      who: String(row.actor_email || ''),
      action: String(row.action),
      record: String(row.entity_type || ''),
      ip: String(row.ip || ''),
    }));
  }

  private async audit(actorId: string | null, action: string, entityType: string, entityId: string | null, detail: Record<string, unknown>, ip: string): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), actorId, action, entityType, entityId, JSON.stringify(detail), (ip || '').slice(0, 64), nowSql()],
    );
  }
}

const USABLE = ['trialing', 'active', 'grace', 'past_due'];

function nullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

function primitivePayload(value: unknown): Record<string, string | number | boolean | null> | null {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') out[key] = item;
    else if (typeof item === 'number' && Number.isSafeInteger(item)) out[key] = item;
    else return null;
  }
  return out;
}
