import { Injectable } from '@nestjs/common';
import { createConnection, createPool, Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { SCHEMA_SQL } from './schema';
import { ControlError } from './errors';

export type SqlRow = RowDataPacket & Record<string, unknown>;

@Injectable()
export class DatabaseService {
  pool!: Pool;

  async init(): Promise<void> {
    const host = process.env.DB_HOST || '127.0.0.1';
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD ?? '';
    const database = process.env.DB_NAME || 'altamid_control';
    const base = {
      host,
      port,
      user,
      password,
      charset: 'utf8mb4',
      dateStrings: true,
      timezone: 'Z',
      supportBigNumbers: true,
    };
    try {
      const conn = await createConnection(base);
      await conn.query(
        'CREATE DATABASE IF NOT EXISTS `' +
          database.replace(/`/g, '') +
          '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      );
      await conn.end();
      this.pool = createPool({ ...base, database, connectionLimit: 10, waitForConnections: true });
      await this.migrate();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'database error';
      throw new ControlError(
        500,
        'database_unavailable',
        'Control could not open its database. Start MariaDB or MySQL, then check DB_HOST, DB_PORT, DB_USER and DB_PASSWORD. ' +
          message,
      );
    }
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async one<T extends SqlRow = SqlRow>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  private async ensureColumn(table: string, column: string, definition: string): Promise<void> {
    const row = await this.one(
      `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    if (!row) await this.pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }

  private async migrate(): Promise<void> {
    const statements = SCHEMA_SQL.split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    for (const statement of statements) {
      await this.pool.query(statement);
    }
    await this.ensureColumn('plans', 'price_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    await this.ensureColumn('plans', 'price_basis', "VARCHAR(8) NOT NULL DEFAULT 'seat'");
    await this.ensureColumn('subscriptions', 'seats_purchased', 'INT NOT NULL DEFAULT 1');
    await this.ensureColumn('subscriptions', 'periods', 'INT NOT NULL DEFAULT 1');
    await this.ensureColumn('subscriptions', 'list_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    await this.ensureColumn('subscriptions', 'discount_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    await this.ensureColumn('subscriptions', 'purchase_amount', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
    await this.ensureColumn('subscriptions', 'offer_id', 'CHAR(36) NULL');
    await this.ensureColumn('subscriptions', 'offer_code', "VARCHAR(40) NOT NULL DEFAULT ''");
    await this.ensureColumn('subscriptions', 'coupon_id', 'CHAR(36) NULL');
    await this.ensureColumn('subscriptions', 'coupon_code', "VARCHAR(40) NOT NULL DEFAULT ''");
    await this.ensureColumn('subscriptions', 'outlet_of', 'CHAR(36) NULL');
    await this.ensureColumn('staff_users', 'role_id', 'CHAR(36) NULL');
    await this.ensureColumn('staff_users', 'phone', "VARCHAR(40) NOT NULL DEFAULT ''");
    await this.ensureColumn('staff_users', 'avatar', "VARCHAR(80) NOT NULL DEFAULT ''");
    await this.ensureColumn('staff_users', 'presence', "VARCHAR(24) NOT NULL DEFAULT 'online'");
    await this.ensureColumn('staff_users', 'presence_label', "VARCHAR(40) NOT NULL DEFAULT ''");
    await this.ensureColumn('staff_users', 'presence_source', "VARCHAR(16) NOT NULL DEFAULT 'auto'");
    await this.ensureColumn('staff_users', 'presence_at', 'DATETIME(3) NULL');
    await this.ensureColumn('staff_users', 'last_seen_at', 'DATETIME(3) NULL');
    await this.ensureColumn('customers', 'labels_json', "LONGTEXT NOT NULL DEFAULT '[]'");
    await this.ensureColumn('customers', 'blocked', 'TINYINT(1) NOT NULL DEFAULT 0');
    await this.ensureColumn('customers', 'block_reason', "VARCHAR(240) NOT NULL DEFAULT ''");
    await this.ensureColumn('customers', 'behaviour_json', "LONGTEXT NOT NULL DEFAULT '[]'");
    await this.ensureColumn('customers', 'alerts_json', "LONGTEXT NOT NULL DEFAULT '[]'");
    await this.ensureColumn('staff_users', 'last_location_at', 'DATETIME(3) NULL');
    const seen = await this.one('SELECT id FROM schema_migrations WHERE id = ?', ['001_init']);
    if (!seen) {
      await this.pool.query('INSERT INTO schema_migrations (id, applied_at) VALUES (?, UTC_TIMESTAMP(3))', [
        '001_init',
      ]);
    }
  }
}

export async function connQuery<T extends SqlRow = SqlRow>(
  conn: PoolConnection,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await conn.query(sql, params);
  return rows as T[];
}
