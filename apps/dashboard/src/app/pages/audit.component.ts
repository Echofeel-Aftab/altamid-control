import { Component, OnInit, inject } from '@angular/core';
import { ApiService } from '../core/api.service';
import { AuditRow, apiError, when } from '../core/models';
import { DataColumn, DataTableComponent } from '../shared/data-table.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-audit',
  imports: [DataTableComponent, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">History</p>
        <h1>Audit</h1>
        <app-page-guide />
        <p class="muted">Keys are stored as hints. The full license key is never written here.</p>
      </div>
    </header>
    @if (error) { <div class="banner bad">{{ error }}</div> }
    <app-data-table tableId="audit" empty="No audit rows yet." [rows]="rows" [columns]="columns" />
  `,
})
export class AuditComponent implements OnInit {
  private readonly api = inject(ApiService);
  rows: AuditRow[] = [];
  error = '';
  readonly columns: DataColumn<AuditRow>[] = [
    { key: 'when', label: 'When', text: (row) => when(row.createdAt) },
    { key: 'who', label: 'Who', text: (row) => row.actorEmail },
    { key: 'action', label: 'Action', text: (row) => row.action },
    { key: 'detail', label: 'Detail', text: (row) => JSON.stringify(row.detail) },
    { key: 'entity', label: 'Record type', text: (row) => row.entityType || '—', optional: true },
    { key: 'record', label: 'Record', text: (row) => row.entityId || '—', optional: true },
    { key: 'ip', label: 'IP', text: (row) => row.ip || '—', optional: true },
  ];

  ngOnInit(): void {
    this.api.audit().subscribe({
      next: (res) => (this.rows = res.items),
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
