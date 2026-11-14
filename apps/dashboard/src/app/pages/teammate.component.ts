import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { RoleCard, apiError, can as allow } from '../core/models';
import { NoticeService } from '../shared/notice.component';
import { PasswordComponent } from '../shared/password.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-teammate',
  imports: [FormsModule, RouterLink, PasswordComponent, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Access</p>
        <h1>{{ id ? 'Edit teammate' : 'Add teammate' }}</h1>
        <app-page-guide />
        <p class="muted">{{ id ? 'Name, email, phone, role, and account status.' : 'Create a staff account and choose one role.' }}</p>
      </div>
      <a class="btn btn-ghost" routerLink="/team"><i class="bi bi-arrow-left"></i> Team</a>
    </header>
    <div class="page-stack">
      @if (error) { <div class="banner bad">{{ error }}</div> }
      @if (person?.role === 'super_admin') {
        <div class="banner warn">This Super Admin can be edited only after you enter your current password and type their email exactly. The account cannot be deleted.</div>
      }
      <form class="card form-card" #teamForm="ngForm" (ngSubmit)="save(teamForm)">
        <h2>{{ id ? person?.name || 'Teammate' : 'New teammate' }}</h2>
        <div class="field"><label for="name">Name</label><input id="name" name="name" [(ngModel)]="draft.name" [disabled]="!manage" required minlength="2"></div>
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" [(ngModel)]="draft.email" [disabled]="!manage" required placeholder="you@altamidsolutions.com" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"></div>
        <div class="field"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" [(ngModel)]="draft.phone" placeholder="+91 98000 00000" [disabled]="!manage" pattern="\\+?[0-9][0-9 \\-().]{5,22}"></div>
        <div class="field">
          <label for="role">Role</label>
          <select id="role" name="role" [(ngModel)]="draft.role" [disabled]="!manage">
            @for (role of assignable; track role.slug) { <option [value]="role.slug">{{ role.name }}</option> }
          </select>
        </div>
        @if (id) {
          <div class="field">
            <label for="account">Account</label>
            <select id="account" name="account" [(ngModel)]="draft.status" [disabled]="!manage">
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
        }
        <div class="field">
          <label for="password" [class.req]="!id">{{ id ? 'New password' : 'Password' }}</label>
          <app-password inputId="password" inputName="password" [(ngModel)]="draft.password" [placeholder]="id ? 'Leave blank to keep the current password' : 'At least 10 characters'" autocomplete="new-password" [disabled]="!manage"></app-password>
        </div>
        <div class="field">
          <label for="password-confirm" [class.req]="!id">Confirm password</label>
          <app-password inputId="password-confirm" inputName="passwordConfirm" [(ngModel)]="draft.passwordConfirm" autocomplete="new-password" [disabled]="!manage"></app-password>
        </div>
        @if (person?.role === 'super_admin' || draft.role === 'super_admin') {
          <div class="field">
            <label class="req" for="current-password">Your password</label>
            <app-password inputId="current-password" inputName="currentPassword" [(ngModel)]="gate.currentPassword" autocomplete="current-password"></app-password>
          </div>
          <div class="field">
            <label class="req" for="confirm-email">{{ id ? 'Type this email to confirm' : 'Type your email to confirm' }}</label>
            <input id="confirm-email" name="confirmEmail" type="email" [(ngModel)]="gate.confirmEmail" [placeholder]="id ? person?.email : session.staff?.email">
          </div>
        }
        @if (manage) {
          <div class="form-actions">
            <button class="btn" type="submit" [disabled]="busy"><i class="bi bi-check2"></i> {{ id ? 'Save teammate' : 'Add teammate' }}</button>
            @if (id && person && person.role !== 'super_admin' && person.id !== session.staff?.id) {
              <button class="btn btn-ghost" type="button" (click)="remove()" [disabled]="busy"><i class="bi bi-trash"></i> Delete</button>
            }
          </div>
        }
      </form>
    </div>
  `,
})
export class TeammateComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  roles: RoleCard[] = [];
  error = '';
  busy = false;
  person: { id: string; name: string; email: string; role: string } | null = null;
  draft = { name: '', email: '', phone: '', role: 'support', status: 'active', password: '', passwordConfirm: '' };
  gate = { currentPassword: '', confirmEmail: '' };

  get id(): string {
    return this.route.snapshot.paramMap.get('id') || '';
  }

  get manage(): boolean {
    return allow(this.session.staff, 'users.manage');
  }

  get assignable(): RoleCard[] {
    const roles = this.roles.filter((role) => role.slug !== 'super_admin' || this.session.staff?.role === 'super_admin');
    if (this.person?.role === 'super_admin' && !roles.some((role) => role.slug === 'super_admin')) {
      return [{ id: '', slug: 'super_admin', name: 'Super Admin', description: '', system: true, locked: true, protected: true, granted: 0, total: 0, users: 0 }, ...roles];
    }
    return roles;
  }

  ngOnInit(): void {
    if (!this.manage) {
      void this.router.navigateByUrl('/team');
      return;
    }
    this.api.roles().subscribe({
      next: (res) => {
        this.roles = res.items;
        if (!this.id) {
          const first = this.assignable.find((role) => role.slug !== 'super_admin') || this.assignable[0];
          if (first) this.draft.role = first.slug;
        }
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
    if (!this.id) return;
    this.api.staffOne(this.id).subscribe({
      next: (res) => {
        this.person = res.staff;
        this.draft = {
          name: res.staff.name,
          email: res.staff.email,
          phone: res.staff.phone || '',
          role: res.staff.role,
          status: res.staff.status,
          password: '',
          passwordConfirm: '',
        };
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  save(form: NgForm): void {
    this.error = '';
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    if (this.draft.password || !this.id) {
      if (this.draft.password.length < 10) {
        this.error = 'Password must be at least 10 characters.';
        return;
      }
      if (this.draft.password !== this.draft.passwordConfirm) {
        this.error = 'Password and confirmation do not match.';
        return;
      }
    }
    const superEdit = this.person?.role === 'super_admin' || this.draft.role === 'super_admin';
    if (superEdit && (!this.gate.currentPassword || !this.gate.confirmEmail.trim())) {
      this.error = 'Enter your current password and type the Super Admin email exactly.';
      return;
    }
    this.busy = true;
    const done = {
      next: () => {
        this.notice.success(this.id ? 'Teammate saved.' : 'Teammate added.');
        void this.router.navigateByUrl('/team');
      },
      error: (error: unknown) => {
        this.busy = false;
        this.error = apiError(error);
      },
    };
    if (!this.id) {
      this.api.createStaff({ name: this.draft.name, email: this.draft.email, phone: this.draft.phone, role: this.draft.role, password: this.draft.password, currentPassword: this.gate.currentPassword, confirmEmail: this.gate.confirmEmail }).subscribe(done);
      return;
    }
    this.api.updateStaff(this.id, {
      name: this.draft.name,
      email: this.draft.email,
      phone: this.draft.phone,
      role: this.draft.role,
      status: this.draft.status,
      password: this.draft.password,
      currentPassword: this.gate.currentPassword,
      confirmEmail: this.gate.confirmEmail,
    }).subscribe(done);
  }

  async remove(): Promise<void> {
    if (!this.manage || !this.person || this.person.role === 'super_admin' || this.person.id === this.session.staff?.id) return;
    const yes = await this.notice.confirm('Delete ' + this.person.name + '?', 'This person will lose access to Control. This cannot be undone.');
    if (!yes) return;
    this.busy = true;
    this.api.deleteStaff(this.person.id).subscribe({
      next: () => {
        this.notice.success(this.person?.name + ' was removed.');
        void this.router.navigateByUrl('/team');
      },
      error: (error: unknown) => {
        this.busy = false;
        this.error = apiError(error);
      },
    });
  }
}
