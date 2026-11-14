import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-manual',
  imports: [RouterLink, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Help</p>
        <h1>User manual</h1>
        <app-page-guide />
        <p class="muted">How the Altamid team uses Control. Product installs are not changed from these screens.</p>
      </div>
    </header>
    <div class="page-stack">
      @for (section of sections; track section.title) {
        <section class="card">
          <h2><i class="bi {{ section.icon }}"></i> {{ section.title }}</h2>
          <p>{{ section.body }}</p>
          <a [routerLink]="section.link">Open {{ section.title }}</a>
        </section>
      }
    </div>
  `,
})
export class ManualComponent {
  readonly sections = [
    { title: 'Dashboard', icon: 'bi-grid-1x2', link: '/', body: 'See every Altamid product, how many companies subscribe, and which ones need attention.' },
    { title: 'Products', icon: 'bi-box-seam', link: '/products', body: 'Owners can add a product for a future app. Open a product and use the tabs: connection, plans, subscribers, releases, and settings. The code and the key tag stay permanent. A draft or retired product cannot take a new subscription.' },
    { title: 'Customers', icon: 'bi-building', link: '/customers', body: 'A company can hold one subscription per product. Set the seats purchased and an optional released offer. The purchase is the list cost for the term, minus that offer.' },
    { title: 'Revenue', icon: 'bi-currency-rupee', link: '/revenue', body: 'See list cost, discounts, and purchases in INR. Ended offers stay on purchases already made.' },
    { title: 'Coupons', icon: 'bi-ticket-perforated', link: '/coupons', body: 'Offers reduce a purchase in Control. Coupon codes can be given to a customer and used later by a payment gateway. Running offers and released codes are listed so the team can pick one. Creating, changing, or deleting them depends on the role. Super Admin can do all of it.' },
    { title: 'Connection lab', icon: 'bi-plug', link: '/lab', body: 'Paste a key and prove the signed lease before a live product is connected. A failed check here does not change that product.' },
    { title: 'Reports', icon: 'bi-file-earmark-bar-graph', link: '/reports', body: 'Generate a subscription, customer, license, install, catalog, or activity report for the dates you choose. Download the CSV or print it. The full license key is never included.' },
    { title: 'Audit', icon: 'bi-journal-text', link: '/audit', body: 'Staff actions are recorded here. The full license key is never stored in the audit.' },
    { title: 'Team', icon: 'bi-people', link: '/team', body: 'The team list is a table. Add a teammate on a separate page and give them a role. Edit or delete a person from the row. A Super Admin can be edited only after your password and their email are confirmed, and that account cannot be deleted.' },
    { title: 'Roles', icon: 'bi-shield-lock', link: '/roles', body: 'Super Admin has every control and that cannot be reduced. Admin starts with full access. Create another role and tick only the screens and actions that job needs. A person uses one role.' },
    { title: 'Settings', icon: 'bi-gear', link: '/settings', body: 'Set the workspace name, the city for the forecast beside the clock, more than one SMTP account, which networks can sign in, and the places a role or teammate must be inside. A blank city uses Kolkata. Super Admin is never locked out by an IP rule or a login place. Taxes, ads, and other CRM-only settings are not part of Control.' },
  ];
}
