export interface Staff {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: string;
  roleName?: string;
  status: string;
  presence?: string;
  presenceLabel?: string;
  presenceSource?: string;
  hasAvatar?: boolean;
  lastSeenAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  permissions?: string[];
  locationDue?: boolean;
}

export const PRESENCE_OPTIONS = [
  { id: 'online', label: 'Online', icon: 'bi-check-lg' },
  { id: 'busy', label: 'Busy', icon: 'bi-dash-lg' },
  { id: 'call', label: 'On a call', icon: 'bi-telephone-fill' },
  { id: 'break', label: 'Break', icon: 'bi-cup-hot-fill' },
  { id: 'away', label: 'Away', icon: 'bi-clock-fill' },
  { id: 'unavailable', label: 'Not available', icon: 'bi-x-lg' },
  { id: 'custom', label: 'Other', icon: 'bi-pencil-fill' },
] as const;

export function presenceIcon(id: string | null | undefined): string {
  return PRESENCE_OPTIONS.find((item) => item.id === id)?.icon || 'bi-check-lg';
}

export function presenceName(staff: { presence?: string; presenceLabel?: string } | null | undefined): string {
  if (!staff?.presence) return 'Online';
  if (staff.presence === 'custom' && staff.presenceLabel) return staff.presenceLabel;
  return PRESENCE_OPTIONS.find((item) => item.id === staff.presence)?.label || 'Online';
}

export interface RoleCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  system: boolean;
  locked: boolean;
  protected: boolean;
  granted: number;
  total: number;
  users: number;
}

export interface PermissionDef {
  slug: string;
  module: string;
  moduleLabel: string;
  name: string;
  icon: string;
}

export function can(staff: Staff | null | undefined, slug: string): boolean {
  if (!staff) return false;
  if (staff.role === 'super_admin') return true;
  return (staff.permissions || []).includes(slug);
}

export interface ProductCard {
  id: string;
  code: string;
  keyTag: string;
  name: string;
  summary: string;
  status: string;
  instanceKind: string;
  seatUnit: string;
  opensOutlets?: boolean;
  hostPolicy: string;
  connectionState: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  subscribers?: number;
  installs7d?: number;
  plans?: number;
  attention?: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  billingPeriod: string;
  seatLimit: number | null;
  priceNote: string;
  priceAmount: number;
  priceBasis: 'seat' | 'flat';
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Release {
  id: string;
  version: string;
  channel: string;
  state: string;
  notes: string;
  hasPackage: boolean;
  publishedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SubscriptionBrief {
  id: string;
  customerId: string;
  customerName: string;
  productCode: string;
  productName: string;
  planCode: string;
  planName: string;
  status: string;
  effectiveStatus: string;
  startsAt: string;
  endsAt: string;
  seatLimit: number | null;
  seatsPurchased?: number;
  periods?: number;
  listAmount?: number;
  discountAmount?: number;
  purchaseAmount?: number;
  offerCode?: string;
  couponCode?: string;
  graceDays?: number;
  channel?: string;
  hostPolicy?: string;
  maxInstances?: number;
  outletOf?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LicenseKeyRow {
  id: string;
  hint: string;
  label: string;
  status: string;
  createdAt: string | null;
  revokedAt: string | null;
}

export interface InstanceRow {
  id: string;
  instanceId: string;
  binding: string;
  runtime: string;
  version: string;
  lastVerdict: string;
  lastSeenAt: string | null;
  usage: { seats?: number };
}

export interface SubscriptionDetail extends SubscriptionBrief {
  graceDays: number;
  enforceSeatLimit: boolean;
  planSeatLimit: number | null;
  seatUnit: string;
  billingPeriod: string;
  unitPrice: number;
  priceBasis: 'seat' | 'flat';
  hostPolicy: string;
  bindings: string[];
  maxInstances: number;
  versionPin: string;
  minVersion: string;
  blockOutdated: boolean;
  channel: string;
  notes: string;
  lastReject: string;
  lastRejectAt: string | null;
  instanceKind: string;
  keys: LicenseKeyRow[];
  instances: InstanceRow[];
  opensOutlets: boolean;
  outlets: SubscriptionBrief[];
  outletsAllowed: number | null;
  outletMain: SubscriptionBrief | null;
  mainChoices: Array<{ id: string; label: string }>;
}

export interface BehaviourNote {
  id: string;
  kind: string;
  note: string;
  at: string | null;
  by: string;
}

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  notes: string;
  status: string;
  labels: string[];
  alerts: string[];
  blocked: boolean;
  blockReason: string;
  behaviour: BehaviourNote[];
  createdAt?: string | null;
  updatedAt?: string | null;
  subscriptions?: SubscriptionBrief[];
}

export interface ReportColumn {
  key: string;
  label: string;
  pill?: boolean;
}

export interface ReportResult {
  type: string;
  title: string;
  summary: string;
  from: string;
  to: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string>>;
}

export interface Coupon {
  id: string;
  code: string;
  name: string;
  scope: 'all' | 'product';
  productCode: string;
  productName: string;
  kind: 'percent' | 'amount';
  value: number;
  startsAt: string;
  endsAt: string;
  status: string;
  note: string;
}

export interface Offer {
  id: string;
  code: string;
  name: string;
  scope: 'all' | 'product';
  productCode: string;
  productName: string;
  kind: 'percent' | 'amount';
  value: number;
  startsAt: string;
  endsAt: string;
  status: string;
  note: string;
}

export function when(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function inr(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

export interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  actorEmail: string;
  ip: string;
  createdAt: string | null;
  detail: Record<string, unknown>;
}

export function tone(status: string): string {
  if (['active', 'trialing', 'connected', 'published', 'released'].includes(status)) return 'ok';
  if (['grace', 'past_due', 'ready', 'catalog_only', 'draft', 'superseded'].includes(status)) return 'warn';
  if (['revoked', 'expired', 'suspended', 'cancelled', 'yanked', 'archived', 'ended', 'retired'].includes(status)) return 'bad';
  return '';
}

export function pill(status: string): string {
  const kind = tone(status);
  return kind ? 'pill ' + kind : 'pill';
}

export function apiError(error: unknown): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const body = (error as { error?: { message?: string } }).error;
    if (body?.message) return body.message;
  }
  return 'Control could not complete that request.';
}

export function apiCode(error: unknown): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const body = (error as { error?: { error?: string } }).error;
    return body?.error || '';
  }
  return '';
}
