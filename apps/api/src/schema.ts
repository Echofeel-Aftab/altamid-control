export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(190) NOT NULL,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_staff_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  key_tag VARCHAR(16) NOT NULL,
  name VARCHAR(120) NOT NULL,
  summary VARCHAR(400) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  instance_kind VARCHAR(16) NOT NULL DEFAULT 'host',
  seat_unit VARCHAR(32) NOT NULL DEFAULT 'user',
  host_policy VARCHAR(16) NOT NULL DEFAULT 'bind_first',
  connection_state VARCHAR(24) NOT NULL DEFAULT 'catalog_only',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_product_code (code),
  UNIQUE KEY uq_product_tag (key_tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plans (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  billing_period VARCHAR(16) NOT NULL,
  seat_limit INT NULL,
  entitlements_mode VARCHAR(8) NOT NULL DEFAULT 'all',
  features LONGTEXT NOT NULL,
  limits_json LONGTEXT NOT NULL,
  price_note VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_plan_code (product_id, code),
  CONSTRAINT fk_plan_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  contact_name VARCHAR(120) NOT NULL DEFAULT '',
  contact_email VARCHAR(190) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  notes TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  labels_json LONGTEXT NOT NULL DEFAULT '[]',
  blocked TINYINT(1) NOT NULL DEFAULT 0,
  block_reason VARCHAR(240) NOT NULL DEFAULT '',
  behaviour_json LONGTEXT NOT NULL DEFAULT '[]',
  alerts_json LONGTEXT NOT NULL DEFAULT '[]',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_customer_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  status VARCHAR(16) NOT NULL,
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  grace_days INT NOT NULL DEFAULT 14,
  seat_limit INT NULL,
  enforce_seat_limit TINYINT(1) NOT NULL DEFAULT 0,
  entitlements_mode VARCHAR(8) NOT NULL DEFAULT 'inherit',
  features LONGTEXT NULL,
  limits_json LONGTEXT NULL,
  host_policy VARCHAR(16) NOT NULL DEFAULT 'inherit',
  bindings LONGTEXT NOT NULL,
  max_instances INT NOT NULL DEFAULT 1,
  version_pin VARCHAR(32) NULL,
  min_version VARCHAR(32) NULL,
  block_outdated TINYINT(1) NOT NULL DEFAULT 0,
  channel VARCHAR(16) NOT NULL DEFAULT 'stable',
  notes TEXT NOT NULL,
  last_reject VARCHAR(190) NOT NULL DEFAULT '',
  last_reject_at DATETIME(3) NULL,
  coupon_id CHAR(36) NULL,
  coupon_code VARCHAR(40) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_sub_product (product_id),
  KEY idx_sub_customer (customer_id),
  CONSTRAINT fk_sub_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_sub_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT fk_sub_plan FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS offers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  scope VARCHAR(16) NOT NULL,
  product_id CHAR(36) NULL,
  kind VARCHAR(16) NOT NULL,
  value DECIMAL(12,2) NOT NULL,
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  note VARCHAR(400) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_offer_code (code),
  KEY idx_offer_status (status),
  CONSTRAINT fk_offer_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coupons (
  id CHAR(36) NOT NULL PRIMARY KEY,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  scope VARCHAR(16) NOT NULL,
  product_id CHAR(36) NULL,
  kind VARCHAR(16) NOT NULL,
  value DECIMAL(12,2) NOT NULL,
  starts_at DATE NOT NULL,
  ends_at DATE NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',
  note VARCHAR(400) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_coupon_code (code),
  KEY idx_coupon_status (status),
  CONSTRAINT fk_coupon_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS license_keys (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subscription_id CHAR(36) NOT NULL,
  key_hash CHAR(64) NOT NULL,
  key_hint VARCHAR(48) NOT NULL,
  label VARCHAR(80) NOT NULL DEFAULT 'Production',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  UNIQUE KEY uq_key_hash (key_hash),
  KEY idx_key_sub (subscription_id),
  CONSTRAINT fk_key_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS instances (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subscription_id CHAR(36) NOT NULL,
  license_key_id CHAR(36) NOT NULL,
  instance_id VARCHAR(128) NOT NULL,
  binding VARCHAR(190) NOT NULL DEFAULT '',
  runtime VARCHAR(32) NOT NULL DEFAULT '',
  version VARCHAR(32) NOT NULL DEFAULT '',
  usage_json LONGTEXT NOT NULL,
  agent_version VARCHAR(32) NOT NULL DEFAULT '',
  last_verdict VARCHAR(40) NOT NULL DEFAULT '',
  last_seen_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_instance (subscription_id, instance_id),
  KEY idx_instance_seen (last_seen_at),
  CONSTRAINT fk_inst_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  CONSTRAINT fk_inst_key FOREIGN KEY (license_key_id) REFERENCES license_keys(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS releases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_id CHAR(36) NOT NULL,
  version VARCHAR(32) NOT NULL,
  channel VARCHAR(16) NOT NULL DEFAULT 'stable',
  state VARCHAR(16) NOT NULL DEFAULT 'draft',
  notes MEDIUMTEXT NOT NULL,
  sha256 CHAR(64) NULL,
  bytes BIGINT NULL,
  has_package TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_release (product_id, version, channel),
  CONSTRAINT fk_rel_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commands (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subscription_id CHAR(36) NOT NULL,
  instance_id VARCHAR(128) NULL,
  command_type VARCHAR(40) NOT NULL,
  payload LONGTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL,
  delivered_at DATETIME(3) NULL,
  KEY idx_cmd_sub (subscription_id, status),
  CONSTRAINT fk_cmd_sub FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) NOT NULL PRIMARY KEY,
  actor_id CHAR(36) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id CHAR(36) NULL,
  detail LONGTEXT NOT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  slug VARCHAR(40) NOT NULL,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(240) NOT NULL DEFAULT '',
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_role_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id CHAR(36) NOT NULL,
  permission VARCHAR(80) NOT NULL,
  PRIMARY KEY (role_id, permission),
  CONSTRAINT fk_role_perm FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_otps (
  id CHAR(36) NOT NULL PRIMARY KEY,
  staff_id CHAR(36) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  KEY idx_staff_otp (staff_id, purpose, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS signing_keys (
  id VARCHAR(40) NOT NULL PRIMARY KEY,
  algorithm VARCHAR(20) NOT NULL,
  public_key_pem TEXT NOT NULL,
  public_key_raw VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL,
  created_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  key_name VARCHAR(80) NOT NULL PRIMARY KEY,
  value_text LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS smtp_accounts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  label VARCHAR(120) NOT NULL,
  host VARCHAR(190) NOT NULL,
  port SMALLINT NOT NULL DEFAULT 587,
  encryption VARCHAR(8) NOT NULL DEFAULT 'tls',
  username VARCHAR(190) NOT NULL,
  password_enc TEXT NOT NULL,
  from_name VARCHAR(120) NOT NULL DEFAULT '',
  from_email VARCHAR(190) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ip_rules (
  id CHAR(36) NOT NULL PRIMARY KEY,
  kind VARCHAR(8) NOT NULL,
  cidr VARCHAR(64) NOT NULL,
  label VARCHAR(120) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  KEY idx_ip_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_places (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  address VARCHAR(240) NOT NULL DEFAULT '',
  lat DECIMAL(10,7) NOT NULL,
  lng DECIMAL(10,7) NOT NULL,
  radius_m INT NOT NULL DEFAULT 200,
  active TINYINT(1) NOT NULL DEFAULT 1,
  role_ids LONGTEXT NOT NULL,
  staff_ids LONGTEXT NOT NULL,
  schedule_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_overrides (
  id CHAR(36) NOT NULL PRIMARY KEY,
  staff_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  reason VARCHAR(240) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  KEY idx_override_staff (staff_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS login_events (
  id CHAR(36) NOT NULL PRIMARY KEY,
  staff_id CHAR(36) NULL,
  email VARCHAR(190) NOT NULL DEFAULT '',
  result VARCHAR(32) NOT NULL,
  place_name VARCHAR(120) NOT NULL DEFAULT '',
  distance_m INT NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL,
  KEY idx_login_events_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_layouts (
  staff_id CHAR(36) NOT NULL,
  page_key VARCHAR(40) NOT NULL,
  layout_json LONGTEXT NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (staff_id, page_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;
