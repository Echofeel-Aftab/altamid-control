import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { PermissionDef, RoleCard, apiError, pill } from '../core/models';
import { LayoutDirective } from '../shared/layout.directive';
import { NoticeService } from '../shared/notice.component';
import { PageGuideComponent } from '../shared/page-guide.component';

interface ModuleGroup {
  module: string;
  label: string;
  icon: string;
  items: PermissionDef[];
}

@Component({
  selector: 'app-role',
  imports: [FormsModule, RouterLink, LayoutDirective, PageGuideComponent],
  template: `
    @if (role) {
      <header class="top">
        <div>
          <a class="perm-back" routerLink="/roles"><i class="bi bi-arrow-left"></i> All roles</a>
          <h1>{{ role.name }}</h1>
          <app-page-guide />
          <p class="muted">{{ role.description || 'Choose what this role can do.' }}</p>
        </div>
        <span class="perm-total">{{ granted.size }} / {{ catalog.length }} granted</span>
      </header>
      <div class="page-stack">
        @if (error) { <div class="banner bad">{{ error }}</div> }
        <div class="layout-board layout-stack" appLayout="role">
        <div class="layout-col" data-layout-col="main">
        <form class="card form-card" data-layout-box="name" (ngSubmit)="saveName()">
          <h2>Role name</h2>
          <div class="field"><label for="name">Name</label><input id="name" name="name" [(ngModel)]="name"></div>
          <div class="field wide"><label for="description">Description</label><input id="description" name="description" [(ngModel)]="description"></div>
          <div class="form-actions"><button class="btn" type="submit">Save name</button></div>
        </form>
        <section class="card" data-layout-box="people">
          <h2>People on this role</h2>
          @if (!members.length) { <p class="muted">Nobody is assigned this role yet.</p> }
          <ul class="member-list">
            @for (member of members; track member.id) {
              <li><span>{{ member.name }} <small class="muted">{{ member.email }}</small></span><span [class]="pill(member.status)">{{ member.status }}</span></li>
            }
          </ul>
        </section>
        </div>
        </div>
        @if (role.locked) {
          <div class="banner">Only a Super Admin can open this role. Super Admin always has every control.</div>
        } @else {
          <div class="card perm-toolbar">
            <strong>Permissions</strong>
            <div class="perm-toolbar-actions">
              <button type="button" class="btn btn-ghost" (click)="grantAll()">Grant all</button>
              <button type="button" class="btn btn-ghost" (click)="clearAll()">Clear all</button>
              <button type="button" class="btn" (click)="savePermissions()"><i class="bi bi-check2"></i> Save permissions</button>
            </div>
          </div>
          <div class="perm-grid">
            @for (group of groups; track group.module) {
              <section class="card perm-card">
                <header class="perm-card-head">
                  <span class="perm-icon"><i class="bi {{ group.icon }}"></i></span>
                  <div>
                    <h2>{{ group.label }}</h2>
                    <span class="perm-count">{{ count(group) }}/{{ group.items.length }}</span>
                  </div>
                  <label class="perm-switch">
                    <input class="switch" type="checkbox" [checked]="count(group) === group.items.length" (change)="toggleModule(group, $any($event.target).checked)">
                    <span>All</span>
                  </label>
                </header>
                <div class="perm-list">
                  @for (item of group.items; track item.slug) {
                    <label class="perm-item">
                      <input class="switch" type="checkbox" [checked]="granted.has(item.slug)" (change)="toggle(item.slug, $any($event.target).checked)">
                      <span>{{ item.name }}</span>
                    </label>
                  }
                </div>
              </section>
            }
          </div>
        }
        @if (!role.system) {
          <div class="form-actions">
            <button type="button" class="btn btn-bad" (click)="remove()">Delete role</button>
          </div>
        }
      </div>
    }
  `,
})
export class RoleComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  role: RoleCard | null = null;
  catalog: PermissionDef[] = [];
  members: Array<{ id: string; name: string; email: string; status: string }> = [];
  granted = new Set<string>();
  name = '';
  description = '';
  error = '';
  readonly pill = pill;

  ngOnInit(): void {
    this.load();
  }

  get groups(): ModuleGroup[] {
    const groups: ModuleGroup[] = [];
    for (const item of this.catalog) {
      let group = groups.find((entry) => entry.module === item.module);
      if (!group) {
        group = { module: item.module, label: item.moduleLabel, icon: item.icon, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }

  count(group: ModuleGroup): number {
    return group.items.filter((item) => this.granted.has(item.slug)).length;
  }

  toggle(slug: string, on: boolean): void {
    if (on) this.granted.add(slug);
    else this.granted.delete(slug);
    this.granted = new Set(this.granted);
  }

  toggleModule(group: ModuleGroup, on: boolean): void {
    for (const item of group.items) this.toggle(item.slug, on);
  }

  grantAll(): void {
    this.granted = new Set(this.catalog.map((item) => item.slug));
  }

  clearAll(): void {
    this.granted = new Set();
  }

  saveName(): void {
    if (!this.role) return;
    this.api.updateRole(this.role.id, { name: this.name, description: this.description }).subscribe({
      next: (res) => {
        this.role = res.role;
        this.notice.success('Role saved.');
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  savePermissions(): void {
    if (!this.role) return;
    this.api.updateRole(this.role.id, { permissions: [...this.granted] }).subscribe({
      next: (res) => {
        this.role = res.role;
        this.granted = new Set(res.granted);
        this.notice.success('Permissions saved.');
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  async remove(): Promise<void> {
    if (!this.role || this.role.system) return;
    const yes = await this.notice.confirm('Delete ' + this.role.name + '?', 'People assigned to this role must be moved first. This cannot be undone.');
    if (!yes) return;
    this.api.deleteRole(this.role.id).subscribe({
      next: () => {
        this.notice.success(this.role?.name + ' was removed.');
        void this.router.navigateByUrl('/roles');
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  private load(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.api.role(id).subscribe({
      next: (res) => {
        this.role = res.role;
        this.catalog = res.catalog;
        this.members = res.members;
        this.granted = new Set(res.granted);
        this.name = res.role.name;
        this.description = res.role.description;
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
