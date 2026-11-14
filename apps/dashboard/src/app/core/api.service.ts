import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuditRow, Coupon, Customer, Offer, ProductCard, ReportResult, Staff, SubscriptionBrief, SubscriptionDetail } from './models';

export const TOKEN_KEY = 'altamid_control_token';
export const REMEMBER_KEY = 'altamid_control_remember';
export const EMAIL_KEY = 'altamid_control_email';

export function readToken(): string {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
}

export function saveToken(token: string, remember: boolean): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  if (remember) localStorage.setItem(REMEMBER_KEY, '1');
  else localStorage.removeItem(REMEMBER_KEY);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = readToken();
  const authed = token ? req.clone({ setHeaders: { Authorization: 'Bearer ' + token } }) : req;
  return next(authed).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/login') && !req.url.includes('/auth/forgot') && !req.url.includes('/auth/reset')) {
        clearToken();
        inject(Router).navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  login(email: string, password: string, where?: { lat: number; lng: number; accuracy: number }, remember = false) {
    return this.http.post<{ ok: boolean; token: string; staff: Staff }>('/v1/auth/login', { email, password, remember, ...where });
  }

  forgotPassword(email: string) {
    return this.http.post<{ ok: boolean }>('/v1/auth/forgot', { email });
  }

  resetPassword(email: string, code: string, password: string) {
    return this.http.post<{ ok: boolean }>('/v1/auth/reset', { email, code, password });
  }

  me() {
    return this.http.get<{ staff: Staff }>('/v1/auth/me');
  }

  overview() {
    return this.http.get<{
      customers: number;
      attention: number;
      products: ProductCard[];
      statuses?: Array<{ status: string; count: number }>;
    }>('/v1/overview');
  }

  products() {
    return this.http.get<{ items: ProductCard[] }>('/v1/products');
  }

  createProduct(body: Record<string, unknown>) {
    return this.http.post<{ product: ProductCard }>('/v1/products', body);
  }

  createPlan(code: string, body: Record<string, unknown>) {
    return this.http.post<{ product: ProductCard & { plans: import('./models').Plan[] } }>('/v1/products/' + code + '/plans', body);
  }

  product(code: string) {
    return this.http.get<{ product: ProductCard & { plans: import('./models').Plan[]; releases: import('./models').Release[] } }>(
      '/v1/products/' + code,
    );
  }

  updateProduct(code: string, body: Record<string, unknown>) {
    return this.http.patch<{ product: ProductCard }>('/v1/products/' + code, body);
  }

  productSubscriptions(code: string) {
    return this.http.get<{ items: SubscriptionBrief[] }>('/v1/products/' + code + '/subscriptions');
  }

  createRelease(code: string, body: { version: string; channel: string; notes: string }) {
    return this.http.post('/v1/products/' + code + '/releases', body);
  }

  publishRelease(id: string) {
    return this.http.post('/v1/releases/' + id + '/publish', {});
  }

  yankRelease(id: string) {
    return this.http.post('/v1/releases/' + id + '/yank', {});
  }

  customers(q = '', status = 'active') {
    return this.http.get<{ items: Customer[] }>('/v1/customers', { params: { q, status } });
  }

  customer(id: string) {
    return this.http.get<{ customer: Customer }>('/v1/customers/' + id);
  }

  createCustomer(body: Record<string, unknown>) {
    return this.http.post<{ customer: Customer }>('/v1/customers', body);
  }

  updateCustomer(id: string, body: Record<string, unknown>) {
    return this.http.patch<{ customer: Customer }>('/v1/customers/' + id, body);
  }

  createSubscription(body: Record<string, unknown>) {
    return this.http.post<{ subscription: SubscriptionDetail }>('/v1/subscriptions', body);
  }

  subscription(id: string) {
    return this.http.get<{ subscription: SubscriptionDetail }>('/v1/subscriptions/' + id);
  }

  updateSubscription(id: string, body: Record<string, unknown>) {
    return this.http.patch<{ subscription: SubscriptionDetail }>('/v1/subscriptions/' + id, body);
  }

  issueKey(id: string, label: string) {
    return this.http.post<{ id: string; hint: string; licenseKey: string }>('/v1/subscriptions/' + id + '/keys', { label });
  }

  revokeKey(id: string, keyId: string) {
    return this.http.post('/v1/subscriptions/' + id + '/keys/' + keyId + '/revoke', {});
  }

  resetBinding(id: string) {
    return this.http.post<{ subscription: SubscriptionDetail }>('/v1/subscriptions/' + id + '/reset-binding', {});
  }

  audit() {
    return this.http.get<{ items: AuditRow[] }>('/v1/audit');
  }

  updatePlanPrice(code: string, planCode: string, body: Record<string, unknown>) {
    return this.http.patch<{ product: ProductCard & { plans: import('./models').Plan[] } }>(
      '/v1/products/' + code + '/plans/' + planCode,
      body,
    );
  }

  revenue() {
    return this.http.get<{
      currency: string;
      subscriptions: number;
      listAmount: number;
      discountAmount: number;
      purchaseAmount: number;
      purchases: SubscriptionBrief[];
      offers: Offer[];
    }>('/v1/revenue');
  }

  offers() {
    return this.http.get<{ items: Offer[] }>('/v1/offers');
  }

  createOffer(body: Record<string, unknown>) {
    return this.http.post<{ offer: Offer }>('/v1/offers', body);
  }

  releaseOffer(id: string) {
    return this.http.post<{ offer: Offer }>('/v1/offers/' + id + '/release', {});
  }

  endOffer(id: string) {
    return this.http.post<{ offer: Offer }>('/v1/offers/' + id + '/end', {});
  }

  updateOffer(id: string, body: Record<string, unknown>) {
    return this.http.patch<{ offer: Offer }>('/v1/offers/' + id, body);
  }

  deleteOffer(id: string) {
    return this.http.post<{ deleted: boolean; offer?: Offer }>('/v1/offers/' + id + '/delete', {});
  }

  coupons() {
    return this.http.get<{ items: Coupon[] }>('/v1/coupons');
  }

  createCoupon(body: Record<string, unknown>) {
    return this.http.post<{ coupon: Coupon }>('/v1/coupons', body);
  }

  updateCoupon(id: string, body: Record<string, unknown>) {
    return this.http.patch<{ coupon: Coupon }>('/v1/coupons/' + id, body);
  }

  releaseCoupon(id: string) {
    return this.http.post<{ coupon: Coupon }>('/v1/coupons/' + id + '/release', {});
  }

  deleteCoupon(id: string) {
    return this.http.post<{ deleted: boolean; coupon?: Coupon }>('/v1/coupons/' + id + '/delete', {});
  }

  report(type: string, from = '', to = '') {
    return this.http.get<{ report: ReportResult }>('/v1/reports/' + type, { params: { from, to } });
  }

  staff() {
    return this.http.get<{ items: Staff[] }>('/v1/staff');
  }

  createStaff(body: Record<string, unknown>) {
    return this.http.post<{ staff: Staff }>('/v1/staff', body);
  }

  updateStaff(id: string, body: Record<string, unknown>) {
    return this.http.patch<{ staff: Staff }>('/v1/staff/' + id, body);
  }

  staffOne(id: string) {
    return this.http.get<{ staff: Staff }>('/v1/staff/' + id);
  }

  deleteStaff(id: string) {
    return this.http.post<{ ok: boolean }>('/v1/staff/' + id + '/delete', {});
  }

  avatar(id: string) {
    return this.http.get<{ contentType: string; data: string }>('/v1/staff/' + id + '/avatar');
  }

  updateProfile(body: Record<string, unknown>) {
    return this.http.patch<{ staff: Staff }>('/v1/me', body);
  }

  changePassword(body: Record<string, unknown>) {
    return this.http.post<{ ok: boolean }>('/v1/me/password', body);
  }

  sendProfileOtp() {
    return this.http.post<{ ok: boolean; sentTo: string }>('/v1/me/otp', {});
  }

  saveAvatar(body: Record<string, unknown>) {
    return this.http.post<{ staff: Staff }>('/v1/me/avatar', body);
  }

  clearAvatar(body: Record<string, unknown>) {
    return this.http.post<{ staff: Staff }>('/v1/me/avatar/remove', body);
  }

  setPresence(body: Record<string, unknown>) {
    return this.http.post<{ staff: Staff }>('/v1/me/presence', body);
  }

  touchSeen(where?: { lat: number; lng: number; accuracy: number }) {
    return this.http.post<{ staff: Staff }>('/v1/me/seen', where || {});
  }

  layouts() {
    return this.http.get<{ layouts: Record<string, Record<string, string[]>> }>('/v1/me/layouts');
  }

  saveLayout(page: string, cols: Record<string, string[]>) {
    return this.http.put<{ cols: Record<string, string[]> }>('/v1/me/layouts/' + page, { cols });
  }

  resetLayout(page: string) {
    return this.http.delete<{ ok: boolean }>('/v1/me/layouts/' + page);
  }

  weather() {
    return this.http.get<{ weather: { temp: number; icon: string; label: string; place: string } | null }>('/v1/weather');
  }

  settings() {
    return this.http.get<{ settings: Record<string, unknown> }>('/v1/settings');
  }

  saveSetting(path: string, body: Record<string, unknown>, method: 'patch' | 'post' = 'post') {
    const url = '/v1/settings/' + path;
    return method === 'patch'
      ? this.http.patch<{ settings?: Record<string, unknown> }>(url, body)
      : this.http.post<{ settings?: Record<string, unknown> }>(url, body);
  }

  roles() {
    return this.http.get<{ items: import('./models').RoleCard[] }>('/v1/roles');
  }

  role(id: string) {
    return this.http.get<{
      role: import('./models').RoleCard;
      granted: string[];
      catalog: import('./models').PermissionDef[];
      members: Array<{ id: string; name: string; email: string; status: string }>;
    }>('/v1/roles/' + id);
  }

  createRole(body: Record<string, unknown>) {
    return this.http.post<{ role: import('./models').RoleCard }>('/v1/roles', body);
  }

  updateRole(id: string, body: Record<string, unknown>) {
    return this.http.patch<{ role: import('./models').RoleCard; granted: string[] }>('/v1/roles/' + id, body);
  }

  deleteRole(id: string) {
    return this.http.post<{ ok: boolean }>('/v1/roles/' + id + '/delete', {});
  }

  checkLease(body: Record<string, unknown>) {
    return this.http.post<{
      ok: boolean;
      alg: string;
      kid: string;
      signature: string;
      lease: import('../../../../../packages/contract/policy').LeaseV1;
    }>('/v1/lease/check', body);
  }

  publicKeys() {
    return this.http.get<{ keys: Array<{ kid: string; publicKeyRaw: string; status: string }> }>('/v1/keys');
  }
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  staff: Staff | null = null;
  avatarUrl = '';
}
