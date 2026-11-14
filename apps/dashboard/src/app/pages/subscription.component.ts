import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { Coupon, InstanceRow, LicenseKeyRow, Offer, Plan, SubscriptionDetail, apiError, can as allow, inr, pill, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { LayoutDirective } from '../shared/layout.directive';
import { NoticeService } from '../shared/notice.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-subscription',
  imports: [FormsModule, RouterLink, DataTableComponent, RowActionsDirective, LayoutDirective, PageGuideComponent],
  template: `
    @if (item) {
      <header class="top">
        <div>
          <p class="kicker">{{ item.productName }}</p>
          <h1>{{ item.customerName }}</h1>
          <app-page-guide />
          <p class="muted">Stored status {{ item.status }} · effective <span [class]="pill(item.effectiveStatus)">{{ item.effectiveStatus }}</span></p>
        </div>
        <a class="btn btn-ghost" [routerLink]="['/customers', item.customerId]"><i class="bi bi-arrow-left"></i> Customer</a>
      </header>
      <div class="page-stack">
      @if (error) { <div class="banner bad">{{ error }}</div> }
      <div class="layout-board layout-stack" appLayout="subscription">
      <div class="layout-col layout-col-row thirds layout-col-wide" data-layout-col="kpis">
        <article class="card kpi tone-navy" data-layout-box="list"><div class="kpi-top"><span>List cost</span><span class="kpi-icon"><i class="bi bi-receipt"></i></span></div><div class="kpi-figure"><strong class="money">{{ inr(item.listAmount) }}</strong><small>{{ item.periods || 1 }} {{ item.billingPeriod }} · {{ item.priceBasis === 'flat' ? 'flat' : (item.seatsPurchased || 1) + ' ' + item.seatUnit }}</small></div></article>
        <article class="card kpi tone-gold" data-layout-box="offer"><div class="kpi-top"><span>Offer</span><span class="kpi-icon"><i class="bi bi-tag"></i></span></div><div class="kpi-figure"><strong class="money">{{ inr(item.discountAmount) }}</strong><small>{{ item.offerCode || 'No offer' }}</small></div></article>
        <article class="card kpi tone-green" data-layout-box="purchase"><div class="kpi-top"><span>Purchase</span><span class="kpi-icon"><i class="bi bi-graph-up"></i></span></div><div class="kpi-figure"><strong class="money">{{ inr(item.purchaseAmount) }}</strong><small>What this subscriber pays</small></div></article>
      </div>
      <div class="layout-col" data-layout-col="main">
      @if (issued) {
        <section class="card" data-layout-box="issued">
          <h2>Copy this key now</h2>
          <p class="muted">Control stores only a hash. This is the only time the full key is shown.</p>
          <div class="key-box">{{ issued }}</div>
          <button type="button" class="btn" (click)="copy()">Copy key</button>
        </section>
      }
      @if (item.opensOutlets) {
        <section class="card" data-layout-box="outlets">
          <h2><i class="bi bi-diagram-3"></i> Outlets</h2>
          @if (item.outletMain) {
            <p>This subscription adds one outlet to the <a [routerLink]="['/subscriptions', item.outletMain.id]">{{ item.outletMain.planName }} main subscription</a> ({{ item.outletMain.startsAt }} to {{ item.outletMain.endsAt }}).</p>
            <p class="muted">It has no key of its own. The main install picks it up at its next check-in, and this outlet stops working when this term ends.</p>
          } @else {
            <p><strong>{{ item.outletsAllowed }}</strong> {{ item.outletsAllowed === 1 ? 'outlet' : 'outlets' }} allowed on this install right now: this subscription plus {{ item.outlets.length }} added as {{ item.outlets.length === 1 ? 'an outlet' : 'outlets' }}.</p>
            @for (outlet of item.outlets; track outlet.id) {
              <p class="outlet-line"><a [routerLink]="['/subscriptions', outlet.id]">{{ outlet.planName }}</a> <span [class]="pill(outlet.effectiveStatus)">{{ outlet.effectiveStatus }}</span> <span class="muted">{{ outlet.startsAt }} to {{ outlet.endsAt }}</span></p>
            }
            @if (!item.outlets.length) { <p class="muted">To sell another outlet, add a subscription for this product on the customer page and choose "One more outlet" for it.</p> }
          }
        </section>
      }
      @if (can('subscriptions.manage')) {
      <form class="card form-card" data-layout-box="terms" #termsForm="ngForm" (ngSubmit)="save(termsForm)">
        <div class="field">
          <label for="plan">Plan</label>
          <select id="plan" name="plan" [(ngModel)]="form.planCode">
            @for (plan of plans; track plan.code) { <option [value]="plan.code">{{ plan.name }}</option> }
          </select>
        </div>
        <div class="field">
          <label for="status">Staff status</label>
          <select id="status" name="status" [(ngModel)]="form.status">
            <option value="trialing">Trialing</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div class="field"><label for="start">Starts</label><input id="start" name="start" type="date" [(ngModel)]="form.startsAt" required></div>
        <div class="field"><label for="end">Ends</label><input id="end" name="end" type="date" [(ngModel)]="form.endsAt" required></div>
        <div class="field"><label for="grace">Grace days</label><input id="grace" name="grace" type="number" min="0" max="90" [(ngModel)]="form.graceDays" required></div>
        <div class="field"><label for="seats">Seat limit</label><input id="seats" name="seats" [(ngModel)]="form.seatLimit" placeholder="Plan default"></div>
        <div class="field"><label for="bought">Seats purchased</label><input id="bought" name="bought" type="number" min="1" [(ngModel)]="form.seatsPurchased" required></div>
        @if (item.opensOutlets && (item.mainChoices.length || form.outletOf) && !item.outlets.length) {
        <div class="field wide">
          <label for="outlet-of">Use</label>
          <select id="outlet-of" name="outletOf" [(ngModel)]="form.outletOf">
            <option value="">Main subscription with its own key</option>
            @for (main of item.mainChoices; track main.id) {
              <option [value]="main.id">One more outlet on {{ main.label }}</option>
            }
          </select>
        </div>
        }
        @if (can('offers.view')) {
        <div class="field">
          <label for="offer">Offer</label>
          <select id="offer" name="offer" [(ngModel)]="form.offerCode">
            <option value="">No offer</option>
            @for (offer of matchingOffers; track offer.id) {
              <option [value]="offer.code">{{ offer.name }}</option>
            }
          </select>
        </div>
        }
        @if (can('coupons.view')) {
        <div class="field">
          <label for="coupon">Coupon code</label>
          <select id="coupon" name="coupon" [(ngModel)]="form.couponCode">
            <option value="">No coupon</option>
            @for (coupon of matchingCoupons; track coupon.id) {
              <option [value]="coupon.code">{{ coupon.name }} · {{ coupon.code }}</option>
            }
          </select>
        </div>
        }
        <div class="field"><label for="max">Install limit</label><input id="max" name="max" type="number" min="1" max="100" [(ngModel)]="form.maxInstances" required></div>
        <div class="field wide">
          <label for="policy">Binding policy</label>
          <select id="policy" name="policy" [(ngModel)]="form.hostPolicy">
            <option value="inherit">Use the product default</option>
            <option value="bind_first">Lock to the first host or device</option>
            <option value="allowlist">Allow list only</option>
            <option value="any">Any host or device</option>
          </select>
        </div>
        <div class="field full"><label for="bindings">Allowed hosts or devices, one per line</label><textarea id="bindings" name="bindings" [(ngModel)]="form.bindings"></textarea></div>
        <div class="field"><label for="pin">Pinned version</label><input id="pin" name="pin" [(ngModel)]="form.versionPin"></div>
        <div class="field"><label for="min">Minimum version</label><input id="min" name="min" [(ngModel)]="form.minVersion"></div>
        <div class="field"><label for="channel">Channel</label><input id="channel" name="channel" [(ngModel)]="form.channel" required minlength="2" pattern="[A-Za-z][A-Za-z0-9-]{0,31}"></div>
        <label class="check"><input class="switch" type="checkbox" name="enforce" [(ngModel)]="form.enforceSeatLimit"> Enforce the seat limit</label>
        <label class="check"><input class="switch" type="checkbox" name="block" [(ngModel)]="form.blockOutdated"> Block until the required version is installed</label>
        <div class="field full"><label for="notes">Notes</label><textarea id="notes" name="notes" [(ngModel)]="form.notes"></textarea></div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="reset()">Clear bound install</button>
          <button class="btn" type="submit"><i class="bi bi-check2"></i> Save subscription</button>
        </div>
      </form>
      }
      @if (item.lastReject) {
        <p class="muted">Last rejected binding: {{ item.lastReject }} · {{ item.lastRejectAt }}</p>
      }
      @if (can('licenses.manage') && !item.outletMain) {
      <section class="card form-card" data-layout-box="issue">
        <h2>Issue a key</h2>
        <div class="field wide"><label for="label">Label</label><input id="label" name="label" [(ngModel)]="keyLabel"></div>
        <div class="form-actions"><button type="button" class="btn" (click)="issue()"><i class="bi bi-key"></i> Issue key</button></div>
      </section>
      }
      <app-data-table data-layout-box="keys" tableId="subscription-keys" title="License keys" empty="No key yet." [rows]="item.keys" [columns]="keyColumns">
        <ng-template appRowActions let-key>
          @if (can('licenses.manage') && key.status === 'active') {
            <button type="button" class="btn btn-sm btn-delete" title="Revoke" (click)="revoke(key.id)"><i class="bi bi-slash-circle"></i><span class="visually-hidden">Revoke</span></button>
          }
        </ng-template>
      </app-data-table>
      <app-data-table data-layout-box="installs" tableId="subscription-installs" title="Installs that have checked in" empty="No install has checked in." [rows]="item.instances" [columns]="installColumns" />
      </div>
      </div>
      </div>
    }
  `,
})
export class SubscriptionComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  item: SubscriptionDetail | null = null;
  plans: Plan[] = [];
  offers: Offer[] = [];
  coupons: Coupon[] = [];
  readonly inr = inr;
  issued = '';
  keyLabel = 'Production';
  error = '';
  readonly pill = pill;
  readonly keyColumns: DataColumn<LicenseKeyRow>[] = [
    { key: 'hint', label: 'Key', text: (row) => row.hint, sub: (row) => row.label },
    { key: 'status', label: 'Status', text: (row) => row.status, pill: true },
    { key: 'label', label: 'Label', text: (row) => row.label || '—', optional: true },
    { key: 'issued', label: 'Issued', text: (row) => when(row.createdAt), optional: true },
    { key: 'revoked', label: 'Revoked', text: (row) => when(row.revokedAt), optional: true },
  ];
  readonly installColumns: DataColumn<InstanceRow>[] = [
    { key: 'instance', label: 'Instance', text: (row) => row.instanceId },
    { key: 'binding', label: 'Binding', text: (row) => row.binding },
    { key: 'runtime', label: 'Runtime', text: (row) => row.runtime },
    { key: 'version', label: 'Version', text: (row) => row.version },
    { key: 'verdict', label: 'Verdict', text: (row) => row.lastVerdict },
    { key: 'seen', label: 'Last active', text: (row) => when(row.lastSeenAt) },
    { key: 'seats', label: 'Seats in use', text: (row) => String(row.usage?.seats ?? '—'), optional: true },
  ];
  form = {
    planCode: '',
    status: 'active',
    startsAt: '',
    endsAt: '',
    graceDays: 14,
    seatLimit: '',
    seatsPurchased: 1,
    offerCode: '',
    couponCode: '',
    maxInstances: 1,
    hostPolicy: 'inherit',
    bindings: '',
    versionPin: '',
    minVersion: '',
    channel: 'stable',
    enforceSeatLimit: false,
    blockOutdated: false,
    notes: '',
    outletOf: '',
  };

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }

  ngOnInit(): void {
    if (this.can('offers.view')) this.api.offers().subscribe({ next: (res) => (this.offers = res.items) });
    if (this.can('coupons.view')) this.api.coupons().subscribe({ next: (res) => (this.coupons = res.items) });
    this.reload();
  }

  get matchingOffers(): Offer[] {
    const today = new Date().toISOString().slice(0, 10);
    const code = this.item?.productCode || '';
    return this.offers.filter((offer) => (offer.status === 'released' && offer.startsAt <= today && offer.endsAt >= today && (offer.scope === 'all' || offer.productCode === code)) || offer.code === this.form.offerCode);
  }

  get matchingCoupons(): Coupon[] {
    const today = new Date().toISOString().slice(0, 10);
    const code = this.item?.productCode || '';
    return this.coupons.filter((coupon) => (coupon.status === 'released' && coupon.startsAt <= today && coupon.endsAt >= today && (coupon.scope === 'all' || coupon.productCode === code)) || coupon.code === this.form.couponCode);
  }

  reload(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.api.subscription(id).subscribe({
      next: (res) => {
        this.item = res.subscription;
        this.form = {
          planCode: res.subscription.planCode,
          status: res.subscription.status,
          startsAt: String(res.subscription.startsAt).slice(0, 10),
          endsAt: String(res.subscription.endsAt).slice(0, 10),
          graceDays: res.subscription.graceDays,
          seatLimit: res.subscription.seatLimit === null ? '' : String(res.subscription.seatLimit),
          seatsPurchased: res.subscription.seatsPurchased || 1,
          offerCode: res.subscription.offerCode || '',
          couponCode: res.subscription.couponCode || '',
          maxInstances: res.subscription.maxInstances,
          hostPolicy: res.subscription.hostPolicy,
          bindings: res.subscription.bindings.join('\n'),
          versionPin: res.subscription.versionPin,
          minVersion: res.subscription.minVersion,
          channel: res.subscription.channel,
          enforceSeatLimit: res.subscription.enforceSeatLimit,
          blockOutdated: res.subscription.blockOutdated,
          notes: res.subscription.notes,
          outletOf: res.subscription.outletOf || '',
        };
        this.api.product(res.subscription.productCode).subscribe({
          next: (product) => (this.plans = product.product.plans),
        });
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  save(form: NgForm): void {
    if (!this.item) return;
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    if (this.form.endsAt < this.form.startsAt) {
      this.error = 'The end date must be on or after the start date.';
      return;
    }
    this.api.updateSubscription(this.item.id, {
      ...this.form,
      seatLimit: this.form.seatLimit === '' ? null : Number(this.form.seatLimit),
      bindings: this.form.bindings,
    }).subscribe({
      next: () => {
        this.notice.success('Subscription saved.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  issue(): void {
    if (!this.item) return;
    this.api.issueKey(this.item.id, this.keyLabel).subscribe({
      next: (res) => {
        this.issued = res.licenseKey;
        this.notice.success('Key issued. Copy it now. It is not shown again.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  async revoke(keyId: string): Promise<void> {
    if (!this.item || !this.can('licenses.manage')) return;
    const yes = await this.notice.confirm('Revoke this key?', 'The install that uses it will be refused. This cannot be undone.', 'Revoke');
    if (!yes) return;
    this.api.revokeKey(this.item.id, keyId).subscribe({
      next: () => {
        this.notice.success('Key revoked.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  reset(): void {
    if (!this.item) return;
    this.api.resetBinding(this.item.id).subscribe({
      next: () => {
        this.notice.success('Binding reset.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  copy(): void {
    void navigator.clipboard.writeText(this.issued).then(() => this.notice.success('Key copied.'));
  }
}
