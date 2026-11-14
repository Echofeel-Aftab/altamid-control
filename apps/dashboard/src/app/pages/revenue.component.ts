import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { SubscriptionBrief, apiError, can as allow, inr, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { LayoutDirective } from '../shared/layout.directive';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-revenue',
  imports: [RouterLink, DataTableComponent, RowActionsDirective, LayoutDirective, PageGuideComponent],
  template: `
    <div class="page-stack">
      <header class="top">
        <div>
          <p class="kicker">Subscribers</p>
          <h1>Revenue</h1>
          <app-page-guide />
          <p class="muted">List cost is the plan price for the term. Purchase is that cost after a released offer. Amounts are INR.</p>
        </div>
        <div class="profile-actions">
          @if (can('offers.view') || can('coupons.view')) {
            <a class="btn btn-ghost" routerLink="/coupons"><i class="bi bi-ticket-perforated"></i> Coupons</a>
          }
          <a class="btn btn-ghost" routerLink="/reports/revenue"><i class="bi bi-file-earmark-bar-graph"></i> Purchase report</a>
        </div>
      </header>
      @if (error) { <div class="banner bad">{{ error }}</div> }
      <div class="layout-board layout-stack" appLayout="revenue">
      <div class="layout-col layout-col-row layout-col-wide" data-layout-col="kpis">
        <article class="card kpi tone-navy" data-layout-box="list">
          <div class="kpi-top"><span>List cost</span><span class="kpi-icon"><i class="bi bi-receipt"></i></span></div>
          <div class="kpi-figure"><strong class="money">{{ inr(listAmount) }}</strong><small>Before offers</small></div>
        </article>
        <article class="card kpi tone-gold" data-layout-box="offers">
          <div class="kpi-top"><span>Offers</span><span class="kpi-icon"><i class="bi bi-percent"></i></span></div>
          <div class="kpi-figure"><strong class="money">{{ inr(discountAmount) }}</strong><small>Taken off the list</small></div>
        </article>
        <article class="card kpi tone-green" data-layout-box="purchases">
          <div class="kpi-top"><span>Purchases</span><span class="kpi-icon"><i class="bi bi-graph-up"></i></span></div>
          <div class="kpi-figure"><strong class="money">{{ inr(purchaseAmount) }}</strong><small>What subscribers pay</small></div>
        </article>
        <article class="card kpi tone-teal" data-layout-box="open">
          <div class="kpi-top"><span>Open subscriptions</span><span class="kpi-icon"><i class="bi bi-people"></i></span></div>
          <div class="kpi-figure"><strong>{{ subscriptions }}</strong><small>Cancelled left out</small></div>
        </article>
      </div>
      <div class="layout-col" data-layout-col="main">
      <app-data-table data-layout-box="table" tableId="revenue-purchases" title="Subscriber purchases" empty="No purchase yet." [rows]="purchases" [columns]="columns">
        <ng-template appRowActions let-row>
          <a class="btn btn-sm btn-view" [routerLink]="['/subscriptions', row.id]" title="View"><i class="bi bi-eye"></i><span class="visually-hidden">View</span></a>
        </ng-template>
      </app-data-table>
      </div>
      </div>
    </div>
  `,
})
export class RevenueComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly session = inject(SessionService);
  readonly inr = inr;

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }
  listAmount = 0;
  discountAmount = 0;
  purchaseAmount = 0;
  subscriptions = 0;
  purchases: SubscriptionBrief[] = [];
  error = '';
  readonly columns: DataColumn<SubscriptionBrief>[] = [
    { key: 'customer', label: 'Customer', text: (row) => row.customerName, link: (row) => '/subscriptions/' + row.id },
    { key: 'product', label: 'Product', text: (row) => row.productName, sub: (row) => row.planName },
    { key: 'seats', label: 'Seats', text: (row) => String(row.seatsPurchased || 1) },
    { key: 'list', label: 'List cost', text: (row) => inr(row.listAmount) },
    { key: 'offer', label: 'Offer', text: (row) => row.offerCode || '—' },
    { key: 'coupon', label: 'Coupon', text: (row) => row.couponCode || '—', optional: true },
    { key: 'discount', label: 'Discount', text: (row) => inr(row.discountAmount) },
    { key: 'purchase', label: 'Purchase', text: (row) => inr(row.purchaseAmount) },
    { key: 'status', label: 'Status', text: (row) => row.effectiveStatus, pill: true, optional: true },
    { key: 'starts', label: 'Starts', text: (row) => row.startsAt, optional: true },
    { key: 'ends', label: 'Ends', text: (row) => row.endsAt, optional: true },
    { key: 'periods', label: 'Periods', text: (row) => String(row.periods || 1), optional: true },
    { key: 'grace', label: 'Grace days', text: (row) => String(row.graceDays ?? ''), optional: true },
    { key: 'channel', label: 'Channel', text: (row) => row.channel || '', optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.api.revenue().subscribe({
      next: (res) => {
        this.listAmount = res.listAmount;
        this.discountAmount = res.discountAmount;
        this.purchaseAmount = res.purchaseAmount;
        this.subscriptions = res.subscriptions;
        this.purchases = res.purchases;
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

}
