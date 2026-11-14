import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuditRow, ProductCard, apiError, pill } from '../core/models';
import { LayoutDirective } from '../shared/layout.directive';
import { PageGuideComponent } from '../shared/page-guide.component';

const PRODUCT_ICONS: Record<string, string> = {
  crm: 'bi-people',
  desk: 'bi-headset',
  'hrms-payroll': 'bi-person-vcard',
  'invoice-billing': 'bi-receipt',
  projects: 'bi-kanban',
  shopsuite: 'bi-shop',
};

const PRODUCT_TONES: Record<string, string> = {
  crm: 'navy',
  desk: 'teal',
  'hrms-payroll': 'green',
  'invoice-billing': 'gold',
  projects: 'navy',
  shopsuite: 'rose',
};

const ACTION_META: Record<string, { icon: string; label: string }> = {
  'staff.login': { icon: 'bi-box-arrow-in-right', label: 'Signed in' },
  'staff.create': { icon: 'bi-person-plus', label: 'Staff added' },
  'staff.update': { icon: 'bi-person-gear', label: 'Access changed' },
  'staff.delete': { icon: 'bi-person-x', label: 'Staff removed' },
  'staff.profile': { icon: 'bi-person-vcard', label: 'Profile updated' },
  'staff.password': { icon: 'bi-shield-lock', label: 'Password changed' },
  'staff.avatar': { icon: 'bi-image', label: 'Profile photo changed' },
  'staff.presence': { icon: 'bi-circle-fill', label: 'Status changed' },
  'role.create': { icon: 'bi-shield-lock', label: 'Role added' },
  'role.update': { icon: 'bi-shield-lock', label: 'Role updated' },
  'role.delete': { icon: 'bi-shield-lock', label: 'Role deleted' },
  'customer.create': { icon: 'bi-building-add', label: 'Customer added' },
  'customer.update': { icon: 'bi-building-gear', label: 'Customer updated' },
  'subscription.create': { icon: 'bi-key', label: 'Subscription opened' },
  'plan.price': { icon: 'bi-currency-rupee', label: 'Plan price set' },
  'offer.create': { icon: 'bi-tag', label: 'Offer drafted' },
  'offer.release': { icon: 'bi-tag', label: 'Offer released' },
  'offer.end': { icon: 'bi-tag', label: 'Offer ended' },
  'offer.update': { icon: 'bi-tag', label: 'Offer updated' },
  'offer.delete': { icon: 'bi-tag', label: 'Offer removed' },
  'coupon.create': { icon: 'bi-ticket-perforated', label: 'Coupon drafted' },
  'coupon.release': { icon: 'bi-ticket-perforated', label: 'Coupon released' },
  'coupon.update': { icon: 'bi-ticket-perforated', label: 'Coupon updated' },
  'coupon.end': { icon: 'bi-ticket-perforated', label: 'Coupon ended' },
  'coupon.delete': { icon: 'bi-ticket-perforated', label: 'Coupon removed' },
  'subscription.update': { icon: 'bi-pencil-square', label: 'Subscription updated' },
  'subscription.reset_binding': { icon: 'bi-arrow-repeat', label: 'Binding reset' },
  'license.issue': { icon: 'bi-key-fill', label: 'License key issued' },
  'license.revoke': { icon: 'bi-slash-circle', label: 'License key revoked' },
  'product.update': { icon: 'bi-box-seam', label: 'Product updated' },
  'product.create': { icon: 'bi-box-seam', label: 'Product added' },
  'plan.create': { icon: 'bi-layers', label: 'Plan added' },
  'release.create': { icon: 'bi-cloud-upload', label: 'Release drafted' },
  'release.publish': { icon: 'bi-cloud-check', label: 'Release published' },
  'release.yank': { icon: 'bi-cloud-slash', label: 'Release yanked' },
};

@Component({
  selector: 'app-overview',
  imports: [RouterLink, LayoutDirective, PageGuideComponent],
  template: `
    <div class="page-stack">
      <header class="top">
        <div>
          <p class="kicker">Team desk</p>
          <h1>Every Altamid product</h1>
          <app-page-guide />
          <p class="muted">Catalog, subscribers, and what the team did last. Live installs still start in the connection lab.</p>
        </div>
        <div class="row">
          <a class="btn btn-ghost" routerLink="/customers"><i class="bi bi-building"></i> Customers</a>
          <a class="btn" routerLink="/lab"><i class="bi bi-plug"></i> Connection lab</a>
        </div>
      </header>
      @if (error) { <div class="banner bad">{{ error }}</div> }

      <div class="layout-board layout-charts" appLayout="dashboard">
      <div class="layout-col layout-col-row layout-col-wide" data-layout-col="kpis">
        <article class="card kpi tone-navy" data-layout-box="customers">
          <div class="kpi-top"><span>Customers</span><span class="kpi-icon"><i class="bi bi-buildings"></i></span></div>
          <div class="kpi-figure"><strong>{{ customers }}</strong><small>Buying companies</small></div>
        </article>
        <article class="card kpi tone-teal" data-layout-box="subscriptions">
          <div class="kpi-top"><span>Subscriptions</span><span class="kpi-icon"><i class="bi bi-journal-check"></i></span></div>
          <div class="kpi-figure"><strong>{{ subscriptions }}</strong><small>Open across the catalog</small></div>
        </article>
        <article class="card kpi tone-rose" data-layout-box="attention" [class.is-warn]="attention > 0">
          <div class="kpi-top"><span>Needs attention</span><span class="kpi-icon"><i class="bi bi-exclamation-triangle"></i></span></div>
          <div class="kpi-figure"><strong>{{ attention }}</strong><small>Grace, expiry, or a hold</small></div>
        </article>
        <article class="card kpi tone-gold" data-layout-box="products">
          <div class="kpi-top"><span>Products</span><span class="kpi-icon"><i class="bi bi-box-seam"></i></span></div>
          <div class="kpi-figure"><strong>{{ products.length }}</strong><small>{{ installs }} {{ installs === 1 ? 'install' : 'installs' }} in 7 days</small></div>
        </article>
      </div>

      <div class="layout-col" data-layout-col="main">
        <section class="card" data-layout-box="plans">
          <div class="card-head">
            <h2><i class="bi bi-bar-chart"></i> Plans in the catalog</h2>
            <span class="pill">{{ planTotal }} plans</span>
          </div>
          <div class="bars">
            @for (product of products; track product.code) {
              <div class="bar-row">
                <span class="bar-fill" [style.width.%]="share(product.plans || 0, maxPlans)"></span>
                <span class="bar-ico"><i class="bi {{ icon(product.code) }}"></i></span>
                <span class="bar-name">{{ product.name.replace('Altamid ', '') }}</span>
                <strong>{{ product.plans || 0 }}</strong>
              </div>
            }
          </div>
        </section>

        <section class="card" data-layout-box="subscribers">
          <div class="card-head">
            <h2><i class="bi bi-people"></i> Subscribers by product</h2>
            <span class="pill">{{ subscriptions }} open</span>
          </div>
          <div class="bars">
            @for (product of products; track product.code) {
              <div class="bar-row">
                <span class="bar-fill gold" [style.width.%]="share(product.subscribers || 0, maxSubs)"></span>
                <span class="bar-ico"><i class="bi {{ icon(product.code) }}"></i></span>
                <span class="bar-name">{{ product.name.replace('Altamid ', '') }}</span>
                <strong>{{ product.subscribers || 0 }}</strong>
              </div>
            }
          </div>
        </section>
      </div>

      <div class="layout-col" data-layout-col="side">
        <section class="card seat-card" data-layout-box="seats">
          <div class="card-head">
            <h2><i class="bi bi-pie-chart"></i> How seats are sold</h2>
          </div>
          <div class="seat-layout">
            <svg class="donut-svg" viewBox="0 0 160 160" aria-hidden="true">
              <circle class="donut-track" cx="80" cy="80" r="58" />
              @for (slice of seatSlices; track slice.label) {
                <circle class="donut-slice {{ slice.klass }}" cx="80" cy="80" r="58"
                  [attr.stroke-dasharray]="slice.dash" [attr.stroke-dashoffset]="slice.offset" />
              }
              <text class="donut-num" x="80" y="78">{{ products.length }}</text>
              <text class="donut-cap" x="80" y="96">products</text>
            </svg>
            <ul class="seat-legend">
              @for (slice of seatSlices; track slice.label) {
                <li>
                  <i class="swatch {{ slice.klass }}"></i>
                  <span>{{ slice.label }}</span>
                  <strong>{{ slice.count }}</strong>
                </li>
              }
            </ul>
          </div>
        </section>

        <section class="card" data-layout-box="health">
          <div class="card-head">
            <h2><i class="bi bi-activity"></i> Subscription health</h2>
            <a routerLink="/audit">Audit</a>
          </div>
          @if (!statuses.length) {
            <div class="empty-inline">
              <i class="bi bi-pie-chart"></i>
              <p>No subscriptions yet. The ring fills as customers take a plan.</p>
            </div>
          } @else {
            <div class="health-list">
              @for (row of statuses; track row.status) {
                <div class="bar-row">
                  <span class="bar-fill" [class.ok]="row.status === 'active' || row.status === 'trialing'" [class.gold]="row.status !== 'active' && row.status !== 'trialing'" [style.width.%]="share(row.count, statusMax)"></span>
                  <span class="bar-name">{{ pretty(row.status) }}</span>
                  <strong>{{ row.count }}</strong>
                </div>
              }
            </div>
          }
          <h3 class="activity-title"><i class="bi bi-clock-history"></i> Latest activity</h3>
          @if (!activity.length) {
            <p class="muted">Nothing in the audit yet.</p>
          } @else {
            <ul class="activity">
              @for (row of activity; track row.id) {
                <li>
                  <span class="activity-ico"><i class="bi {{ actionIcon(row.action) }}"></i></span>
                  <div>
                    <strong>{{ actionLabel(row.action) }}</strong>
                    <small>{{ row.actorEmail || 'Control' }} · {{ when(row.createdAt) }}</small>
                  </div>
                </li>
              }
            </ul>
          }
        </section>
      </div>
      </div>

      <section>
        <div class="card-head">
          <h2><i class="bi bi-grid"></i> Catalog</h2>
          <a routerLink="/products">All products</a>
        </div>
        <div class="catalog-grid">
          @for (product of products; track product.code) {
            <a class="card product-card tone-{{ tone(product.code) }}" [routerLink]="['/products', product.code]">
              <div class="product-top">
                <span class="product-mark"><i class="bi {{ icon(product.code) }}"></i></span>
                <strong>{{ product.name }}</strong>
              </div>
              <p class="muted">{{ product.summary }}</p>
              <div class="product-foot">
                <div class="product-metrics">
                  <span><i class="bi bi-people"></i> {{ product.subscribers || 0 }} {{ (product.subscribers || 0) === 1 ? 'subscriber' : 'subscribers' }}</span>
                  <span><i class="bi bi-layers"></i> {{ product.plans || 0 }} {{ (product.plans || 0) === 1 ? 'plan' : 'plans' }}</span>
                </div>
                <span [class]="pill(product.connectionState)">{{ label(product.connectionState) }}</span>
              </div>
            </a>
          }
        </div>
      </section>
    </div>
  `,
})
export class OverviewComponent implements OnInit {
  private readonly api = inject(ApiService);
  products: ProductCard[] = [];
  statuses: Array<{ status: string; count: number }> = [];
  activity: AuditRow[] = [];
  customers = 0;
  attention = 0;
  error = '';
  readonly pill = pill;

  ngOnInit(): void {
    this.api.overview().subscribe({
      next: (res) => {
        this.products = res.products;
        this.customers = res.customers;
        this.attention = res.attention;
        this.statuses = res.statuses || [];
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
    this.api.audit().subscribe({
      next: (res) => (this.activity = res.items.slice(0, 5)),
    });
  }

  get subscriptions(): number {
    return this.products.reduce((sum, product) => sum + (product.subscribers || 0), 0);
  }

  get installs(): number {
    return this.products.reduce((sum, product) => sum + (product.installs7d || 0), 0);
  }

  get planTotal(): number {
    return this.products.reduce((sum, product) => sum + (product.plans || 0), 0);
  }

  get maxPlans(): number {
    return this.products.reduce((max, product) => Math.max(max, product.plans || 0), 0);
  }

  get maxSubs(): number {
    return this.products.reduce((max, product) => Math.max(max, product.subscribers || 0), 0);
  }

  get statusMax(): number {
    return this.statuses.reduce((max, row) => Math.max(max, row.count), 0);
  }

  get seatSlices(): Array<{ label: string; count: number; dash: string; offset: number; klass: string }> {
    const counts = new Map<string, number>();
    for (const product of this.products) {
      const label = product.seatUnit || 'seat';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    const total = this.products.length || 1;
    const circ = 2 * Math.PI * 58;
    const gap = counts.size > 1 ? 4 : 0;
    let used = 0;
    return [...counts.entries()].map(([label, count], index) => {
      const sweep = (count / total) * circ;
      const slice = {
        label,
        count,
        dash: `${Math.max(0, sweep - gap)} ${circ}`,
        offset: -used,
        klass: 'slice-' + index,
      };
      used += sweep;
      return slice;
    });
  }

  share(value: number, max: number): number {
    if (max <= 0 || value <= 0) return 0;
    return Math.max(10, Math.round((value / max) * 100));
  }

  icon(code: string): string {
    return PRODUCT_ICONS[code] || 'bi-box-seam';
  }

  tone(code: string): string {
    return PRODUCT_TONES[code] || 'navy';
  }

  label(state: string): string {
    if (state === 'catalog_only') return 'Not connected';
    if (state === 'ready') return 'Ready';
    if (state === 'connected') return 'Connected';
    return state;
  }

  pretty(status: string): string {
    return status.replaceAll('_', ' ');
  }

  actionIcon(action: string): string {
    return ACTION_META[action]?.icon || 'bi-dot';
  }

  actionLabel(action: string): string {
    return ACTION_META[action]?.label || action.replaceAll('.', ' ');
  }

  when(iso: string | null): string {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + ' hr ago';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}
