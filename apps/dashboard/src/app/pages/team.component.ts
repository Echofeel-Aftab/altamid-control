import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { Staff, apiError, can as allow, presenceName, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { NoticeService } from '../shared/notice.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-team',
  imports: [RouterLink, DataTableComponent, RowActionsDirective, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Access</p>
        <h1>Team</h1>
        <app-page-guide />
        <p class="muted">Each person has one role. The role decides which screens and actions they can use.</p>
      </div>
      <div class="profile-actions">
        @if (can('users.manage')) {
          <a class="btn" routerLink="/team/new"><i class="bi bi-person-plus"></i> Add teammate</a>
        }
        @if (can('roles.manage')) {
          <a class="btn btn-ghost" routerLink="/roles"><i class="bi bi-key"></i> Roles</a>
        }
      </div>
    </header>
    <div class="page-stack">
      @if (error) { <div class="banner bad">{{ error }}</div> }
      <app-data-table tableId="team" empty="No teammates yet." [rows]="people" [columns]="columns">
        <ng-template appRowActions let-person>
          @if (can('users.manage')) {
            <a class="btn btn-sm btn-edit" [routerLink]="['/team', person.id]" title="Edit"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></a>
            @if (person.role !== 'super_admin' && person.id !== session.staff?.id) {
              <button type="button" class="btn btn-sm btn-delete" title="Delete" (click)="remove(person)"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
            }
          }
        </ng-template>
      </app-data-table>
    </div>
  `,
})
export class TeamComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  readonly session = inject(SessionService);
  people: Staff[] = [];
  error = '';
  private timer = 0;
  readonly columns: DataColumn<Staff>[] = [
    { key: 'name', label: 'Name', text: (row) => row.name, link: (row) => (this.can('users.manage') ? '/team/' + row.id : '') },
    { key: 'email', label: 'Email', text: (row) => row.email },
    { key: 'role', label: 'Role', text: (row) => row.roleName || row.role },
    { key: 'presence', label: 'Status', text: (row) => presenceName(row), presence: (row) => row.presence || 'online' },
    { key: 'status', label: 'Account', text: (row) => row.status, pill: true },
    { key: 'phone', label: 'Phone', text: (row) => row.phone || '—', optional: true },
    { key: 'seen', label: 'Last active', text: (row) => when(row.lastSeenAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'source', label: 'Status set by', text: (row) => (row.presenceSource === 'manual' ? 'Chosen' : 'Automatic'), optional: true },
  ];

  ngOnInit(): void {
    this.load();
    this.timer = window.setInterval(() => this.load(false), 30000);
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }

  load(showError = true): void {
    this.api.staff().subscribe({
      next: (res) => (this.people = res.items),
      error: (error: unknown) => {
        if (showError) this.error = apiError(error);
      },
    });
  }

  async remove(person: Staff): Promise<void> {
    if (!this.can('users.manage') || person.role === 'super_admin' || person.id === this.session.staff?.id) return;
    const yes = await this.notice.confirm('Delete ' + person.name + '?', 'This person will lose access to Control. This cannot be undone.');
    if (!yes) return;
    this.api.deleteStaff(person.id).subscribe({
      next: () => {
        this.notice.success(person.name + ' was removed.');
        this.load();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
