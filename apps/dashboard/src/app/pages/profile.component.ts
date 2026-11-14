import { Component, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { ApiService, SessionService } from '../core/api.service';
import { PRESENCE_OPTIONS, apiError, presenceIcon, presenceName } from '../core/models';
import { NoticeService } from '../shared/notice.component';
import { LayoutDirective } from '../shared/layout.directive';
import { PasswordComponent } from '../shared/password.component';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, PasswordComponent, LayoutDirective, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Account</p>
        <h1>My profile</h1>
        <app-page-guide />
        <p class="muted">Your photo, contact details, status, and password.</p>
      </div>
    </header>
    <div class="page-stack">
      @if (error) { <div class="banner bad">{{ error }}</div> }
      @if (superAdmin) {
        <div class="banner warn">Saving your details, password, or photo asks for your password or a code emailed to the Super Admin. Status can still be changed without that.</div>
      }
      <div class="layout-board" appLayout="profile">
      <div class="layout-col layout-col-wide" data-layout-col="hero">
      <section class="card profile-hero" data-layout-box="photo">
        <div class="profile-photo">
          @if (session.avatarUrl) { <img [src]="session.avatarUrl" alt=""> }
          @else { <span>{{ initial }}</span> }
          <span [class]="'presence-mark presence-' + (session.staff?.presence || 'online')" aria-hidden="true"><i [class]="'bi ' + presenceIcon(session.staff?.presence)"></i></span>
        </div>
        <div>
          <h2>{{ session.staff?.name }}</h2>
          <p>{{ role }} · {{ session.staff?.email }}</p>
          <div class="profile-meta">
            <span class="pill ok">{{ session.staff?.status }}</span>
            <span class="presence-line"><span [class]="'presence-mark presence-' + (session.staff?.presence || 'online')" aria-hidden="true"><i [class]="'bi ' + presenceIcon(session.staff?.presence)"></i></span><span [class]="'presence-word presence-' + (session.staff?.presence || 'online')">{{ presenceName(session.staff) }}</span></span>
          </div>
        </div>
      </section>
      </div>
      <div class="layout-col" data-layout-col="main">
        <form class="card form-card" data-layout-box="details" #profileForm="ngForm" (ngSubmit)="saveProfile(profileForm)">
          <h2>Profile details</h2>
          <p class="muted">How you appear across Altamid Control.</p>
          <div class="field full">
            <label for="avatar">Profile photo</label>
            <input id="avatar" type="file" accept="image/jpeg,image/png,image/webp,image/gif" (change)="onPhoto($event)">
            <p class="muted">JPG, PNG, WEBP, or GIF. 2 MB max.</p>
            @if (session.staff?.hasAvatar) {
              <button class="btn btn-ghost btn-sm" type="button" (click)="removePhoto()">Remove current photo</button>
            }
          </div>
          <div class="field full"><label for="name">Full name</label><input id="name" name="name" [(ngModel)]="profile.name" required minlength="2"></div>
          <div class="field full"><label for="email">Email</label><input id="email" name="email" type="email" [(ngModel)]="profile.email" autocomplete="email" required placeholder="you@altamidsolutions.com" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"></div>
          <div class="field full"><label for="phone">Phone</label><input id="phone" name="phone" type="tel" [(ngModel)]="profile.phone" placeholder="+91 98000 00000" autocomplete="tel" pattern="\\+?[0-9][0-9 \\-().]{5,22}"></div>
          <div class="field full">
            <label>Status</label>
            <div class="presence-choices">
              @for (item of presenceOptions; track item.id) {
                <button type="button" class="btn btn-ghost btn-sm" [class.is-current]="session.staff?.presence === item.id && (item.id !== 'custom' || !customOpen)" (click)="setStatus(item.id)">
                  <span [class]="'presence-mark presence-' + item.id" aria-hidden="true"><i [class]="'bi ' + item.icon"></i></span> {{ item.label }}
                </button>
              }
            </div>
            @if (customOpen || session.staff?.presence === 'custom') {
              <div class="field" style="margin-top: 10px">
                <label for="status-label">Other status</label>
                <input id="status-label" name="statusLabel" [(ngModel)]="customLabel" placeholder="In a meeting" maxlength="40">
              </div>
              <button class="btn btn-sm" type="button" (click)="saveCustom()">Set status</button>
            }
            <p class="muted">Online switches to Away after a few quiet minutes, and comes back when you return. Busy, On a call, Break, Not available, and Other stay until you change them.</p>
          </div>
          <div class="form-actions"><button class="btn" type="submit" [disabled]="busy"><i class="bi bi-check2"></i> Save profile</button></div>
        </form>
      </div>
      <div class="layout-col" data-layout-col="side">
        <form class="card form-card" data-layout-box="password" (ngSubmit)="savePassword()">
          <h2>Password</h2>
          <p class="muted">Use at least 10 characters.</p>
          @if (!superAdmin) {
            <div class="field full"><label for="current">Current password</label><app-password inputId="current" inputName="current" [(ngModel)]="password.currentPassword" autocomplete="current-password"></app-password></div>
          }
          <div class="field full"><label for="next">New password</label><app-password inputId="next" inputName="next" [(ngModel)]="password.next" [minlength]="10" autocomplete="new-password"></app-password></div>
          <div class="field full"><label for="next-confirm">Confirm new password</label><app-password inputId="next-confirm" inputName="nextConfirm" [(ngModel)]="password.confirm" [minlength]="10" autocomplete="new-password"></app-password></div>
          <div class="form-actions"><button class="btn" type="submit" [disabled]="busy"><i class="bi bi-shield-check"></i> Change password</button></div>
        </form>
      </div>
      </div>
    </div>
    @if (gate.open) {
      <div class="confirm-back">
        <div class="confirm-card gate-card" role="dialog" aria-modal="true" aria-label="Confirm this update">
          <h2>{{ gate.action === 'remove-photo' ? 'Remove this photo?' : 'Confirm this update' }}</h2>
          <p>{{ gate.action === 'remove-photo' ? 'Confirm with your password, or with a code emailed to the Super Admin.' : 'Enter your password, or send a code to the Super Admin email.' }}</p>
          <div class="gate-switch">
            <button type="button" [class.is-on]="gate.mode === 'password'" (click)="gate.mode = 'password'">Password</button>
            <button type="button" [class.is-on]="gate.mode === 'otp'" (click)="gate.mode = 'otp'">Email code</button>
          </div>
          @if (gate.error) { <div class="banner bad">{{ gate.error }}</div> }
          @if (gate.mode === 'password') {
            <div class="field">
              <label for="gate-password">Password</label>
              <app-password inputId="gate-password" inputName="gatePassword" [(ngModel)]="gate.password" autocomplete="current-password"></app-password>
            </div>
          } @else {
            <p class="muted">The code is sent to {{ maskedEmail }} and expires in 10 minutes.</p>
            <button class="btn btn-ghost btn-sm" type="button" (click)="sendCode()" [disabled]="gate.sending" style="margin-bottom: 12px">
              <i class="bi bi-envelope"></i> {{ gate.sent ? 'Send a new code' : 'Send code' }}
            </button>
            <div class="field">
              <label for="gate-otp">6-digit code</label>
              <input id="gate-otp" name="gateOtp" [(ngModel)]="gate.otp" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
            </div>
          }
          <div class="confirm-actions">
            <button type="button" class="btn btn-ghost" (click)="closeGate()">Cancel</button>
            <button type="button" class="btn" (click)="confirmGate()" [disabled]="busy">{{ gate.action === 'remove-photo' ? 'Remove' : 'Confirm' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProfileComponent {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  readonly session = inject(SessionService);
  readonly presenceOptions = PRESENCE_OPTIONS;
  readonly presenceName = presenceName;
  readonly presenceIcon = presenceIcon;
  error = '';
  busy = false;
  customOpen = false;
  customLabel = this.session.staff?.presenceLabel || '';
  profile = {
    name: this.session.staff?.name || '',
    email: this.session.staff?.email || '',
    phone: this.session.staff?.phone || '',
  };
  password = { currentPassword: '', next: '', confirm: '' };
  gate = { open: false, mode: 'password' as 'password' | 'otp', password: '', otp: '', error: '', sending: false, sent: false, action: '' as '' | 'profile' | 'password' | 'photo' | 'remove-photo' };
  private pendingPhoto: { contentType: string; data: string; preview: string } | null = null;

  get initial(): string {
    return (this.session.staff?.name || 'A').trim().charAt(0).toUpperCase();
  }

  get role(): string {
    return this.session.staff?.roleName || (this.session.staff?.role || '').replaceAll('_', ' ');
  }

  get superAdmin(): boolean {
    return this.session.staff?.role === 'super_admin';
  }

  get maskedEmail(): string {
    const email = this.session.staff?.email || '';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    return name.slice(0, 1) + '***@' + domain;
  }

  saveProfile(form: NgForm): void {
    this.error = '';
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    if (this.superAdmin) {
      this.openGate('profile');
      return;
    }
    this.submitProfile({});
  }

  savePassword(): void {
    this.error = '';
    if (this.password.next.length < 10) {
      this.error = 'Password must be at least 10 characters.';
      return;
    }
    if (this.password.next !== this.password.confirm) {
      this.error = 'New password and confirmation do not match.';
      return;
    }
    if (this.superAdmin) {
      this.openGate('password');
      return;
    }
    this.submitPassword({});
  }

  sendCode(): void {
    this.gate.error = '';
    this.gate.sending = true;
    this.api.sendProfileOtp().subscribe({
      next: () => {
        this.gate.sending = false;
        this.gate.sent = true;
        this.gate.mode = 'otp';
        this.notice.success('Code sent to ' + this.maskedEmail + '.');
      },
      error: (error: unknown) => {
        this.gate.sending = false;
        this.gate.error = apiError(error);
      },
    });
  }

  confirmGate(): void {
    this.gate.error = '';
    const code = this.gate.otp.replace(/\s/g, '');
    if (this.gate.mode === 'otp' && code.length !== 6) {
      this.gate.error = 'Enter the 6-digit code from the email.';
      return;
    }
    if (this.gate.mode === 'password' && !this.gate.password) {
      this.gate.error = 'Enter your password.';
      return;
    }
    const proof: Record<string, string> = this.gate.mode === 'otp' ? { otp: code } : { currentPassword: this.gate.password };
    if (this.gate.action === 'profile') this.submitProfile(proof);
    else if (this.gate.action === 'password') this.submitPassword(proof);
    else if (this.gate.action === 'photo' && this.pendingPhoto) this.uploadPhoto(this.pendingPhoto, proof);
    else if (this.gate.action === 'remove-photo') this.clearPhoto(proof);
  }

  closeGate(): void {
    this.gate.open = false;
    this.pendingPhoto = null;
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.error = 'Photo must be under 2 MB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      const photo = { contentType: file.type, data: url.split(',')[1] || '', preview: url };
      if (this.superAdmin) {
        this.pendingPhoto = photo;
        this.openGate('photo');
        return;
      }
      this.uploadPhoto(photo, {});
    };
    reader.readAsDataURL(file);
  }

  async removePhoto(): Promise<void> {
    if (this.superAdmin) {
      this.openGate('remove-photo');
      return;
    }
    const yes = await this.notice.confirm('Remove this photo?', 'Your profile will go back to the initial until you upload another picture.', 'Remove');
    if (!yes) return;
    this.clearPhoto({});
  }

  private openGate(action: 'profile' | 'password' | 'photo' | 'remove-photo'): void {
    this.gate = { open: true, mode: 'password', password: '', otp: '', error: '', sending: false, sent: false, action };
  }

  private finishGate(): void {
    this.gate.open = false;
    this.pendingPhoto = null;
    this.busy = false;
  }

  private failGate(error: unknown): void {
    this.busy = false;
    const message = apiError(error);
    if (this.gate.open) this.gate.error = message;
    else this.error = message;
  }

  private submitProfile(proof: Record<string, string>): void {
    this.busy = true;
    this.api.updateProfile({ name: this.profile.name, email: this.profile.email, phone: this.profile.phone, ...proof }).subscribe({
      next: (res) => {
        this.session.staff = res.staff;
        this.finishGate();
        this.notice.success('Profile saved.');
      },
      error: (error: unknown) => this.failGate(error),
    });
  }

  private submitPassword(proof: Record<string, string>): void {
    this.busy = true;
    this.api.changePassword({
      password: this.password.next,
      passwordConfirm: this.password.confirm,
      currentPassword: this.password.currentPassword,
      ...proof,
    }).subscribe({
      next: () => {
        this.password = { currentPassword: '', next: '', confirm: '' };
        this.finishGate();
        this.notice.success('Password changed.');
      },
      error: (error: unknown) => this.failGate(error),
    });
  }

  private uploadPhoto(photo: { contentType: string; data: string; preview: string }, proof: Record<string, string>): void {
    this.busy = true;
    this.api.saveAvatar({ contentType: photo.contentType, data: photo.data, ...proof }).subscribe({
      next: (res) => {
        this.session.staff = res.staff;
        this.session.avatarUrl = photo.preview;
        this.finishGate();
        this.notice.success('Photo saved.');
        this.error = '';
      },
      error: (error: unknown) => this.failGate(error),
    });
  }

  private clearPhoto(proof: Record<string, string>): void {
    this.busy = true;
    this.api.clearAvatar(proof).subscribe({
      next: (res) => {
        this.session.staff = res.staff;
        this.session.avatarUrl = '';
        this.finishGate();
        this.notice.success('Photo removed.');
      },
      error: (error: unknown) => this.failGate(error),
    });
  }

  setStatus(id: string): void {
    if (id === 'custom') {
      this.customOpen = true;
      return;
    }
    this.customOpen = false;
    this.applyPresence(id, '');
  }

  saveCustom(): void {
    this.applyPresence('custom', this.customLabel.trim());
  }

  private applyPresence(presence: string, label: string): void {
    this.error = '';
    this.api.setPresence({ presence, label, source: 'manual' }).subscribe({
      next: (res) => {
        this.session.staff = res.staff;
        this.customLabel = res.staff.presenceLabel || '';
        this.notice.success('Status set to ' + presenceName(res.staff) + '.');
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
