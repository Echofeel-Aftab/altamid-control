import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { ApiService, SessionService } from '../core/api.service';
import { Coupon, Offer, ProductCard, apiError, can as allow, inr, pill } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { NoticeService } from '../shared/notice.component';
import { LayoutDirective } from '../shared/layout.directive';
import { SheetComponent } from '../shared/sheet.component';
import { PageGuideComponent } from '../shared/page-guide.component';

interface DealDraft {
  id: string;
  name: string;
  code: string;
  scope: 'all' | 'product';
  productCode: string;
  kind: 'percent' | 'amount';
  value: number;
  startsAt: string;
  endsAt: string;
  note: string;
  release: boolean;
  status: string;
}

@Component({
  selector: 'app-coupons',
  imports: [FormsModule, DataTableComponent, RowActionsDirective, SheetComponent, LayoutDirective, PageGuideComponent],
  template: `
    <div class="page-stack">
      <header class="top">
        <div>
          <p class="kicker">Subscribers</p>
          <h1>Coupons</h1>
          <app-page-guide />
          <p class="muted">Offers reduce a purchase in Control. Coupon codes can be picked for a customer now, and a payment gateway can use the same code later.</p>
        </div>
      </header>
      @if (error && !offerOpen && !couponOpen) { <div class="banner bad">{{ error }}</div> }

      <div class="layout-board layout-stack" appLayout="coupons">
        <div class="layout-col" data-layout-col="main">
      @if (can(session.staff, 'offers.view')) {
      <section class="card" data-layout-box="offers">
        <div class="card-head">
          <h2><i class="bi bi-tag"></i> Offers</h2>
          @if (can(session.staff, 'offers.create')) {
            <button type="button" class="btn btn-sm" (click)="startOffer()"><i class="bi bi-plus-lg"></i> New offer</button>
          }
        </div>
        <p class="muted">A running offer can be picked when a subscription is opened or changed. A draft stays hidden from that list until it is released.</p>
        <app-data-table tableId="offers" empty="No offers yet." [rows]="offers" [columns]="offerColumns">
          <ng-template appRowActions let-offer>
            @if (can(session.staff, 'offers.update') && offer.status !== 'ended') {
              <button type="button" class="btn btn-sm btn-edit" title="Edit" (click)="editOffer(offer)"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></button>
            }
            @if (can(session.staff, 'offers.update') && offer.status === 'draft') {
              <button type="button" class="btn btn-sm btn-edit" title="Release" (click)="releaseOffer(offer)"><i class="bi bi-send"></i><span class="visually-hidden">Release</span></button>
            }
            @if (can(session.staff, 'offers.delete') && offer.status !== 'ended') {
              <button type="button" class="btn btn-sm btn-delete" title="Delete" (click)="removeOffer(offer)"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
            }
          </ng-template>
        </app-data-table>
      </section>
      <app-sheet [open]="offerOpen" [title]="offerDraft.id ? 'Edit offer' : 'New offer'" (closed)="offerOpen = false">
        <form class="form-card" #offerForm="ngForm" (ngSubmit)="saveOffer(offerForm)">
          @if (error) { <div class="banner bad">{{ error }}</div> }
          <div class="field"><label for="offer-name">Name</label><input id="offer-name" name="offerName" [(ngModel)]="offerDraft.name" placeholder="Launch offer" required minlength="2"></div>
          <div class="field"><label for="offer-code">Code</label><input id="offer-code" name="offerCode" [(ngModel)]="offerDraft.code" [disabled]="!!offerDraft.id" [required]="!offerDraft.id" placeholder="diwali-20" pattern="[A-Za-z][A-Za-z0-9-]{1,31}"></div>
          <div class="field">
            <label for="offer-scope">Covers</label>
            <select id="offer-scope" name="offerScope" [(ngModel)]="offerDraft.scope" [disabled]="offerDraft.status === 'released'">
              <option value="all">All products</option>
              <option value="product">One product</option>
            </select>
          </div>
          @if (offerDraft.scope === 'product') {
            <div class="field">
              <label for="offer-product"><i class="bi bi-box-seam"></i> Product</label>
              <select id="offer-product" name="offerProduct" [(ngModel)]="offerDraft.productCode" [disabled]="offerDraft.status === 'released'" required>
                <option value="">Choose a product</option>
                @for (product of products; track product.code) { <option [value]="product.code">{{ product.name }}</option> }
              </select>
            </div>
          }
          <div class="field">
            <label for="offer-kind">Discount</label>
            <select id="offer-kind" name="offerKind" [(ngModel)]="offerDraft.kind" [disabled]="offerDraft.status === 'released'">
              <option value="percent">Percent off</option>
              <option value="amount">Rupees off</option>
            </select>
          </div>
          <div class="field">
            <label for="offer-value"><i class="bi" [class.bi-percent]="offerDraft.kind === 'percent'" [class.bi-currency-rupee]="offerDraft.kind === 'amount'"></i> {{ offerDraft.kind === 'percent' ? 'Percent off' : 'Rupees off' }}</label>
            <input id="offer-value" name="offerValue" type="number" min="0.01" [max]="offerDraft.kind === 'percent' ? 100 : 10000000" step="0.01" [(ngModel)]="offerDraft.value" [disabled]="offerDraft.status === 'released'" [placeholder]="offerDraft.kind === 'percent' ? '10' : '500'" required>
          </div>
          <div class="field"><label for="offer-start">Starts</label><input id="offer-start" name="offerStart" type="date" [(ngModel)]="offerDraft.startsAt" required></div>
          <div class="field"><label for="offer-end">Ends</label><input id="offer-end" name="offerEnd" type="date" [(ngModel)]="offerDraft.endsAt" required></div>
          <div class="field full"><label for="offer-note">Note</label><input id="offer-note" name="offerNote" [(ngModel)]="offerDraft.note" placeholder="Who this offer is for"></div>
          @if (!offerDraft.id) {
            <label class="check"><input class="switch" type="checkbox" name="offerRelease" [(ngModel)]="offerDraft.release"> Release now, so it can be picked for a customer</label>
          }
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="offerOpen = false">Cancel</button>
            <button class="btn" type="submit">Save offer</button>
          </div>
        </form>
      </app-sheet>
      }

      @if (can(session.staff, 'coupons.view')) {
      <section class="card" data-layout-box="codes">
        <div class="card-head">
          <h2><i class="bi bi-ticket-perforated"></i> Coupon codes</h2>
          @if (can(session.staff, 'coupons.create')) {
            <button type="button" class="btn btn-sm" (click)="startCoupon()"><i class="bi bi-plus-lg"></i> New coupon</button>
          }
        </div>
        <p class="muted">Release a code when the team should be able to give it to a customer. The payment gateway can redeem that same code later. It does not change the purchase amount in Control.</p>
        <app-data-table tableId="coupon-codes" empty="No coupon codes yet." [rows]="coupons" [columns]="couponColumns">
          <ng-template appRowActions let-coupon>
            @if (can(session.staff, 'coupons.update') && coupon.status !== 'ended') {
              <button type="button" class="btn btn-sm btn-edit" title="Edit" (click)="editCoupon(coupon)"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></button>
            }
            @if (can(session.staff, 'coupons.update') && coupon.status === 'draft') {
              <button type="button" class="btn btn-sm btn-edit" title="Release" (click)="releaseCoupon(coupon)"><i class="bi bi-send"></i><span class="visually-hidden">Release</span></button>
            }
            @if (can(session.staff, 'coupons.delete') && coupon.status !== 'ended') {
              <button type="button" class="btn btn-sm btn-delete" title="Delete" (click)="removeCoupon(coupon)"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
            }
          </ng-template>
        </app-data-table>
      </section>
      <app-sheet [open]="couponOpen" [title]="couponDraft.id ? 'Edit coupon' : 'New coupon'" (closed)="couponOpen = false">
        <form class="form-card" #couponForm="ngForm" (ngSubmit)="saveCoupon(couponForm)">
          @if (error) { <div class="banner bad">{{ error }}</div> }
          <div class="field"><label for="coupon-name">Name</label><input id="coupon-name" name="couponName" [(ngModel)]="couponDraft.name" placeholder="Welcome coupon" required minlength="2"></div>
          <div class="field"><label for="coupon-code">Code</label><input id="coupon-code" name="couponCode" [(ngModel)]="couponDraft.code" [disabled]="!!couponDraft.id" [required]="!couponDraft.id" placeholder="welcome-10" pattern="[A-Za-z][A-Za-z0-9-]{1,31}"></div>
          <div class="field">
            <label for="coupon-scope">Covers</label>
            <select id="coupon-scope" name="couponScope" [(ngModel)]="couponDraft.scope" [disabled]="couponDraft.status === 'released'">
              <option value="all">All products</option>
              <option value="product">One product</option>
            </select>
          </div>
          @if (couponDraft.scope === 'product') {
            <div class="field">
              <label for="coupon-product"><i class="bi bi-box-seam"></i> Product</label>
              <select id="coupon-product" name="couponProduct" [(ngModel)]="couponDraft.productCode" [disabled]="couponDraft.status === 'released'" required>
                <option value="">Choose a product</option>
                @for (product of products; track product.code) { <option [value]="product.code">{{ product.name }}</option> }
              </select>
            </div>
          }
          <div class="field">
            <label for="coupon-kind">Discount</label>
            <select id="coupon-kind" name="couponKind" [(ngModel)]="couponDraft.kind" [disabled]="couponDraft.status === 'released'">
              <option value="percent">Percent off</option>
              <option value="amount">Rupees off</option>
            </select>
          </div>
          <div class="field">
            <label for="coupon-value"><i class="bi" [class.bi-percent]="couponDraft.kind === 'percent'" [class.bi-currency-rupee]="couponDraft.kind === 'amount'"></i> {{ couponDraft.kind === 'percent' ? 'Percent off' : 'Rupees off' }}</label>
            <input id="coupon-value" name="couponValue" type="number" min="0.01" [max]="couponDraft.kind === 'percent' ? 100 : 10000000" step="0.01" [(ngModel)]="couponDraft.value" [disabled]="couponDraft.status === 'released'" [placeholder]="couponDraft.kind === 'percent' ? '10' : '500'" required>
          </div>
          <div class="field"><label for="coupon-start">Starts</label><input id="coupon-start" name="couponStart" type="date" [(ngModel)]="couponDraft.startsAt" required></div>
          <div class="field"><label for="coupon-end">Ends</label><input id="coupon-end" name="couponEnd" type="date" [(ngModel)]="couponDraft.endsAt" required></div>
          <div class="field full"><label for="coupon-note">Note</label><input id="coupon-note" name="couponNote" [(ngModel)]="couponDraft.note" placeholder="For the payment gateway later"></div>
          @if (!couponDraft.id) {
            <label class="check"><input class="switch" type="checkbox" name="couponRelease" [(ngModel)]="couponDraft.release"> Release now, so it can be picked for a customer</label>
          }
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="couponOpen = false">Cancel</button>
            <button class="btn" type="submit">Save coupon</button>
          </div>
        </form>
      </app-sheet>
      }
        </div>
      </div>
    </div>
  `,
})
export class CouponsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  readonly session = inject(SessionService);
  readonly can = allow;
  readonly pill = pill;
  offers: Offer[] = [];
  coupons: Coupon[] = [];
  products: ProductCard[] = [];
  error = '';
  offerOpen = false;
  couponOpen = false;
  offerDraft = this.blank();
  couponDraft = this.blank();
  readonly offerColumns: DataColumn<Offer>[] = [
    { key: 'name', label: 'Offer', text: (row) => row.name, sub: (row) => row.note },
    { key: 'code', label: 'Code', text: (row) => row.code },
    { key: 'covers', label: 'Covers', text: (row) => (row.scope === 'all' ? 'All products' : row.productName || 'One product') },
    { key: 'discount', label: 'Discount', text: (row) => (row.kind === 'percent' ? row.value + '% off' : inr(row.value) + ' off') },
    { key: 'starts', label: 'Starts', text: (row) => row.startsAt },
    { key: 'ends', label: 'Ends', text: (row) => row.endsAt },
    { key: 'status', label: 'Status', text: (row) => row.status, pill: true },
  ];
  readonly couponColumns: DataColumn<Coupon>[] = [
    { key: 'name', label: 'Coupon', text: (row) => row.name, sub: (row) => row.note },
    { key: 'code', label: 'Code', text: (row) => row.code },
    { key: 'covers', label: 'Covers', text: (row) => (row.scope === 'all' ? 'All products' : row.productName || 'One product') },
    { key: 'discount', label: 'Discount', text: (row) => (row.kind === 'percent' ? row.value + '% off' : inr(row.value) + ' off') },
    { key: 'starts', label: 'Starts', text: (row) => row.startsAt },
    { key: 'ends', label: 'Ends', text: (row) => row.endsAt },
    { key: 'status', label: 'Status', text: (row) => row.status, pill: true },
  ];

  ngOnInit(): void {
    if (this.can(this.session.staff, 'offers.create') || this.can(this.session.staff, 'coupons.create') || this.can(this.session.staff, 'offers.update') || this.can(this.session.staff, 'coupons.update')) {
      this.api.products().subscribe({ next: (res) => (this.products = res.items) });
    }
    this.reload();
  }

  reload(): void {
    if (this.can(this.session.staff, 'offers.view')) {
      this.api.offers().subscribe({
        next: (res) => (this.offers = res.items),
        error: (error: unknown) => (this.error = apiError(error)),
      });
    }
    if (this.can(this.session.staff, 'coupons.view')) {
      this.api.coupons().subscribe({
        next: (res) => (this.coupons = res.items),
        error: (error: unknown) => (this.error = apiError(error)),
      });
    }
  }

  startOffer(): void {
    this.error = '';
    this.couponOpen = false;
    this.offerDraft = this.blank();
    this.offerOpen = true;
  }

  editOffer(offer: Offer): void {
    this.error = '';
    this.couponOpen = false;
    this.offerDraft = this.from(offer);
    this.offerOpen = true;
  }

  saveOffer(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    if (this.offerDraft.endsAt < this.offerDraft.startsAt) {
      this.error = 'The end date must be on or after the start date.';
      return;
    }
    const body = { ...this.offerDraft };
    const done = {
      next: () => {
        this.notice.success(body.id ? 'Offer saved.' : body.release ? 'Offer released.' : 'Offer saved as a draft.');
        this.offerOpen = false;
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    };
    if (body.id) this.api.updateOffer(body.id, body).subscribe(done);
    else this.api.createOffer(body).subscribe(done);
  }

  releaseOffer(offer: Offer): void {
    this.api.releaseOffer(offer.id).subscribe({
      next: () => {
        this.notice.success(offer.name + ' is released.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  async removeOffer(offer: Offer): Promise<void> {
    if (!this.can(this.session.staff, 'offers.delete') || offer.status === 'ended') return;
    const yes = await this.notice.confirm(
      'Delete ' + offer.name + '?',
      offer.status === 'draft' ? 'This draft will be removed.' : 'The offer will end. Purchases already made keep their price.',
    );
    if (!yes) return;
    this.api.deleteOffer(offer.id).subscribe({
      next: () => {
        this.notice.success(offer.name + ' was removed.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  startCoupon(): void {
    this.error = '';
    this.offerOpen = false;
    this.couponDraft = this.blank();
    this.couponOpen = true;
  }

  editCoupon(coupon: Coupon): void {
    this.error = '';
    this.offerOpen = false;
    this.couponDraft = this.from(coupon);
    this.couponOpen = true;
  }

  saveCoupon(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    if (this.couponDraft.endsAt < this.couponDraft.startsAt) {
      this.error = 'The end date must be on or after the start date.';
      return;
    }
    const body = { ...this.couponDraft };
    const done = {
      next: () => {
        this.notice.success(body.id ? 'Coupon saved.' : body.release ? 'Coupon released.' : 'Coupon saved as a draft.');
        this.couponOpen = false;
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    };
    if (body.id) this.api.updateCoupon(body.id, body).subscribe(done);
    else this.api.createCoupon(body).subscribe(done);
  }

  releaseCoupon(coupon: Coupon): void {
    this.api.releaseCoupon(coupon.id).subscribe({
      next: () => {
        this.notice.success(coupon.name + ' is released.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  async removeCoupon(coupon: Coupon): Promise<void> {
    if (!this.can(this.session.staff, 'coupons.delete') || coupon.status === 'ended') return;
    const yes = await this.notice.confirm(
      'Delete ' + coupon.name + '?',
      coupon.status === 'draft' ? 'This draft code will be removed.' : 'The coupon will end. Customers who already have it keep the code.',
    );
    if (!yes) return;
    this.api.deleteCoupon(coupon.id).subscribe({
      next: () => {
        this.notice.success(coupon.name + ' was removed.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  private from(row: Offer): DealDraft {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      scope: row.scope,
      productCode: row.productCode,
      kind: row.kind,
      value: row.value,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      note: row.note,
      release: false,
      status: row.status,
    };
  }

  private blank(): DealDraft {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const day = (date: Date) => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    return { id: '', name: '', code: '', scope: 'all', productCode: '', kind: 'percent', value: 10, startsAt: day(today), endsAt: day(end), note: '', release: true, status: 'draft' };
  }
}
