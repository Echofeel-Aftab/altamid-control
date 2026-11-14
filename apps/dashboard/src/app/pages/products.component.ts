import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { ProductCard, apiError, can, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { NoticeService } from '../shared/notice.component';
import { SheetComponent } from '../shared/sheet.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-products',
  imports: [FormsModule, RouterLink, DataTableComponent, RowActionsDirective, SheetComponent, PageGuideComponent],
  template: `
    <div class="page-stack">
    <header class="top">
      <div>
        <p class="kicker">Catalog</p>
        <h1>Products</h1>
        <app-page-guide />
        <p class="muted">Add a product when a new Altamid app needs a license. The code and the key tag stay permanent, and every check-in must send that code.</p>
      </div>
      @if (owner) {
        <button type="button" class="btn" (click)="begin()"><i class="bi bi-plus-lg"></i> Add product</button>
      }
    </header>
    @if (error && !open) { <div class="banner bad">{{ error }}</div> }
    <app-sheet [open]="open" title="New product" (closed)="open = false">
      <form class="form-card" #productForm="ngForm" (ngSubmit)="create(productForm)">
        @if (error) { <div class="banner bad">{{ error }}</div> }
        <div class="field"><label for="name">Name</label><input id="name" name="name" [(ngModel)]="draft.name" placeholder="Altamid Field" required minlength="2"></div>
        <div class="field"><label for="code">Code</label><input id="code" name="code" [(ngModel)]="draft.code" placeholder="field-sales" required pattern="[A-Za-z][A-Za-z0-9-]{1,39}"></div>
        <div class="field"><label for="tag">Key tag</label><input id="tag" name="tag" [(ngModel)]="draft.keyTag" placeholder="FIELD" maxlength="8" required pattern="[A-Za-z][A-Za-z0-9]{1,7}"></div>
        <div class="field"><label for="seat">Seat unit</label><input id="seat" name="seat" [(ngModel)]="draft.seatUnit" placeholder="user" required pattern="[A-Za-z][A-Za-z0-9_-]{0,31}"></div>
        <div class="field wide">
          <label for="policy">Binding</label>
          <select id="policy" name="policy" [(ngModel)]="draft.hostPolicy">
            <option value="bind_first">Lock to the first host or device</option>
            <option value="allowlist">Only hosts the team lists</option>
            <option value="any">Any host</option>
          </select>
        </div>
        <div class="field full"><label for="summary">Summary</label><input id="summary" name="summary" [(ngModel)]="draft.summary" placeholder="What this product is for"></div>
        <div class="field"><label for="plan-name">Opening plan</label><input id="plan-name" name="planName" [(ngModel)]="draft.planName" placeholder="Standard" required minlength="2"></div>
        <div class="field"><label for="plan-code">Plan code</label><input id="plan-code" name="planCode" [(ngModel)]="draft.planCode" placeholder="standard" required pattern="[A-Za-z][A-Za-z0-9-]{1,31}"></div>
        <div class="field">
          <label for="billing">Billing</label>
          <select id="billing" name="billing" [(ngModel)]="draft.billingPeriod">
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="trial">Trial</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="field"><label for="price">List price, INR</label><input id="price" name="price" type="number" min="0" step="1" [(ngModel)]="draft.priceAmount" required></div>
        <div class="field">
          <label for="basis">Charged</label>
          <select id="basis" name="basis" [(ngModel)]="draft.priceBasis">
            <option value="seat">Per seat</option>
            <option value="flat">Flat for the subscription</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="open = false">Cancel</button>
          <button class="btn" type="submit" [disabled]="busy"><i class="bi bi-plus-lg"></i> Create product</button>
        </div>
      </form>
    </app-sheet>
    <app-data-table tableId="products" empty="No products in the catalog." [rows]="products" [columns]="columns">
      <ng-template appRowActions let-product>
        <a class="btn btn-sm btn-view" [routerLink]="['/products', product.code]" title="View"><i class="bi bi-eye"></i><span class="visually-hidden">View</span></a>
        @if (owner) {
          <a class="btn btn-sm btn-edit" [routerLink]="['/products', product.code]" [queryParams]="{ tab: 'settings' }" title="Edit"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></a>
        }
      </ng-template>
    </app-data-table>
    </div>
  `,
})
export class ProductsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  readonly session = inject(SessionService);
  products: ProductCard[] = [];
  error = '';
  open = false;
  busy = false;
  draft = this.blank();

  get owner(): boolean {
    return can(this.session.staff, 'products.manage');
  }
  readonly columns: DataColumn<ProductCard>[] = [
    { key: 'name', label: 'Product', text: (row) => row.name, sub: (row) => row.summary, link: (row) => '/products/' + row.code },
    { key: 'code', label: 'Code', text: (row) => row.code },
    { key: 'tag', label: 'Key tag', text: (row) => row.keyTag },
    { key: 'seat', label: 'Seat', text: (row) => row.seatUnit },
    { key: 'binding', label: 'Binding', text: (row) => row.hostPolicy },
    { key: 'connection', label: 'Connection', text: (row) => row.connectionState, pill: true },
    { key: 'status', label: 'Catalog', text: (row) => row.status, pill: true, optional: true },
    { key: 'kind', label: 'Kind', text: (row) => row.instanceKind, optional: true },
    { key: 'subscribers', label: 'Subscribers', text: (row) => String(row.subscribers ?? 0), optional: true },
    { key: 'plans', label: 'Plans', text: (row) => String(row.plans ?? 0), optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];

  ngOnInit(): void {
    this.reload();
  }

  begin(): void {
    this.error = '';
    this.draft = this.blank();
    this.open = true;
  }

  reload(): void {
    this.api.products().subscribe({
      next: (res) => (this.products = res.items),
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  create(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      this.busy = false;
      return;
    }
    this.busy = true;
    this.error = '';
    this.api.createProduct(this.draft).subscribe({
      next: (res) => {
        this.notice.success(res.product.name + ' is in the catalog. Its code and key tag cannot be renamed.');
        this.draft = this.blank();
        this.open = false;
        this.busy = false;
        this.reload();
      },
      error: (error: unknown) => {
        this.error = apiError(error);
        this.busy = false;
      },
    });
  }

  private blank() {
    return {
      name: '',
      code: '',
      keyTag: '',
      summary: '',
      seatUnit: 'user',
      hostPolicy: 'bind_first',
      planName: 'Standard',
      planCode: 'standard',
      billingPeriod: 'monthly',
      priceAmount: 0,
      priceBasis: 'seat',
    };
  }
}
