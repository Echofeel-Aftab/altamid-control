import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService, SqlRow } from './database.service';
import { ControlError } from './errors';
import { Mailbox, sendMail } from './mail';
import { clampText, flag, id, nowSql, sqlToIso } from './util';

export interface GeoFix {
  lat: number;
  lng: number;
  accuracy: number;
}

const PURPOSES = ['staff', 'customer', 'general'] as const;

@Injectable()
export class SettingsService {
  private weatherCache: { key: string; expires: number; weather: { temp: number; icon: string; label: string; place: string } } | null = null;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async snapshot(currentIp: string): Promise<Record<string, unknown>> {
    const rules = await this.db.query('SELECT * FROM ip_rules ORDER BY kind, created_at');
    const places = await this.db.query('SELECT * FROM login_places ORDER BY name');
    const accounts = await this.db.query('SELECT * FROM smtp_accounts ORDER BY is_default DESC, label');
    const roles = await this.db.query(`SELECT id, name, slug FROM roles WHERE slug <> 'super_admin' ORDER BY name`);
    const people = await this.db.query(
      `SELECT id, name, email, role, role_id FROM staff_users WHERE role <> 'super_admin' AND status = 'active' ORDER BY name`,
    );
    const overrides = await this.db.query(
      `SELECT o.*, s.name AS staff_name FROM login_overrides o
       LEFT JOIN staff_users s ON s.id = o.staff_id
       WHERE o.expires_at > ? ORDER BY o.expires_at`,
      [nowSql()],
    );
    const events = await this.db.query('SELECT * FROM login_events ORDER BY created_at DESC LIMIT 20');
    return {
      general: {
        companyName: await this.setting('company_name', 'Altamid Solutions'),
        supportEmail: await this.setting('support_email', ''),
        website: await this.setting('website', 'https://altamidsolutions.com'),
        city: await this.setting('company_city', ''),
        country: await this.setting('company_country', ''),
      },
      ipMode: (await this.setting('ip_mode', 'off')) === 'allow' ? 'allow' : 'off',
      currentIp,
      rules: rules.map((row) => ({
        id: row.id,
        kind: row.kind,
        value: row.cidr,
        label: row.label || '',
      })),
      locationEnabled: (await this.setting('location_required', '0')) === '1',
      recheckMinutes: this.recheckMinutes(await this.setting('location_recheck', '20')),
      places: places.map((row) => this.placeJson(row)),
      roles: roles.map((row) => ({ id: row.id, name: row.name, slug: row.slug })),
      staff: people.map((row) => ({ id: row.id, name: row.name, email: row.email, roleId: row.role_id || '' })),
      overrides: overrides.map((row) => ({
        id: row.id,
        staffId: row.staff_id,
        staffName: row.staff_name || 'Teammate',
        reason: row.reason || '',
        expiresAt: sqlToIso(String(row.expires_at)),
      })),
      events: events.map((row) => ({
        id: row.id,
        email: row.email || '',
        result: row.result,
        place: row.place_name || '',
        distance: row.distance_m === null || row.distance_m === undefined ? null : Number(row.distance_m),
        ip: row.ip || '',
        at: sqlToIso(String(row.created_at)),
      })),
      accounts: accounts.map((row) => ({
        id: row.id,
        label: row.label,
        host: row.host,
        port: Number(row.port),
        encryption: row.encryption,
        username: row.username,
        fromName: row.from_name || '',
        fromEmail: row.from_email || '',
        active: flag(row.is_active),
        isDefault: flag(row.is_default),
        hasPassword: String(row.password_enc || '').length > 0,
      })),
      purposes: {
        staff: await this.setting('smtp_purpose_staff', ''),
        customer: await this.setting('smtp_purpose_customer', ''),
        general: await this.setting('smtp_purpose_general', ''),
      },
    };
  }

  async saveGeneral(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const name = clampText(body.companyName, 120);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Company name is required.');
    const email = clampText(body.supportEmail, 190);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ControlError(400, 'invalid_request', 'Enter a valid support email, or leave it blank.');
    }
    const website = clampText(body.website, 190);
    if (website && !/^https?:\/\/\S+$/i.test(website)) {
      throw new ControlError(400, 'invalid_request', 'Website must start with http:// or https://.');
    }
    const city = clampText(body.city, 80);
    const country = clampText(body.country, 80);
    await this.putSetting('company_name', name);
    await this.putSetting('support_email', email);
    await this.putSetting('website', website);
    await this.putSetting('company_city', city);
    await this.putSetting('company_country', country);
    await this.audit(actorId, 'settings.general', { companyName: name, city }, ip);
  }

  async weather(): Promise<{ temp: number; icon: string; label: string; place: string } | null> {
    const city = (await this.setting('company_city', '')).trim() || 'Kolkata';
    const country = (await this.setting('company_country', '')).trim() || 'India';
    const key = city.toLowerCase() + '|' + country.toLowerCase();
    if (this.weatherCache && this.weatherCache.key === key && this.weatherCache.expires > Date.now()) {
      return this.weatherCache.weather;
    }
    try {
      const geo = await readJson(
        'https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(city + ', ' + country),
      );
      const hit = Array.isArray(geo?.results) ? (geo.results[0] as Record<string, unknown> | undefined) : undefined;
      const lat = Number(hit?.latitude);
      const lon = Number(hit?.longitude);
      if (!hit || !Number.isFinite(lat) || !Number.isFinite(lon)) return this.weatherCache?.weather ?? null;
      const forecast = await readJson(
        'https://api.open-meteo.com/v1/forecast?latitude=' +
          lat +
          '&longitude=' +
          lon +
          '&current=temperature_2m,weather_code&timezone=' +
          encodeURIComponent('Asia/Kolkata'),
      );
      const current = forecast?.current as Record<string, unknown> | undefined;
      if (!current) return this.weatherCache?.weather ?? null;
      const code = Number(current.weather_code) || 0;
      const weather = {
        temp: Math.round(Number(current.temperature_2m) || 0),
        icon: weatherIcon(code),
        label: weatherLabel(code),
        place: String(hit.name || city),
      };
      this.weatherCache = { key, expires: Date.now() + 20 * 60 * 1000, weather };
      return weather;
    } catch {
      return this.weatherCache?.weather ?? null;
    }
  }

  async saveIpMode(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const mode = body.mode === 'allow' ? 'allow' : 'off';
    if (mode === 'allow') {
      const count = await this.db.one(`SELECT COUNT(*) AS n FROM ip_rules WHERE kind = 'allow'`);
      if (Number(count?.n ?? 0) < 1) {
        throw new ControlError(400, 'invalid_request', 'Add at least one allowed network before turning the allow list on.');
      }
    }
    await this.putSetting('ip_mode', mode);
    await this.audit(actorId, 'settings.ip_mode', { mode }, ip);
  }

  async addIpRule(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const kind = body.kind === 'block' ? 'block' : body.kind === 'allow' ? 'allow' : '';
    if (!kind) throw new ControlError(400, 'invalid_request', 'Choose allow or block.');
    const value = clampText(body.value, 64);
    if (!validNetwork(value)) {
      throw new ControlError(400, 'invalid_request', 'Enter an IP address, or an IPv4 range such as 203.0.113.0/24.');
    }
    const label = clampText(body.label, 120);
    const ruleId = id();
    await this.db.query('INSERT INTO ip_rules (id, kind, cidr, label, created_at) VALUES (?, ?, ?, ?, ?)', [
      ruleId,
      kind,
      value,
      label,
      nowSql(),
    ]);
    await this.audit(actorId, 'settings.ip_rule', { kind, value }, ip);
  }

  async deleteIpRule(actorId: string, ruleId: string, ip: string): Promise<void> {
    const row = await this.db.one('SELECT * FROM ip_rules WHERE id = ?', [ruleId]);
    if (!row) throw new ControlError(404, 'not_found', 'That network rule was not found.');
    await this.db.query('DELETE FROM ip_rules WHERE id = ?', [ruleId]);
    if (String(row.kind) === 'allow') {
      const count = await this.db.one(`SELECT COUNT(*) AS n FROM ip_rules WHERE kind = 'allow'`);
      if (Number(count?.n ?? 0) < 1 && (await this.setting('ip_mode', 'off')) === 'allow') {
        await this.putSetting('ip_mode', 'off');
      }
    }
    await this.audit(actorId, 'settings.ip_rule_delete', { value: row.cidr }, ip);
  }

  async saveLocation(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const enabled = Boolean(body.enabled);
    const minutes = this.recheckMinutes(body.recheckMinutes);
    await this.putSetting('location_required', enabled ? '1' : '0');
    await this.putSetting('location_recheck', String(minutes));
    await this.audit(actorId, 'settings.location', { enabled, minutes }, ip);
  }

  async savePlace(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const name = clampText(body.name, 120);
    if (name.length < 2) throw new ControlError(400, 'invalid_request', 'Place name is required.');
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new ControlError(400, 'invalid_request', 'Enter a latitude and longitude, or use your location.');
    }
    const radius = Math.round(Number(body.radius));
    if (!Number.isFinite(radius) || radius < 25 || radius > 50000) {
      throw new ControlError(400, 'invalid_request', 'Radius must be between 25 and 50000 metres.');
    }
    const roleIds = await this.cleanRoles(body.roleIds);
    const staffIds = await this.cleanStaff(body.staffIds);
    const schedule = this.cleanSchedule(body);
    const now = nowSql();
    const placeId = clampText(body.id, 36);
    if (placeId) {
      const existing = await this.db.one('SELECT id FROM login_places WHERE id = ?', [placeId]);
      if (!existing) throw new ControlError(404, 'not_found', 'That place was not found.');
      await this.db.query(
        `UPDATE login_places SET name = ?, address = ?, lat = ?, lng = ?, radius_m = ?, active = ?, role_ids = ?, staff_ids = ?, schedule_json = ?, updated_at = ? WHERE id = ?`,
        [name, clampText(body.address, 240), lat, lng, radius, body.active === false ? 0 : 1, JSON.stringify(roleIds), JSON.stringify(staffIds), JSON.stringify(schedule), now, placeId],
      );
    } else {
      await this.db.query(
        `INSERT INTO login_places (id, name, address, lat, lng, radius_m, active, role_ids, staff_ids, schedule_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id(), name, clampText(body.address, 240), lat, lng, radius, body.active === false ? 0 : 1, JSON.stringify(roleIds), JSON.stringify(staffIds), JSON.stringify(schedule), now, now],
      );
    }
    await this.audit(actorId, 'settings.place', { name }, ip);
  }

  async deletePlace(actorId: string, placeId: string, ip: string): Promise<void> {
    const row = await this.db.one('SELECT name FROM login_places WHERE id = ?', [placeId]);
    if (!row) throw new ControlError(404, 'not_found', 'That place was not found.');
    await this.db.query('DELETE FROM login_places WHERE id = ?', [placeId]);
    await this.audit(actorId, 'settings.place_delete', { name: row.name }, ip);
  }

  async addOverride(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const staffId = clampText(body.staffId, 36);
    const staff = await this.db.one(`SELECT id, role FROM staff_users WHERE id = ? AND status = 'active'`, [staffId]);
    if (!staff || String(staff.role) === 'super_admin') {
      throw new ControlError(400, 'invalid_request', 'Choose a teammate. Super Admin is already exempt.');
    }
    const hours = Math.round(Number(body.hours));
    if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
      throw new ControlError(400, 'invalid_request', 'Override length must be between 1 and 168 hours.');
    }
    const reason = clampText(body.reason, 240);
    if (reason.length < 2) throw new ControlError(400, 'invalid_request', 'Write a short reason for the override.');
    await this.db.query(
      'INSERT INTO login_overrides (id, staff_id, expires_at, reason, created_at) VALUES (?, ?, ?, ?, ?)',
      [id(), staffId, nowSql(new Date(Date.now() + hours * 3600000)), reason, nowSql()],
    );
    await this.audit(actorId, 'settings.override', { staffId, hours }, ip);
  }

  async deleteOverride(actorId: string, overrideId: string, ip: string): Promise<void> {
    await this.db.query('DELETE FROM login_overrides WHERE id = ?', [overrideId]);
    await this.audit(actorId, 'settings.override_delete', { overrideId }, ip);
  }

  async saveSmtp(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const label = clampText(body.label, 120);
    if (label.length < 2) throw new ControlError(400, 'invalid_request', 'Give this email account a label.');
    const host = clampText(body.host, 190);
    const username = clampText(body.username, 190);
    if (host.length < 3 || username.length < 3) {
      throw new ControlError(400, 'invalid_request', 'Host and username are required.');
    }
    const port = Math.round(Number(body.port || 587));
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new ControlError(400, 'invalid_request', 'Port must be between 1 and 65535.');
    }
    const encryption = body.encryption === 'ssl' ? 'ssl' : 'tls';
    const fromEmail = clampText(body.fromEmail, 190);
    if (fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      throw new ControlError(400, 'invalid_request', 'From email must be a valid address, or blank.');
    }
    const accountId = clampText(body.id, 36);
    const existing = accountId ? await this.db.one('SELECT * FROM smtp_accounts WHERE id = ?', [accountId]) : null;
    if (accountId && !existing) throw new ControlError(404, 'not_found', 'That email account was not found.');
    const password = String(body.password || '');
    let sealed = existing ? String(existing.password_enc || '') : '';
    if (password) {
      if (password.length < 4) throw new ControlError(400, 'invalid_request', 'The app password is too short.');
      sealed = seal(password);
    } else if (!existing) {
      throw new ControlError(400, 'invalid_request', 'Enter the app password for this account.');
    }
    const now = nowSql();
    const active = body.active === false ? 0 : 1;
    const isDefault = Boolean(body.isDefault);
    const savedId = existing ? String(existing.id) : id();
    if (existing) {
      await this.db.query(
        `UPDATE smtp_accounts SET label = ?, host = ?, port = ?, encryption = ?, username = ?, password_enc = ?, from_name = ?, from_email = ?, is_active = ?, is_default = ?, updated_at = ? WHERE id = ?`,
        [label, host, port, encryption, username, sealed, clampText(body.fromName, 120), fromEmail, active, isDefault ? 1 : 0, now, savedId],
      );
    } else {
      await this.db.query(
        `INSERT INTO smtp_accounts (id, label, host, port, encryption, username, password_enc, from_name, from_email, is_active, is_default, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [savedId, label, host, port, encryption, username, sealed, clampText(body.fromName, 120), fromEmail, active, isDefault ? 1 : 0, now, now],
      );
    }
    if (isDefault) await this.db.query('UPDATE smtp_accounts SET is_default = 0 WHERE id <> ?', [savedId]);
    await this.audit(actorId, 'settings.smtp', { label, host }, ip);
  }

  async deleteSmtp(actorId: string, accountId: string, ip: string): Promise<void> {
    const row = await this.db.one('SELECT label FROM smtp_accounts WHERE id = ?', [accountId]);
    if (!row) throw new ControlError(404, 'not_found', 'That email account was not found.');
    await this.db.query('DELETE FROM smtp_accounts WHERE id = ?', [accountId]);
    for (const purpose of PURPOSES) {
      if ((await this.setting('smtp_purpose_' + purpose, '')) === accountId) await this.putSetting('smtp_purpose_' + purpose, '');
    }
    await this.audit(actorId, 'settings.smtp_delete', { label: row.label }, ip);
  }

  async testSmtp(accountId: string, to: string): Promise<void> {
    const email = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ControlError(400, 'invalid_request', 'Enter an email address for the test.');
    }
    const box = await this.mailboxById(accountId);
    if (!box) throw new ControlError(400, 'invalid_request', 'Save the account, including its app password, before sending a test.');
    await sendMail(email, 'Altamid Control email test', 'This is a test from Altamid Control. The SMTP account can send mail.', box);
  }

  async savePurposes(actorId: string, body: Record<string, unknown>, ip: string): Promise<void> {
    const accounts = await this.db.query('SELECT id FROM smtp_accounts');
    const known = new Set(accounts.map((row) => String(row.id)));
    for (const purpose of PURPOSES) {
      const chosen = clampText(body[purpose], 36);
      if (chosen && !known.has(chosen)) throw new ControlError(400, 'invalid_request', 'Choose an email account from the list.');
      await this.putSetting('smtp_purpose_' + purpose, chosen);
    }
    await this.audit(actorId, 'settings.smtp_purposes', {}, ip);
  }

  async mailbox(purpose: (typeof PURPOSES)[number]): Promise<Mailbox | null> {
    const mapped = await this.setting('smtp_purpose_' + purpose, '');
    if (mapped) {
      const box = await this.mailboxById(mapped);
      if (box) return box;
    }
    const fallback = await this.db.one('SELECT id FROM smtp_accounts WHERE is_active = 1 AND is_default = 1 ORDER BY updated_at DESC LIMIT 1');
    return fallback ? this.mailboxById(String(fallback.id)) : null;
  }

  async locationDue(row: SqlRow): Promise<boolean> {
    if (String(row.role) === 'super_admin') return false;
    if ((await this.setting('location_required', '0')) !== '1') return false;
    if (await this.hasOverride(String(row.id))) return false;
    const places = await this.placesFor(row);
    if (!places.length) return false;
    const last = row.last_location_at ? Date.parse(sqlToIso(String(row.last_location_at)) || '') : 0;
    if (!last || Number.isNaN(last)) return true;
    const minutes = this.recheckMinutes(await this.setting('location_recheck', '20'));
    return Date.now() - last > minutes * 60000;
  }

  async assertEntry(row: SqlRow, ip: string, where: GeoFix | undefined, mode: 'login' | 'recheck'): Promise<void> {
    if (String(row.role) === 'super_admin') return;
    const cleanIp = ip.replace('::ffff:', '');
    const rules = await this.db.query('SELECT kind, cidr FROM ip_rules');
    if (rules.some((rule) => String(rule.kind) === 'block' && networkMatches(cleanIp, String(rule.cidr)))) {
      await this.event(row, 'ip_blocked', '', null, cleanIp);
      throw new ControlError(403, 'ip_blocked', 'This network is blocked from Altamid Control.');
    }
    if ((await this.setting('ip_mode', 'off')) === 'allow') {
      const allowed = rules.some((rule) => String(rule.kind) === 'allow' && networkMatches(cleanIp, String(rule.cidr)));
      if (!allowed) {
        await this.event(row, 'ip_required', '', null, cleanIp);
        throw new ControlError(403, 'ip_required', 'Sign-in from this network is not on the allow list.');
      }
    }
    if ((await this.setting('location_required', '0')) !== '1') return;
    if (await this.hasOverride(String(row.id))) return;
    const places = await this.placesFor(row);
    if (!places.length) return;
    if (mode === 'recheck' && !(await this.locationDue(row))) return;
    if (!where) {
      await this.event(row, 'location_required', '', null, cleanIp);
      throw new ControlError(403, 'location_required', 'Share your location to sign in.');
    }
    const hit = this.nearest(where, places);
    if (!hit.inside) {
      await this.event(row, 'outside', hit.name, hit.distance, cleanIp);
      throw new ControlError(403, 'location_outside', 'You are outside the places allowed for this account.');
    }
    await this.db.query('UPDATE staff_users SET last_location_at = ? WHERE id = ?', [nowSql(), row.id]);
    await this.event(row, 'ok', hit.name, hit.distance, cleanIp);
  }

  private async mailboxById(accountId: string): Promise<Mailbox | null> {
    const row = await this.db.one('SELECT * FROM smtp_accounts WHERE id = ? AND is_active = 1', [accountId]);
    if (!row) return null;
    const pass = openSeal(String(row.password_enc || ''));
    if (!pass) return null;
    const fromEmail = String(row.from_email || row.username);
    const fromName = String(row.from_name || 'Altamid Control');
    return {
      host: String(row.host),
      port: Number(row.port),
      secure: String(row.encryption) === 'ssl',
      user: String(row.username),
      pass,
      from: fromName + ' <' + fromEmail + '>',
    };
  }

  private async placesFor(row: SqlRow): Promise<SqlRow[]> {
    const places = await this.db.query('SELECT * FROM login_places WHERE active = 1');
    const roleId = String(row.role_id || '');
    const staffId = String(row.id);
    return places.filter((place) => {
      const roles = jsonIds(place.role_ids);
      const people = jsonIds(place.staff_ids);
      return (roleId && roles.includes(roleId)) || people.includes(staffId);
    });
  }

  private nearest(where: GeoFix, places: SqlRow[]): { inside: boolean; name: string; distance: number } {
    const buffer = Math.min(Math.max(Number(where.accuracy) || 0, 0), 100);
    let best = { inside: false, name: '', distance: Number.POSITIVE_INFINITY };
    for (const place of places) {
      if (!scheduleOpen(jsonRecord(place.schedule_json))) continue;
      const distance = distanceMetres(where.lat, where.lng, Number(place.lat), Number(place.lng));
      const inside = distance <= Number(place.radius_m) + buffer;
      if (inside && distance < best.distance) best = { inside: true, name: String(place.name), distance };
      else if (!best.inside && distance < best.distance) best = { inside: false, name: String(place.name), distance };
    }
    if (!Number.isFinite(best.distance)) return { inside: false, name: '', distance: 0 };
    return { ...best, distance: Math.round(best.distance) };
  }

  private async hasOverride(staffId: string): Promise<boolean> {
    const row = await this.db.one('SELECT id FROM login_overrides WHERE staff_id = ? AND expires_at > ? LIMIT 1', [staffId, nowSql()]);
    return !!row;
  }

  private async cleanRoles(value: unknown): Promise<string[]> {
    const ids = [...new Set(jsonIds(value))];
    const clean: string[] = [];
    for (const roleId of ids) {
      const role = await this.db.one(`SELECT id FROM roles WHERE id = ? AND slug <> 'super_admin'`, [roleId]);
      if (role) clean.push(roleId);
    }
    return clean;
  }

  private async cleanStaff(value: unknown): Promise<string[]> {
    const ids = [...new Set(jsonIds(value))];
    const clean: string[] = [];
    for (const staffId of ids) {
      const person = await this.db.one(`SELECT id FROM staff_users WHERE id = ? AND role <> 'super_admin'`, [staffId]);
      if (person) clean.push(staffId);
    }
    return clean;
  }

  private cleanSchedule(body: Record<string, unknown>): { days: number[]; start: string; end: string } {
    const days = [...new Set(jsonIds(body.days).map((item) => Number(item)).filter((item) => item >= 1 && item <= 7))].sort((a, b) => a - b);
    const start = clock(body.start);
    const end = clock(body.end);
    if (start && end && start >= end) throw new ControlError(400, 'invalid_request', 'Opening time must be before closing time.');
    return { days, start, end };
  }

  private placeJson(row: SqlRow): Record<string, unknown> {
    const schedule = jsonRecord(row.schedule_json);
    return {
      id: row.id,
      name: row.name,
      address: row.address || '',
      lat: Number(row.lat),
      lng: Number(row.lng),
      radius: Number(row.radius_m),
      active: flag(row.active),
      roleIds: jsonIds(row.role_ids),
      staffIds: jsonIds(row.staff_ids),
      days: Array.isArray(schedule.days) ? schedule.days.map((item) => Number(item)).filter((item) => item >= 1 && item <= 7) : [],
      start: typeof schedule.start === 'string' ? schedule.start : '',
      end: typeof schedule.end === 'string' ? schedule.end : '',
    };
  }

  private recheckMinutes(value: unknown): number {
    const minutes = Math.round(Number(value));
    if (!Number.isFinite(minutes)) return 20;
    return Math.min(240, Math.max(5, minutes));
  }

  private async setting(key: string, fallback: string): Promise<string> {
    const row = await this.db.one('SELECT value_text FROM app_settings WHERE key_name = ?', [key]);
    return row ? String(row.value_text ?? '') : fallback;
  }

  private async putSetting(key: string, value: string): Promise<void> {
    await this.db.query(
      `INSERT INTO app_settings (key_name, value_text, updated_at) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), updated_at = VALUES(updated_at)`,
      [key, value, nowSql()],
    );
  }

  private async event(row: SqlRow, result: string, place: string, distance: number | null, ip: string): Promise<void> {
    await this.db.query(
      `INSERT INTO login_events (id, staff_id, email, result, place_name, distance_m, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id(), row.id, String(row.email || ''), result, place, distance, ip.slice(0, 64), nowSql()],
    );
  }

  private async audit(actorId: string, action: string, detail: Record<string, unknown>, ip: string): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, detail, ip, created_at) VALUES (?, ?, ?, 'settings', ?, ?, ?, ?)`,
      [id(), actorId, action, actorId, JSON.stringify(detail), (ip || '').slice(0, 64), nowSql()],
    );
  }
}

export function readGeo(body: { lat?: unknown; lng?: unknown; accuracy?: unknown } | undefined): GeoFix | undefined {
  if (!body || body.lat === undefined || body.lat === null || body.lat === '' || body.lng === undefined || body.lng === null || body.lng === '') {
    return undefined;
  }
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng, accuracy: Number(body.accuracy) || 0 };
}

function jsonIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clock(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new ControlError(400, 'invalid_request', 'Hours must look like 09:00.');
  }
  return text;
}

function validNetwork(value: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return ipv4(value) !== null;
  if (/^\d{1,3}(\.\d{1,3}){3}\/(?:[0-9]|[1-2][0-9]|3[0-2])$/.test(value)) return ipv4(value.split('/')[0]) !== null;
  return /^[0-9a-f:]+$/i.test(value) && value.includes(':') && value.length <= 45;
}

function networkMatches(ip: string, rule: string): boolean {
  const clean = ip.trim().toLowerCase();
  const value = rule.trim().toLowerCase();
  if (!value.includes('/')) return clean === value;
  const [base, bitsRaw] = value.split('/');
  const bits = Number(bitsRaw);
  const left = ipv4(clean);
  const right = ipv4(base);
  if (left === null || right === null || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (left & mask) === (right & mask);
}

function ipv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const number = Number(part);
    if (number > 255) return null;
    result = ((result << 8) + number) >>> 0;
  }
  return result;
}

function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earth = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

function scheduleOpen(schedule: Record<string, unknown>, now = new Date()): boolean {
  const days = Array.isArray(schedule.days) ? schedule.days.map((item) => Number(item)) : [];
  if (days.length) {
    const iso = now.getDay() === 0 ? 7 : now.getDay();
    if (!days.includes(iso)) return false;
  }
  const start = typeof schedule.start === 'string' ? schedule.start : '';
  const end = typeof schedule.end === 'string' ? schedule.end : '';
  if (!start && !end) return true;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMinutes = (value: string): number | null => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const from = start ? toMinutes(start) : 0;
  const until = end ? toMinutes(end) : 24 * 60;
  if (from === null || until === null) return true;
  return minutes >= from && minutes <= until;
}

let mailKey: Buffer | null = null;

async function readJson(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const body = (await response.json()) as unknown;
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
}

function weatherIcon(code: number): string {
  if (code === 0) return 'bi-sun';
  if (code <= 3) return 'bi-cloud-sun';
  if (code <= 48) return 'bi-cloud-fog2';
  if (code <= 57) return 'bi-cloud-drizzle';
  if (code <= 67) return 'bi-cloud-rain';
  if (code <= 77) return 'bi-snow';
  if (code <= 82) return 'bi-cloud-rain-heavy';
  if (code <= 86) return 'bi-snow';
  return 'bi-cloud-lightning';
}

function weatherLabel(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 57) return 'Drizzle';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  if (code <= 86) return 'Snow';
  return 'Thunderstorm';
}

function secret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    return readFileSync(join(process.cwd(), 'storage', 'jwt.secret'), 'utf8').trim() || 'altamid-control';
  } catch {
    return 'altamid-control';
  }
}

function key(): Buffer {
  if (!mailKey) mailKey = scryptSync(secret(), 'altamid-control-smtp', 32);
  return mailKey;
}

function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function openSeal(sealed: string): string {
  try {
    const raw = Buffer.from(sealed, 'base64');
    if (raw.length < 29) return '';
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const enc = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
