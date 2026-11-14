export interface PermissionDef {
  slug: string;
  module: string;
  moduleLabel: string;
  name: string;
  icon: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { slug: 'dashboard.view', module: 'dashboard', moduleLabel: 'Dashboard', name: 'View the dashboard', icon: 'bi-grid-1x2' },
  { slug: 'products.view', module: 'products', moduleLabel: 'Products', name: 'View products', icon: 'bi-box-seam' },
  { slug: 'products.manage', module: 'products', moduleLabel: 'Products', name: 'Add and edit products and plans', icon: 'bi-box-seam' },
  { slug: 'releases.manage', module: 'releases', moduleLabel: 'Releases', name: 'Register and publish versions', icon: 'bi-cloud-upload' },
  { slug: 'customers.view', module: 'customers', moduleLabel: 'Customers', name: 'View customers', icon: 'bi-building' },
  { slug: 'customers.manage', module: 'customers', moduleLabel: 'Customers', name: 'Add and edit customers', icon: 'bi-building' },
  { slug: 'subscriptions.view', module: 'subscriptions', moduleLabel: 'Subscriptions', name: 'View subscriptions', icon: 'bi-key' },
  { slug: 'subscriptions.manage', module: 'subscriptions', moduleLabel: 'Subscriptions', name: 'Open and change subscriptions', icon: 'bi-key' },
  { slug: 'licenses.manage', module: 'licenses', moduleLabel: 'License keys', name: 'Issue, revoke, and reset keys', icon: 'bi-key-fill' },
  { slug: 'revenue.view', module: 'revenue', moduleLabel: 'Revenue', name: 'View purchases', icon: 'bi-currency-rupee' },
  { slug: 'offers.view', module: 'offers', moduleLabel: 'Offers', name: 'See offers and pick one for a customer', icon: 'bi-tag' },
  { slug: 'offers.create', module: 'offers', moduleLabel: 'Offers', name: 'Create an offer', icon: 'bi-tag' },
  { slug: 'offers.update', module: 'offers', moduleLabel: 'Offers', name: 'Update or release an offer', icon: 'bi-tag' },
  { slug: 'offers.delete', module: 'offers', moduleLabel: 'Offers', name: 'Delete or end an offer', icon: 'bi-tag' },
  { slug: 'coupons.view', module: 'coupons', moduleLabel: 'Coupons', name: 'See coupon codes and pick one for a customer', icon: 'bi-ticket-perforated' },
  { slug: 'coupons.create', module: 'coupons', moduleLabel: 'Coupons', name: 'Create a coupon code', icon: 'bi-ticket-perforated' },
  { slug: 'coupons.update', module: 'coupons', moduleLabel: 'Coupons', name: 'Update or release a coupon code', icon: 'bi-ticket-perforated' },
  { slug: 'coupons.delete', module: 'coupons', moduleLabel: 'Coupons', name: 'Delete or end a coupon code', icon: 'bi-ticket-perforated' },
  { slug: 'reports.view', module: 'reports', moduleLabel: 'Reports', name: 'Generate reports', icon: 'bi-file-earmark-bar-graph' },
  { slug: 'audit.view', module: 'audit', moduleLabel: 'Audit', name: 'View the audit', icon: 'bi-journal-text' },
  { slug: 'lab.use', module: 'lab', moduleLabel: 'Connection lab', name: 'Run a check-in in the lab', icon: 'bi-plug' },
  { slug: 'users.view', module: 'users', moduleLabel: 'Team', name: 'View teammates', icon: 'bi-people' },
  { slug: 'users.manage', module: 'users', moduleLabel: 'Team', name: 'Add teammates and change roles', icon: 'bi-people' },
  { slug: 'roles.manage', module: 'roles', moduleLabel: 'Roles', name: 'Create roles and set permissions', icon: 'bi-shield-lock' },
  { slug: 'settings.view', module: 'settings', moduleLabel: 'Settings', name: 'View workspace settings', icon: 'bi-gear' },
  { slug: 'settings.manage', module: 'settings', moduleLabel: 'Settings', name: 'Change general settings, IP access, and login locations', icon: 'bi-gear' },
  { slug: 'settings.email', module: 'settings', moduleLabel: 'Settings', name: 'Set up SMTP email accounts', icon: 'bi-envelope' },
];

export const ALL_SLUGS = PERMISSIONS.map((item) => item.slug);

const VIEW = [
  'dashboard.view',
  'products.view',
  'customers.view',
  'subscriptions.view',
  'revenue.view',
  'offers.view',
  'coupons.view',
  'reports.view',
  'audit.view',
  'lab.use',
];

export interface RolePreset {
  slug: string;
  name: string;
  description: string;
  permissions: string[];
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    slug: 'super_admin',
    name: 'Super Admin',
    description: 'Every control, including roles and who may be a Super Admin.',
    permissions: ALL_SLUGS,
  },
  {
    slug: 'admin',
    name: 'Admin',
    description: 'Full day-to-day access. Super Admin stays protected.',
    permissions: ALL_SLUGS,
  },
  {
    slug: 'support',
    name: 'Support',
    description: 'Customers, subscriptions, and license keys.',
    permissions: [...VIEW, 'customers.manage', 'subscriptions.manage', 'licenses.manage'],
  },
  {
    slug: 'release_manager',
    name: 'Release manager',
    description: 'Register and publish product versions.',
    permissions: [...VIEW, 'releases.manage'],
  },
  {
    slug: 'viewer',
    name: 'Viewer',
    description: 'Read the catalog, subscribers, revenue, reports, and audit.',
    permissions: VIEW,
  },
];
