import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-reports',
  imports: [RouterLink, PageGuideComponent],
  template: `
    <div class="page-stack">
      <header class="top">
        <div>
          <p class="kicker">Insights</p>
          <h1>Reports</h1>
          <app-page-guide />
          <p class="muted">Generate a register for the dates you need, then download it or print it. Full license keys are never included.</p>
        </div>
      </header>
      <div class="grid">
        @for (item of reports; track item.type) {
          <a class="card report-card tone-{{ item.tone }}" [routerLink]="['/reports', item.type]">
            <span class="report-top">
              <span class="product-mark"><i class="bi {{ item.icon }}"></i></span>
              <strong>{{ item.title }}</strong>
            </span>
            <p class="muted">{{ item.body }}</p>
            <span class="report-go">Generate <i class="bi bi-arrow-right"></i></span>
          </a>
        }
      </div>
    </div>
  `,
})
export class ReportsComponent {
  readonly reports = [
    { type: 'subscriptions', title: 'Subscription register', icon: 'bi-journal-check', tone: 'navy', body: 'Who holds which plan, the dates, and whether it is active, in grace, or expired.' },
    { type: 'customers', title: 'Customer register', icon: 'bi-buildings', tone: 'teal', body: 'Companies on file, the contact, and how many subscriptions they hold.' },
    { type: 'licenses', title: 'License keys', icon: 'bi-shield-lock', tone: 'gold', body: 'Issued and revoked keys. Only the hint is shown.' },
    { type: 'installs', title: 'Install check-ins', icon: 'bi-pc-display', tone: 'teal', body: 'Hosts that checked in, with the version and the last verdict.' },
    { type: 'catalog', title: 'Catalog snapshot', icon: 'bi-collection', tone: 'navy', body: 'Products, seat units, plan counts, and open subscriptions as they stand now.' },
    { type: 'revenue', title: 'Subscriber purchases', icon: 'bi-graph-up', tone: 'green', body: 'List cost, the offer taken off, and what each subscriber purchased.' },
    { type: 'activity', title: 'Team activity', icon: 'bi-clock-history', tone: 'gold', body: 'Staff actions in the dates you choose.' },
  ];
}
