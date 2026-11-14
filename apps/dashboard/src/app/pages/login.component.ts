import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, EMAIL_KEY, REMEMBER_KEY, readToken, saveToken } from '../core/api.service';
import { apiCode, apiError } from '../core/models';
import { applyTheme, isDarkTheme } from '../core/theme';
import { PasswordComponent } from '../shared/password.component';

@Component({
  selector: 'app-login',
  imports: [FormsModule, PasswordComponent],
  template: `
    <div class="auth-page">
      <div class="auth-scene" aria-hidden="true">
        <div class="auth-grid"></div>
        <div class="auth-glow auth-glow-a"></div>
        <div class="auth-glow auth-glow-b"></div>
      </div>
      <main class="auth-shell has-hero">
        <section class="auth-hero">
          <p class="auth-kicker">Altamid Solutions</p>
          <h2>One desk for every Altamid product</h2>
          <p>Issue subscribers, license keys and versions from the same navy-and-gold workspace the rest of Altamid uses.</p>
          <ul class="auth-pills">
            <li>Products</li>
            <li>Subscribers</li>
            <li>Signed leases</li>
          </ul>
        </section>
        <form class="auth-card" (ngSubmit)="submit()">
          <div class="auth-brand">
            <span class="brand-mark"><img src="brand/logo-icon.png" alt="Altamid"></span>
            <strong>Altamid</strong>
            <span>Control</span>
          </div>
          @if (mode === 'signin') {
            <h1>Sign in</h1>
            <p class="auth-lead">Access the Altamid Control workspace</p>
          } @else {
            <h1>Reset password</h1>
            <p class="auth-lead">{{ mode === 'code' ? 'Enter the code from the email, then choose a new password.' : 'We will email a 6-digit code to the team address.' }}</p>
          }
          @if (notice) { <div class="banner">{{ notice }}</div> }
          @if (error) { <div class="banner bad">{{ error }}</div> }
          @if (mode !== 'code') {
            <div class="auth-field">
              <label class="req" for="email">Email</label>
              <div class="auth-input">
                <i class="bi bi-envelope"></i>
                <input id="email" name="email" type="email" [(ngModel)]="email" autocomplete="username" placeholder="you@altamidsolutions.com" required pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+">
              </div>
            </div>
          }
          @if (mode === 'signin') {
            <div class="auth-field">
              <label class="req" for="password">Password</label>
              <div class="auth-input">
                <i class="bi bi-shield-lock"></i>
                <app-password name="password" inputId="password" inputName="password" [(ngModel)]="password" autocomplete="current-password" placeholder="Password" [required]="true"></app-password>
              </div>
            </div>
            <div class="auth-row">
              <label class="check"><input class="switch" type="checkbox" name="remember" [(ngModel)]="remember"> Remember me</label>
              <button type="button" class="auth-link" (click)="showForgot()">Forgot password?</button>
            </div>
            <button class="btn btn-gold" type="submit" [disabled]="busy">
              <i class="bi bi-box-arrow-in-right"></i> {{ busy ? 'Signing in…' : 'Sign in' }}
            </button>
          }
          @if (mode === 'forgot') {
            <button class="btn btn-gold" type="submit" [disabled]="busy">
              <i class="bi bi-envelope"></i> {{ busy ? 'Sending…' : 'Email the code' }}
            </button>
            <button type="button" class="auth-link auth-back" (click)="showSignIn()">Back to sign in</button>
          }
          @if (mode === 'code') {
            <p class="auth-lead">If {{ masked }} is on the team, the code is on its way. It expires in 10 minutes.</p>
            <div class="auth-field">
              <label class="req" for="code">Code</label>
              <div class="auth-input">
                <i class="bi bi-key"></i>
                <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [(ngModel)]="code" placeholder="6 digits" required pattern="[0-9]{6}">
              </div>
            </div>
            <div class="auth-field">
              <label class="req" for="next-password">New password</label>
              <div class="auth-input">
                <i class="bi bi-shield-lock"></i>
                <app-password name="nextPassword" inputId="next-password" inputName="nextPassword" [(ngModel)]="nextPassword" autocomplete="new-password" placeholder="At least 10 characters" [required]="true" [minlength]="10"></app-password>
              </div>
            </div>
            <div class="auth-field">
              <label class="req" for="confirm-password">Confirm password</label>
              <div class="auth-input">
                <i class="bi bi-shield-check"></i>
                <app-password name="confirmPassword" inputId="confirm-password" inputName="confirmPassword" [(ngModel)]="confirmPassword" autocomplete="new-password" placeholder="Repeat the new password" [required]="true"></app-password>
              </div>
            </div>
            <button class="btn btn-gold" type="submit" [disabled]="busy">
              <i class="bi bi-check2"></i> {{ busy ? 'Saving' : 'Save password' }}
            </button>
            <div class="auth-row">
              <button type="button" class="auth-link" (click)="sendCode()" [disabled]="busy">Send a new code</button>
              <button type="button" class="auth-link" (click)="showSignIn()">Back to sign in</button>
            </div>
          }
        </form>
      </main>
    </div>
  `,
})
export class LoginComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  mode: 'signin' | 'forgot' | 'code' = 'signin';
  email = localStorage.getItem(EMAIL_KEY) || '';
  password = '';
  remember = localStorage.getItem(REMEMBER_KEY) === '1';
  code = '';
  nextPassword = '';
  confirmPassword = '';
  error = '';
  notice = '';
  busy = false;

  get masked(): string {
    const [name, domain] = this.email.split('@');
    if (!domain) return 'that address';
    return (name.slice(0, 1) || 'a') + '***@' + domain;
  }

  ngOnInit(): void {
    applyTheme(isDarkTheme());
    this.error = sessionStorage.getItem('altamid_control_gate') || '';
    sessionStorage.removeItem('altamid_control_gate');
    if (readToken()) void this.router.navigateByUrl('/');
  }

  showForgot(): void {
    this.mode = 'forgot';
    this.error = '';
    this.notice = '';
    this.password = '';
  }

  showSignIn(): void {
    this.mode = 'signin';
    this.error = '';
    this.code = '';
    this.nextPassword = '';
    this.confirmPassword = '';
  }

  submit(): void {
    this.readFields();
    this.error = '';
    if (this.mode !== 'code') {
      if (!this.email.trim()) {
        this.error = 'Email is required.';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) {
        this.error = 'Enter a valid email.';
        return;
      }
    }
    if (this.mode === 'signin' && !this.password) {
      this.error = 'Password is required.';
      return;
    }
    if (this.mode === 'code' && !/^[0-9]{6}$/.test(this.code.trim())) {
      this.error = 'Enter the 6-digit code from the email.';
      return;
    }
    this.busy = true;
    if (this.mode === 'forgot') {
      this.sendCode();
      return;
    }
    if (this.mode === 'code') {
      this.savePassword();
      return;
    }
    this.signIn();
  }

  sendCode(): void {
    this.readFields();
    this.busy = true;
    this.error = '';
    this.api.forgotPassword(this.email.trim()).subscribe({
      next: () => {
        this.mode = 'code';
        this.notice = '';
        this.busy = false;
      },
      error: (error: unknown) => {
        this.error = apiError(error);
        this.busy = false;
      },
    });
  }

  private savePassword(): void {
    this.readFields();
    if (this.nextPassword.length < 10) {
      this.error = 'Password must be at least 10 characters.';
      this.busy = false;
      return;
    }
    if (this.nextPassword !== this.confirmPassword) {
      this.error = 'New password and confirmation do not match.';
      this.busy = false;
      return;
    }
    this.api.resetPassword(this.email.trim(), this.code.trim(), this.nextPassword).subscribe({
      next: () => {
        this.password = '';
        this.code = '';
        this.nextPassword = '';
        this.confirmPassword = '';
        this.mode = 'signin';
        this.notice = 'Password updated. Sign in with the new one.';
        this.busy = false;
      },
      error: (error: unknown) => {
        this.error = apiError(error);
        this.busy = false;
      },
    });
  }

  private readFields(): void {
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const code = document.getElementById('code');
    const nextPassword = document.getElementById('next-password');
    const confirmPassword = document.getElementById('confirm-password');
    if (email instanceof HTMLInputElement && email.value.trim()) this.email = email.value.trim();
    if (password instanceof HTMLInputElement) this.password = password.value;
    if (code instanceof HTMLInputElement && code.value.trim()) this.code = code.value.trim();
    if (nextPassword instanceof HTMLInputElement) this.nextPassword = nextPassword.value;
    if (confirmPassword instanceof HTMLInputElement) this.confirmPassword = confirmPassword.value;
  }

  private signIn(where?: { lat: number; lng: number; accuracy: number }): void {
    this.api.login(this.email, this.password, where, this.remember).subscribe({
      next: (res) => {
        saveToken(res.token, this.remember);
        if (this.remember) localStorage.setItem(EMAIL_KEY, this.email.trim());
        else localStorage.removeItem(EMAIL_KEY);
        void this.router.navigateByUrl('/');
      },
      error: (error: unknown) => {
        if (apiCode(error) === 'location_required' && !where) {
          this.askLocation();
          return;
        }
        this.error = apiError(error);
        this.busy = false;
      },
    });
  }

  private askLocation(): void {
    if (!navigator.geolocation) {
      this.error = 'This browser cannot share a location. Sign-in is limited to an allowed place.';
      this.busy = false;
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => this.signIn({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => {
        this.error = 'Allow location to sign in. This account must be at an allowed place.';
        this.busy = false;
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
}
