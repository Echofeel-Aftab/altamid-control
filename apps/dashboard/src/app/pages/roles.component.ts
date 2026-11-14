import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { RoleCard, apiError } from '../core/models';
import { NoticeService } from '../shared/notice.component';
import { SheetComponent } from '../shared/sheet.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-roles',
  imports: [FormsModule, RouterLink, SheetComponent, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Access</p>
        <h1>Roles</h1>
        <app-page-guide />
        <p class="muted">Super Admin always has every control. Admin starts with full access. Other roles only receive the controls you tick.</p>
      </div>
      <button type="button" class="btn" (click)="begin()"><i class="bi bi-plus-lg"></i> New role</button>
    </header>
    <div class="page-stack">
      @if (error && !open) { <div class="banner bad">{{ error }}</div> }
      <app-sheet [open]="open" title="New role" (closed)="open = false">
        <form class="form-card" #roleForm="ngForm" (ngSubmit)="create(roleForm)">
          @if (error) { <div class="banner bad">{{ error }}</div> }
          <div class="field"><label for="role-name">Name</label><input id="role-name" name="name" [(ngModel)]="draft.name" placeholder="Accounts" required minlength="2"></div>
          <div class="field wide"><label for="role-note">Description</label><input id="role-note" name="description" [(ngModel)]="draft.description" placeholder="What this role is for"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="open = false">Cancel</button>
            <button class="btn" type="submit">Create role</button>
          </div>
        </form>
      </app-sheet>
      <div class="role-grid">
        @for (role of roles; track role.id) {
          <article class="card role-card">
            @if (role.system) { <span class="role-system-badge">System</span> }
            <div class="role-card-top">
              <span class="role-avatar">{{ role.name.charAt(0) }}</span>
              <div>
                <strong>{{ role.name }}</strong>
                <p>{{ role.description }}</p>
              </div>
            </div>
            <div class="role-meter"><span>{{ role.granted }} / {{ role.total }} permissions</span><span>{{ percent(role) }}%</span></div>
            <div class="role-bar"><span [style.width.%]="percent(role)"></span></div>
            <div class="role-meta">{{ role.users }} user{{ role.users === 1 ? '' : 's' }}</div>
            <div class="role-card-actions">
              <a class="btn btn-sm" [routerLink]="['/roles', role.id]"><i class="bi bi-key"></i> Permissions</a>
            </div>
          </article>
        }
      </div>
    </div>
  `,
})
export class RolesComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  roles: RoleCard[] = [];
  error = '';
  open = false;
  draft = { name: '', description: '' };

  ngOnInit(): void {
    this.load();
  }

  begin(): void {
    this.error = '';
    this.draft = { name: '', description: '' };
    this.open = true;
  }

  percent(role: RoleCard): number {
    return role.total ? Math.round((role.granted / role.total) * 100) : 0;
  }

  load(): void {
    this.api.roles().subscribe({
      next: (res) => (this.roles = res.items),
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  create(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    this.api.createRole(this.draft).subscribe({
      next: () => {
        this.notice.success(this.draft.name + ' was added.');
        this.draft = { name: '', description: '' };
        this.open = false;
        this.load();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
