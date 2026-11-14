import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { Coupon, Customer, Offer, Plan, ProductCard, SubscriptionBrief, apiError, can as allow, inr, pill, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { LayoutDirective } from '../shared/layout.directive';
import { NoticeService } from '../shared/notice.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-customer',
  imports: [FormsModule, RouterLink, DataTableComponent, RowActionsDirective, LayoutDirective, PageGuideComponent],
  template: `
    @if (customer) {
      <header class="top">
        <div>
          <p class="kicker">Customer</p>
          <h1>{{ customer.name }}</h1>
          <app-page-guide />
          <div class="tag-row customer-head-tags">
            <span class="pill" [class.ok]="customer.status === 'active'" [class.bad]="customer.status !== 'active'">{{ customer.status }}</span>
            @if (customer.blocked) { <span class="pill bad"><i class="bi bi-slash-circle"></i> Blocked</span> }
            @for (label of customer.labels; track label) {
              <span [class]="'tag-chip is-on tone-' + tone(label)">{{ labelName(label) }}</span>
            }
          </div>
        </div>
        <div class="top-actions">
          @if (can('customers.manage') && !editing) {
            <button type="button" class="btn" (click)="startEdit()"><i class="bi bi-pencil-square"></i> Edit</button>
          }
          <a class="btn btn-ghost" routerLink="/customers"><i class="bi bi-arrow-left"></i> All customers</a>
        </div>
      </header>
      <div class="page-stack">
      @if (error) { <div class="banner bad">{{ error }}</div> }
      @if (customer.blocked) {
        <div class="banner bad"><strong>This customer is blocked.</strong> New subscriptions stay closed. {{ customer.blockReason }}</div>
      }
      <div class="layout-board" appLayout="customer">
        <div class="layout-col" data-layout-col="main">
        <section class="card" data-layout-box="details">
          @if (!editing) {
            <h2>Details</h2>
            <div class="fact-grid">
              <div class="fact"><span>Company</span><strong>{{ customer.name }}</strong></div>
              <div class="fact"><span>Contact</span><strong>{{ customer.contactName || '—' }}</strong></div>
              <div class="fact"><span>Email</span><strong>{{ customer.contactEmail || '—' }}</strong></div>
              <div class="fact"><span>Phone</span><strong>{{ customer.phone || '—' }}</strong></div>
              <div class="fact"><span>Status</span><strong>{{ customer.status }}</strong></div>
              <div class="fact"><span>Added</span><strong>{{ when(customer.createdAt) }}</strong></div>
              <div class="fact span-all"><span>Notes</span><strong>{{ customer.notes || 'No notes yet.' }}</strong></div>
            </div>
          } @else {
            <form class="form-card thirds" #customerForm="ngForm" (ngSubmit)="save(customerForm)">
              <h2>Edit customer</h2>
              <div class="field"><label for="name">Company</label><input id="name" name="company" [(ngModel)]="draft.name" required minlength="2"></div>
              <div class="field"><label for="contact">Contact</label><input id="contact" name="contact" [(ngModel)]="draft.contactName"></div>
              <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" [(ngModel)]="draft.contactEmail" placeholder="asha@company.com" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"></div>
              <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" [(ngModel)]="draft.phone" placeholder="+91 98000 00000" pattern="\\+?[0-9][0-9 \\-().]{5,22}"></div>
              <div class="field">
                <label for="status">Status</label>
                <select id="status" name="status" [(ngModel)]="draft.status">
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div class="field full"><label for="notes">Notes</label><textarea id="notes" name="notes" [(ngModel)]="draft.notes"></textarea></div>
              <div class="form-actions">
                <button class="btn" type="submit"><i class="bi bi-check2"></i> Save customer</button>
                <button class="btn btn-ghost" type="button" (click)="editing = false">Cancel</button>
              </div>
            </form>
          }
        </section>
        </div>
        <div class="layout-col" data-layout-col="side">
          <section class="card" data-layout-box="labels">
            <h2>Labels</h2>
            <p class="muted">These tags highlight the customer on this page and in the list.</p>
            <div class="tag-row">
              @for (item of labelOptions; track item.id) {
                <button type="button" [class]="'tag-chip tone-' + item.tone + (has(customer.labels, item.id) ? ' is-on' : '')" [disabled]="!can('customers.manage')" (click)="toggleList('labels', customer.labels, item.id)">{{ item.name }}</button>
              }
            </div>
          </section>
          <section class="card" data-layout-box="alerts">
            <h2>Alerts</h2>
            <p class="muted">Turn on the reminders the team should see for this account.</p>
            @for (item of alertOptions; track item.id) {
              <label class="alert-option">
                <input class="switch" type="checkbox" [checked]="has(customer.alerts, item.id)" [disabled]="!can('customers.manage')" (change)="toggleList('alerts', customer.alerts, item.id)">
                <span><strong>{{ item.name }}</strong><small>{{ item.hint }}</small></span>
              </label>
            }
          </section>
          @if (can('customers.manage')) {
            <section class="card" data-layout-box="block">
              <h2>{{ customer.blocked ? 'Blocked' : 'Block' }}</h2>
              <p class="muted">{{ customer.blocked ? 'Unblock when this customer can buy again.' : 'A blocked customer cannot be given a new subscription.' }}</p>
              @if (!customer.blocked) {
                <div class="field"><label for="block-reason">Reason</label><input id="block-reason" name="blockReason" [(ngModel)]="blockReason" placeholder="Payment dispute, abuse, or a hold"></div>
              }
              <button type="button" class="btn" [class.btn-ghost]="customer.blocked" (click)="toggleBlock()"><i class="bi" [class.bi-slash-circle]="!customer.blocked" [class.bi-unlock]="customer.blocked"></i> {{ customer.blocked ? 'Unblock' : 'Block customer' }}</button>
            </section>
          }
        </div>
        <div class="layout-col layout-col-wide" data-layout-col="wide">
      <section class="card" data-layout-box="behaviour">
        <h2>Behaviour</h2>
        <p class="muted">Notes about how this customer deals with the team. They stay on the account.</p>
        @if (!customer.behaviour.length) { <p class="muted">No behaviour notes yet.</p> }
        @for (item of customer.behaviour; track item.id) {
          <div [class]="'behaviour-note is-' + item.kind">
            <div>
              <strong>{{ behaviourName(item.kind) }}</strong>
              <p>{{ item.note }}</p>
              <small>{{ item.by || 'Team' }} · {{ when(item.at) }}</small>
            </div>
            @if (can('customers.manage')) {
              <button type="button" class="btn btn-sm btn-delete" (click)="removeBehaviour(item.id)" title="Delete"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
            }
          </div>
        }
        @if (can('customers.manage')) {
          <form class="behaviour-form" (ngSubmit)="addBehaviour()">
            <div class="field">
              <label for="behaviour-kind">Kind</label>
              <select id="behaviour-kind" name="behaviourKind" [(ngModel)]="behaviourKind">
                @for (item of behaviourOptions; track item.id) { <option [value]="item.id">{{ item.name }}</option> }
              </select>
            </div>
            <div class="field wide">
              <label for="behaviour-note">Note</label>
              <input id="behaviour-note" name="behaviourNote" [(ngModel)]="behaviourNote" placeholder="What should the next person know?">
            </div>
            <button class="btn btn-sm" type="submit"><i class="bi bi-plus-lg"></i> Add note</button>
          </form>
        }
      </section>
      @if (can('subscriptions.manage') && customer.blocked) {
        <section class="card" data-layout-box="subscribe"><h2>Add a product subscription</h2><p class="muted">Unblock this customer before opening a subscription.</p></section>
      }
      @if (can('subscriptions.manage') && !customer.blocked) {
      <section class="card form-card" data-layout-box="subscribe">
        <h2>Add a product subscription</h2>
        <div class="field wide">
          <label for="product">Product</label>
          <select id="product" name="product" [(ngModel)]="productCode" (ngModelChange)="loadPlans()">
            @for (product of products; track product.code) {
              <option [value]="product.code">{{ product.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="plan">Plan</label>
          <select id="plan" name="plan" [(ngModel)]="planCode">
            @for (plan of plans; track plan.code) {
              <option [value]="plan.code">{{ plan.name }} · {{ priceLabel(plan) }}</option>
            }
          </select>
        </div>
        <div class="field"><label for="bought">Seats purchased</label><input id="bought" name="bought" type="number" min="1" [(ngModel)]="seatsPurchased"></div>
        @if (outletMains().length) {
        <div class="field wide">
          <label for="outlet-of">Use</label>
          <select id="outlet-of" name="outletOf" [(ngModel)]="outletOf">
            <option value="">A new install with its own key</option>
            @for (main of outletMains(); track main.id) {
              <option [value]="main.id">One more outlet on {{ main.planName }} · {{ main.startsAt }} to {{ main.endsAt }}</option>
            }
          </select>
          <small class="muted">An outlet is a branch such as Delhi Office. It runs inside the main install on the main key.</small>
        </div>
        }
        @if (can('offers.view')) {
        <div class="field">
          <label for="offer">Offer</label>
          <select id="offer" name="offer" [(ngModel)]="offerCode">
            <option value="">No offer</option>
            @for (offer of matchingOffers; track offer.id) {
              <option [value]="offer.code">{{ offer.name }} · {{ offer.kind === 'percent' ? offer.value + '% off' : inr(offer.value) + ' off' }}</option>
            }
          </select>
        </div>
        }
        @if (can('coupons.view')) {
        <div class="field">
          <label for="coupon">Coupon code</label>
          <select id="coupon" name="coupon" [(ngModel)]="couponCode">
            <option value="">No coupon</option>
            @for (coupon of matchingCoupons; track coupon.id) {
              <option [value]="coupon.code">{{ coupon.name }} · {{ coupon.kind === 'percent' ? coupon.value + '% off' : inr(coupon.value) + ' off' }}</option>
            }
          </select>
        </div>
        }
        <div class="form-actions"><button type="button" class="btn" (click)="addSubscription()"><i class="bi bi-plus-lg"></i> Add subscription</button></div>
      </section>
      }
      <app-data-table data-layout-box="subscriptions" tableId="customer-subscriptions" title="Subscriptions" empty="No subscription yet." [rows]="customer.subscriptions || []" [columns]="subscriptionColumns">
        <ng-template appRowActions let-row>
          <a class="btn btn-sm btn-view" [routerLink]="['/subscriptions', row.id]" title="View"><i class="bi bi-eye"></i><span class="visually-hidden">View</span></a>
          @if (can('subscriptions.manage')) {
            <a class="btn btn-sm btn-edit" [routerLink]="['/subscriptions', row.id]" title="Edit"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></a>
          }
        </ng-template>
      </app-data-table>
        </div>
      </div>
      </div>
    }
  `,
})
export class CustomerComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  customer: Customer | null = null;
  editing = false;
  draft = { name: '', contactName: '', contactEmail: '', phone: '', notes: '', status: 'active' };
  behaviourKind = 'careful';
  behaviourNote = '';
  blockReason = '';
  private openedEdit = false;
  readonly when = when;
  readonly labelOptions = [
    { id: 'vip', name: 'VIP', tone: 'gold' },
    { id: 'priority', name: 'Priority', tone: 'navy' },
    { id: 'trial', name: 'Trial', tone: 'warn' },
    { id: 'at-risk', name: 'At risk', tone: 'bad' },
    { id: 'key-account', name: 'Key account', tone: 'gold' },
    { id: 'new', name: 'New', tone: 'ok' },
  ];
  readonly alertOptions = [
    { id: 'renewal', name: 'Renewal reminder', hint: 'Flag this account before the term ends.' },
    { id: 'payment', name: 'Payment follow-up', hint: 'Money is still due.' },
    { id: 'licence', name: 'Licence check', hint: 'Review the keys and installs.' },
    { id: 'call', name: 'Needs a call', hint: 'Someone should speak to this customer.' },
    { id: 'hold', name: 'Do not renew', hint: 'Leave the subscription to end.' },
  ];
  readonly behaviourOptions = [
    { id: 'positive', name: 'Positive' },
    { id: 'careful', name: 'Handle with care' },
    { id: 'bad', name: 'Bad behaviour' },
    { id: 'stop', name: 'Do not contact' },
  ];
  products: ProductCard[] = [];
  plans: Plan[] = [];
  productCode = '';
  planCode = '';
  seatsPurchased = 1;
  outletOf = '';
  offerCode = '';
  offers: Offer[] = [];
  coupons: Coupon[] = [];
  couponCode = '';
  readonly inr = inr;
  error = '';
  readonly pill = pill;
  readonly subscriptionColumns: DataColumn<SubscriptionBrief>[] = [
    { key: 'product', label: 'Product', text: (row) => row.productName, sub: (row) => row.planName + (row.outletOf ? ' · Outlet of the main subscription' : ''), link: (row) => '/subscriptions/' + row.id },
    { key: 'status', label: 'Status', text: (row) => row.effectiveStatus, pill: true },
    { key: 'term', label: 'Term', text: (row) => row.startsAt + ' → ' + row.endsAt },
    { key: 'purchase', label: 'Purchase', text: (row) => inr(row.purchaseAmount) },
    { key: 'seats', label: 'Seats', text: (row) => String(row.seatsPurchased || 1), optional: true },
    { key: 'offer', label: 'Offer', text: (row) => row.offerCode || '—', optional: true },
    { key: 'coupon', label: 'Coupon', text: (row) => row.couponCode || '—', optional: true },
    { key: 'list', label: 'List cost', text: (row) => inr(row.listAmount), optional: true },
    { key: 'discount', label: 'Discount', text: (row) => inr(row.discountAmount), optional: true },
    { key: 'starts', label: 'Starts', text: (row) => row.startsAt, optional: true },
    { key: 'ends', label: 'Ends', text: (row) => row.endsAt, optional: true },
    { key: 'stored', label: 'Account status', text: (row) => row.status, pill: true, optional: true },
    { key: 'grace', label: 'Grace days', text: (row) => String(row.graceDays ?? ''), optional: true },
    { key: 'channel', label: 'Channel', text: (row) => row.channel || '', optional: true },
    { key: 'binding', label: 'Binding', text: (row) => row.hostPolicy || '', optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }

  ngOnInit(): void {
    if (this.can('offers.view')) this.api.offers().subscribe({ next: (res) => (this.offers = res.items) });
    if (this.can('coupons.view')) this.api.coupons().subscribe({ next: (res) => (this.coupons = res.items) });
    this.api.products().subscribe({
      next: (res) => {
        this.products = res.items;
        this.productCode = res.items[0]?.code || '';
        this.loadPlans();
      },
    });
    this.reload();
  }

  reload(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.api.customer(id).subscribe({
      next: (res) => {
        this.adopt(res.customer);
        this.blockReason = res.customer.blockReason || '';
        if (!this.openedEdit && this.route.snapshot.queryParamMap.get('edit') === '1' && this.can('customers.manage')) {
          this.openedEdit = true;
          this.startEdit();
        }
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  startEdit(): void {
    if (!this.customer) return;
    this.draft = {
      name: this.customer.name,
      contactName: this.customer.contactName,
      contactEmail: this.customer.contactEmail,
      phone: this.customer.phone,
      notes: this.customer.notes,
      status: this.customer.status,
    };
    this.editing = true;
  }

  has(list: string[] | undefined, id: string): boolean {
    return (list || []).includes(id);
  }

  tone(id: string): string {
    return this.labelOptions.find((item) => item.id === id)?.tone || 'navy';
  }

  labelName(id: string): string {
    return this.labelOptions.find((item) => item.id === id)?.name || id;
  }

  behaviourName(id: string): string {
    return this.behaviourOptions.find((item) => item.id === id)?.name || id;
  }

  toggleList(field: 'labels' | 'alerts', current: string[] | undefined, id: string): void {
    const next = new Set(current || []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.patch({ [field]: [...next] });
  }

  async toggleBlock(): Promise<void> {
    if (!this.customer) return;
    if (this.customer.blocked) {
      const yes = await this.notice.confirm('Unblock this customer?', 'They can be given a new subscription again.', 'Unblock');
      if (!yes) return;
      this.patch({ blocked: false, blockReason: '' });
      return;
    }
    const yes = await this.notice.confirm('Block this customer?', 'New subscriptions stay closed until someone unblocks them.', 'Block');
    if (!yes) return;
    this.patch({ blocked: true, blockReason: this.blockReason.trim() });
  }

  addBehaviour(): void {
    const note = this.behaviourNote.trim();
    if (note.length < 2) {
      this.error = 'Write a short note about this customer.';
      return;
    }
    this.error = '';
    this.patch({ behaviourNote: { kind: this.behaviourKind, note } }, () => (this.behaviourNote = ''));
  }

  async removeBehaviour(id: string): Promise<void> {
    const yes = await this.notice.confirm('Delete this behaviour note?', 'The note is removed from this customer.', 'Delete');
    if (!yes) return;
    this.patch({ behaviourRemove: id });
  }

  private adopt(customer: Customer): void {
    customer.labels = customer.labels || [];
    customer.alerts = customer.alerts || [];
    customer.behaviour = customer.behaviour || [];
    customer.blocked = !!customer.blocked;
    customer.blockReason = customer.blockReason || '';
    this.customer = customer;
  }

  private patch(body: Record<string, unknown>, done?: () => void): void {
    if (!this.customer) return;
    this.api.updateCustomer(this.customer.id, body).subscribe({
      next: (res) => {
        this.adopt({ ...res.customer, subscriptions: this.customer?.subscriptions });
        this.blockReason = res.customer.blockReason || '';
        done?.();
        this.notice.success('Customer updated.');
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  loadPlans(): void {
    if (!this.productCode) return;
    this.api.product(this.productCode).subscribe({
      next: (res) => {
        this.plans = res.product.plans;
        this.planCode = this.plans[0]?.code || '';
      },
    });
  }

  save(form: NgForm): void {
    if (!this.customer) return;
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    this.api.updateCustomer(this.customer.id, this.draft).subscribe({
      next: (res) => {
        this.adopt({ ...res.customer, subscriptions: this.customer?.subscriptions });
        this.editing = false;
        this.notice.success('Customer saved.');
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  addSubscription(): void {
    if (!this.customer) return;
    this.api.createSubscription({
      customerId: this.customer.id,
      productCode: this.productCode,
      planCode: this.planCode,
      seatsPurchased: this.seatsPurchased,
      offerCode: this.offerCode,
      couponCode: this.couponCode,
      outletOf: this.outletMains().some((main) => main.id === this.outletOf) ? this.outletOf : '',
    }).subscribe({
      next: () => {
        this.notice.success(this.outletOf ? 'Outlet subscription added. The main install picks it up at its next check-in.' : 'Subscription added.');
        this.outletOf = '';
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  /** Main subscriptions of the chosen product that a new subscription could add an outlet to. */
  outletMains(): SubscriptionBrief[] {
    if (!this.products.find((item) => item.code === this.productCode)?.opensOutlets) return [];
    return (this.customer?.subscriptions || []).filter((row) => row.productCode === this.productCode && !row.outletOf);
  }

  get matchingOffers(): Offer[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.offers.filter((offer) => offer.status === 'released' && offer.startsAt <= today && offer.endsAt >= today && (offer.scope === 'all' || offer.productCode === this.productCode));
  }

  get matchingCoupons(): Coupon[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.coupons.filter((coupon) => coupon.status === 'released' && coupon.startsAt <= today && coupon.endsAt >= today && (coupon.scope === 'all' || coupon.productCode === this.productCode));
  }

  priceLabel(plan: Plan): string {
    if (!plan.priceAmount) return 'No list price';
    const basis = plan.priceBasis === 'flat' ? 'flat' : 'per ' + (this.products.find((item) => item.code === this.productCode)?.seatUnit || 'seat');
    return inr(plan.priceAmount) + ' ' + basis + ' / ' + plan.billingPeriod;
  }
}
