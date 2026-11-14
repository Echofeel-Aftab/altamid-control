import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { apiError, pill } from '../core/models';
import { DataColumn, DataTableComponent } from '../shared/data-table.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-report',
  imports: [FormsModule, RouterLink, DataTableComponent, PageGuideComponent],
  template: `
    <div class="page-stack">
      <header class="top">
        <div>
          <p class="kicker">Insights</p>
          <h1>{{ title || 'Report' }}</h1>
          <app-page-guide />
          <p class="muted">{{ summary }}</p>
        </div>
        <a class="btn btn-ghost" routerLink="/reports"><i class="bi bi-arrow-left"></i> All reports</a>
      </header>
      @if (error) { <div class="banner bad">{{ error }}</div> }
      <form class="card report-filters no-print" (submit)="generate(); $event.preventDefault()">
        <label>From <input type="date" name="from" [(ngModel)]="from"></label>
        <label>To <input type="date" name="to" [(ngModel)]="to"></label>
        <button class="btn" type="submit" [disabled]="busy"><i class="bi bi-file-earmark-bar-graph"></i> {{ busy ? 'Generating…' : 'Generate' }}</button>
        <button class="btn btn-ghost" type="button" (click)="allDates()">All dates</button>
        <button class="btn btn-ghost" type="button" (click)="download()" [disabled]="!rows.length"><i class="bi bi-download"></i> CSV</button>
        <button class="btn btn-ghost" type="button" (click)="print()" [disabled]="!rows.length"><i class="bi bi-printer"></i> Print</button>
      </form>
      <app-data-table [tableId]="'report-' + type" [rows]="rows" [columns]="columns" [hint]="generatedHint" [empty]="empty" />
    </div>

    <article class="report-print">
      <header class="report-brand">
        <div class="report-brand-mark">
          <img src="brand/logo-icon.png" alt="">
          <div>
            <p>Altamid Control</p>
            <strong>{{ company }}</strong>
            <span>{{ placeLine }}</span>
          </div>
        </div>
        <div class="report-brand-title">
          <p>Register</p>
          <h2>{{ title || 'Report' }}</h2>
          <span>{{ prettyRange }}</span>
        </div>
      </header>
      <div class="report-rule"></div>
      <p class="report-line">{{ rows.length }} {{ rows.length === 1 ? 'record' : 'records' }} · Prepared by {{ preparedBy }} · Printed {{ printedAt }}</p>
      <ol class="report-records">
        @for (row of rows; track $index) {
          <li class="report-record">
            <div class="report-record-head">
              <span class="report-index">{{ indexLabel($index) }}</span>
              <div>
                <span>{{ columns[0].label }}</span>
                <strong>{{ row[columns[0].key] || '—' }}</strong>
              </div>
              @if (columns[0].pill && row[columns[0].key]) {
                <em [class]="'report-pill is-' + tone(row[columns[0].key])">{{ row[columns[0].key] }}</em>
              }
            </div>
            @if (columns.length > 1) {
              <dl class="report-fields">
                @for (column of columns.slice(1); track column.key) {
                  <div>
                    <dt>{{ column.label }}</dt>
                    <dd>
                      @if (column.pill && row[column.key]) {
                        <em [class]="'report-pill is-' + tone(row[column.key])">{{ row[column.key] }}</em>
                      } @else {
                        {{ row[column.key] || '—' }}
                      }
                    </dd>
                  </div>
                }
              </dl>
            }
          </li>
        }
      </ol>
      <footer class="report-foot">
        <span class="report-foot-brand">{{ company }}{{ website ? ' · ' + website : '' }}{{ placeLine ? ' · ' + placeLine : '' }}</span>
        <span class="report-foot-mark" aria-hidden="true">Confidential register</span>
      </footer>
    </article>
  `,
})
export class ReportComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  type = '';
  title = '';
  summary = 'Choose the dates and generate the report.';
  from = '';
  to = '';
  rows: Array<Record<string, string>> = [];
  columns: DataColumn<Record<string, string>>[] = [];
  generatedHint = '';
  empty = 'Generate the report to see rows.';
  error = '';
  busy = false;
  company = 'Altamid Solutions';
  website = 'https://altamidsolutions.com';
  city = 'Kolkata';
  country = 'India';
  readonly pill = pill;

  ngOnInit(): void {
    this.rememberFooter();
    this.api.settings().subscribe({
      next: (res) => {
        const general = (res.settings?.['general'] || {}) as { companyName?: string; website?: string; city?: string; country?: string };
        if (general.companyName) this.company = general.companyName;
        if (general.website) this.website = general.website;
        if (general.city) this.city = general.city;
        if (general.country) this.country = general.country;
        this.rememberFooter();
      },
      error: () => undefined,
    });
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    this.from = this.dayInput(start);
    this.to = this.dayInput(today);
    this.route.paramMap.subscribe((params) => {
      this.type = params.get('type') || '';
      this.generate();
    });
  }

  get rangeLabel(): string {
    if (!this.from && !this.to) return 'All dates';
    if (this.from && this.to) return this.from + ' to ' + this.to;
    return this.from ? 'From ' + this.from : 'To ' + this.to;
  }

  get prettyRange(): string {
    if (!this.from && !this.to) return 'All dates';
    if (this.from && this.to) return this.prettyDay(this.from) + ' – ' + this.prettyDay(this.to);
    return this.from ? 'From ' + this.prettyDay(this.from) : 'To ' + this.prettyDay(this.to);
  }

  get placeLine(): string {
    return [this.city, this.country].filter(Boolean).join(', ');
  }

  get preparedBy(): string {
    return this.session.staff?.name || 'Altamid Control';
  }

  get printedAt(): string {
    return new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  allDates(): void {
    this.from = '';
    this.to = '';
    this.generate();
  }

  generate(): void {
    if (!this.type) return;
    this.busy = true;
    this.error = '';
    this.api.report(this.type, this.from, this.to).subscribe({
      next: (res) => {
        const report = res.report;
        this.title = report.title;
        this.summary = report.summary;
        this.columns = report.columns.map((column) => ({
          key: column.key,
          label: column.label,
          pill: column.pill,
          text: (row: Record<string, string>) => row[column.key] || '',
        }));
        this.rows = report.rows;
        this.generatedHint = this.rows.length + ' ' + (this.rows.length === 1 ? 'row' : 'rows') + ' · ' + this.rangeLabel;
        this.empty = 'Nothing in this range. Try all dates.';
        this.busy = false;
      },
      error: (error: unknown) => {
        this.error = apiError(error);
        this.rows = [];
        this.busy = false;
      },
    });
  }

  download(): void {
    const header = this.columns.map((column) => column.label);
    const lines = [header, ...this.rows.map((row) => this.columns.map((column) => row[column.key] || ''))];
    const csv = lines.map((line) => line.map((cell) => '"' + cell.replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'altamid-control-' + this.type + '.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  print(): void {
    if (!this.rows.length) return;
    this.rememberFooter();
    setTimeout(() => window.print());
  }

  private rememberFooter(): void {
    const brand = [this.company, this.website, this.placeLine].filter(Boolean).join(' · ').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let style = document.getElementById('report-page-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'report-page-style';
      document.head.appendChild(style);
    }
    style.textContent = `@media print{@page{@bottom-left{content:"${brand}";}}}`;
  }

  indexLabel(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  tone(value: string): string {
    const text = value.toLowerCase();
    if (text === 'active' || text === 'released' || text === 'connected' || text === 'trialing' || text === 'allow') return 'ok';
    if (text === 'revoked' || text === 'suspended' || text === 'blocked' || text === 'ended' || text === 'cancelled') return 'bad';
    if (text === 'past_due' || text === 'grace' || text === 'draft' || text === 'expired') return 'warn';
    return 'plain';
  }

  private prettyDay(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return value;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return day + ' ' + months[month - 1] + ' ' + year;
  }

  private dayInput(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
  }
}
