import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { formError } from '../core/fields';
import { Customer, apiError, can as allow, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { NoticeService } from '../shared/notice.component';
import { SheetComponent } from '../shared/sheet.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-customers',
  imports: [FormsModule, RouterLink, DataTableComponent, RowActionsDirective, SheetComponent, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Subscribers</p>
        <h1>Customers</h1>
        <app-page-guide />
        <p class="muted">One company can hold a separate subscription for each product.</p>
      </div>
      @if (can('customers.manage')) {
        <button type="button" class="btn" (click)="begin()"><i class="bi bi-plus-lg"></i> New customer</button>
      }
    </header>
    <div class="page-stack">
      @if (error && !open) { <div class="banner bad">{{ error }}</div> }
      <app-sheet [open]="open" title="New customer" hint="Company, and how to reach the person who holds the account." (closed)="open = false">
        <form class="form-card" #customerForm="ngForm" (ngSubmit)="create(customerForm)">
          @if (error) { <div class="banner bad">{{ error }}</div> }
          <div class="field"><label for="name">Company</label><input id="name" name="company" [(ngModel)]="draft.name" placeholder="Northwind Traders" required minlength="2"></div>
          <div class="field"><label for="contact">Contact</label><input id="contact" name="contact" [(ngModel)]="draft.contactName" placeholder="Asha Mehta"></div>
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" [(ngModel)]="draft.contactEmail" placeholder="asha@company.com" autocomplete="email" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"></div>
          <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" [(ngModel)]="draft.phone" placeholder="+91 98000 00000" autocomplete="tel" pattern="\\+?[0-9][0-9 \\-().]{5,22}"></div>
          <div class="field full"><label for="notes">Notes</label><textarea id="notes" name="notes" rows="3" [(ngModel)]="draft.notes" placeholder="Anything the team should know before the first call"></textarea></div>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="open = false">Cancel</button>
            <button class="btn" type="submit"><i class="bi bi-plus-lg"></i> Create</button>
          </div>
        </form>
      </app-sheet>
      <app-data-table tableId="customers" empty="No customers yet." [rows]="customers" [columns]="columns">
        <select tableFilter class="dt-select" aria-label="Status" [(ngModel)]="status" (ngModelChange)="load()">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <ng-template appRowActions let-row>
          <a class="btn btn-sm btn-view" [routerLink]="['/customers', row.id]" title="View"><i class="bi bi-eye"></i><span class="visually-hidden">View</span></a>
          @if (can('customers.manage')) {
            <a class="btn btn-sm btn-edit" [routerLink]="['/customers', row.id]" [queryParams]="{ edit: 1 }" title="Edit"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></a>
          }
        </ng-template>
      </app-data-table>
    </div>
  `,
})
export class CustomersComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  customers: Customer[] = [];
  status = 'active';
  open = false;
  error = '';
  readonly columns: DataColumn<Customer>[] = [
    { key: 'name', label: 'Company', text: (row) => row.name, sub: (row) => this.marks(row), link: (row) => '/customers/' + row.id },
    { key: 'contact', label: 'Contact', text: (row) => row.contactName, sub: (row) => row.contactEmail },
    { key: 'status', label: 'Status', text: (row) => row.status, pill: true },
    { key: 'email', label: 'Email', text: (row) => row.contactEmail || '—', optional: true },
    { key: 'phone', label: 'Phone', text: (row) => row.phone || '—', optional: true },
    { key: 'notes', label: 'Notes', text: (row) => row.notes || '—', optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];
  draft = { name: '', contactName: '', contactEmail: '', phone: '', notes: '' };

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }

  marks(row: Customer): string {
    const names: Record<string, string> = { vip: 'VIP', priority: 'Priority', trial: 'Trial', 'at-risk': 'At risk', 'key-account': 'Key account', new: 'New' };
    const tags = (row.labels || []).map((id) => names[id] || id);
    if (row.blocked) tags.unshift('Blocked');
    return tags.join(' · ');
  }

  ngOnInit(): void {
    this.load();
  }

  begin(): void {
    this.error = '';
    this.draft = { name: '', contactName: '', contactEmail: '', phone: '', notes: '' };
    this.open = true;
  }

  load(): void {
    this.api.customers('', this.status).subscribe({
      next: (res) => (this.customers = res.items),
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  create(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    this.api.createCustomer(this.draft).subscribe({
      next: (res) => {
        this.notice.success(res.customer.name + ' was added.');
        void this.router.navigate(['/customers', res.customer.id]);
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
