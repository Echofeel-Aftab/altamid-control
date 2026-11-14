import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { formError } from '../core/fields';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { apiError, can as allow } from '../core/models';
import { NoticeService } from '../shared/notice.component';
import { LayoutDirective } from '../shared/layout.directive';
import { PasswordComponent } from '../shared/password.component';
import { PageGuideComponent } from '../shared/page-guide.component';

interface DeskRule { id: string; kind: string; value: string; label: string }
interface DeskPlace {
  id: string; name: string; address: string; lat: number; lng: number; radius: number; active: boolean;
  roleIds: string[]; staffIds: string[]; days: number[]; start: string; end: string;
}
interface DeskAccount {
  id: string; label: string; host: string; port: number; encryption: string; username: string;
  fromName: string; fromEmail: string; active: boolean; isDefault: boolean; hasPassword: boolean;
}
interface DeskSettings {
  general: { companyName: string; supportEmail: string; website: string; city: string; country: string };
  ipMode: string;
  currentIp: string;
  rules: DeskRule[];
  locationEnabled: boolean;
  recheckMinutes: number;
  places: DeskPlace[];
  roles: Array<{ id: string; name: string; slug: string }>;
  staff: Array<{ id: string; name: string; email: string }>;
  overrides: Array<{ id: string; staffId: string; staffName: string; reason: string; expiresAt: string }>;
  events: Array<{ id: string; email: string; result: string; place: string; distance: number | null; ip: string; at: string }>;
  accounts: DeskAccount[];
  purposes: { staff: string; customer: string; general: string };
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, RouterLinkActive, PasswordComponent, LayoutDirective, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">System</p>
        <h1>Settings</h1>
        <app-page-guide />
        <p class="muted">Workspace, email, networks, and where the team may sign in. Super Admin is never locked out.</p>
      </div>
    </header>
    <div class="page-stack">
      <nav class="product-tabs" aria-label="Settings">
        <a class="product-tab" routerLink="/settings" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }"><i class="bi bi-building"></i> General</a>
        <a class="product-tab" routerLink="/settings/email" routerLinkActive="is-active"><i class="bi bi-envelope"></i> Email</a>
        <a class="product-tab" routerLink="/settings/access" routerLinkActive="is-active"><i class="bi bi-shield-lock"></i> IP access</a>
        <a class="product-tab" routerLink="/settings/locations" routerLinkActive="is-active"><i class="bi bi-geo-alt"></i> Login locations</a>
      </nav>
      @if (error) { <div class="banner bad">{{ error }}</div> }
      @if (data && tab === 'general') {
        <section class="card">
          <h2>Workspace</h2>
          <p class="muted">The name and address used when Control sends mail. The city sets the forecast beside the clock. Leave it blank to use Kolkata.</p>
          <form class="form-card thirds" #generalForm="ngForm" (ngSubmit)="saveGeneral(generalForm)">
            <div class="field"><label for="company">Company</label><input id="company" name="company" [(ngModel)]="general.companyName" [disabled]="!can('settings.manage')" required minlength="2"></div>
            <div class="field"><label for="support">Support email</label><input id="support" name="support" type="email" [(ngModel)]="general.supportEmail" placeholder="support@altamidsolutions.com" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+" [disabled]="!can('settings.manage')"></div>
            <div class="field"><label for="website">Website</label><input id="website" name="website" [(ngModel)]="general.website" placeholder="https://altamidsolutions.com" pattern="https?://\\S+" [disabled]="!can('settings.manage')"></div>
            <div class="field"><label for="city">City</label><input id="city" name="city" [(ngModel)]="general.city" placeholder="Kolkata" [disabled]="!can('settings.manage')"></div>
            <div class="field"><label for="country">Country</label><input id="country" name="country" [(ngModel)]="general.country" placeholder="India" [disabled]="!can('settings.manage')"></div>
            @if (can('settings.manage')) {
              <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check2"></i> Save workspace</button></div>
            }
          </form>
        </section>
      }
      @if (data && tab === 'email') {
        <div class="layout-board layout-stack" appLayout="settings-email">
        <div class="layout-col" data-layout-col="main">
        <section class="card" data-layout-box="accounts">
          <h2>SMTP accounts</h2>
          <p class="muted">Add a Gmail or other SMTP sender for staff codes, customer notices, or general mail. A saved app password stays hidden.</p>
          @if (!data.accounts.length) { <p class="muted">No email accounts yet. The server environment is still used for staff codes until you choose an account below.</p> }
          @for (account of data.accounts; track account.id) {
            <div class="account-row">
              <div>
                <strong>{{ account.label }}</strong>
                @if (account.isDefault) { <span class="pill warn">Fallback</span> }
                @if (!account.active) { <span class="pill">Off</span> }
                <p>{{ account.fromName || account.label }} · {{ account.fromEmail || account.username }}</p>
                <small>{{ account.username }} · {{ account.host }}:{{ account.port }}</small>
              </div>
              @if (can('settings.email')) {
                <div class="row-actions">
                  <button type="button" class="btn btn-sm btn-edit" (click)="editAccount(account)" title="Edit"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></button>
                  <button type="button" class="btn btn-sm btn-delete" (click)="removeAccount(account)" title="Delete"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
                </div>
              }
            </div>
          }
          @if (can('settings.email')) {
            <form class="form-card thirds smtp-form" #smtpForm="ngForm" (ngSubmit)="saveAccount(smtpForm)">
              <h2>{{ smtp.id ? 'Edit account' : 'Add SMTP account' }}</h2>
              <div class="field"><label for="smtp-label">Label</label><input id="smtp-label" name="smtpLabel" [(ngModel)]="smtp.label" placeholder="Billing Gmail" required minlength="2"></div>
              <div class="field"><label for="smtp-user">Username</label><input id="smtp-user" name="smtpUser" [(ngModel)]="smtp.username" placeholder="you@gmail.com" required minlength="3"></div>
              <div class="field"><label for="smtp-host">Host</label><input id="smtp-host" name="smtpHost" [(ngModel)]="smtp.host" placeholder="smtp.gmail.com" required minlength="3"></div>
              <div class="field"><label for="smtp-port">Port</label><input id="smtp-port" name="smtpPort" type="number" min="1" max="65535" [(ngModel)]="smtp.port" required></div>
              <div class="field">
                <label for="smtp-enc">Encryption</label>
                <select id="smtp-enc" name="smtpEnc" [(ngModel)]="smtp.encryption">
                  <option value="tls">TLS (587)</option>
                  <option value="ssl">SSL (465)</option>
                </select>
              </div>
              <div class="field">
                <label for="smtp-pass" [class.req]="!smtp.id">App password</label>
                <app-password inputId="smtp-pass" inputName="smtpPass" [(ngModel)]="smtp.password" [placeholder]="smtp.id ? 'Saved — leave blank to keep' : 'App password'" autocomplete="new-password"></app-password>
              </div>
              <div class="field"><label for="smtp-from-name">From name</label><input id="smtp-from-name" name="smtpFromName" [(ngModel)]="smtp.fromName"></div>
              <div class="field"><label for="smtp-from">From email</label><input id="smtp-from" name="smtpFrom" type="email" [(ngModel)]="smtp.fromEmail" placeholder="Usually the same as the username" pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"></div>
              <label class="alert-option full"><input class="switch" type="checkbox" [(ngModel)]="smtp.active" name="smtpActive"><span><strong>Active</strong><small>Inactive accounts are not used.</small></span></label>
              <label class="alert-option full"><input class="switch" type="checkbox" [(ngModel)]="smtp.isDefault" name="smtpDefault"><span><strong>Fallback</strong><small>Used when a mail type has no account of its own.</small></span></label>
              <div class="form-actions">
                <button class="btn" type="submit"><i class="bi bi-check2"></i> {{ smtp.id ? 'Update account' : 'Add account' }}</button>
                @if (smtp.id) { <button class="btn btn-ghost" type="button" (click)="resetAccount()">Cancel</button> }
              </div>
            </form>
            @if (smtp.id) {
              <form class="form-card" #testForm="ngForm" (ngSubmit)="testAccount(testForm)">
                <div class="field wide"><label for="smtp-test">Send a test to</label><input id="smtp-test" name="smtpTest" type="email" [(ngModel)]="testTo" placeholder="you@altamidsolutions.com" required pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"></div>
                <button class="btn btn-sm" type="submit"><i class="bi bi-send"></i> Send test</button>
              </form>
            }
          }
        </section>
        <section class="card" data-layout-box="purposes">
          <h2>Which account sends which mail</h2>
          <p class="muted">Leave a type on the environment default until you want a saved account to send it.</p>
          <form class="form-card thirds" (ngSubmit)="savePurposes()">
            <div class="field">
              <label for="purpose-staff">Staff codes</label>
              <select id="purpose-staff" name="purposeStaff" [(ngModel)]="purposes.staff" [disabled]="!can('settings.email')">
                <option value="">Environment default</option>
                @for (account of data.accounts; track account.id) { <option [value]="account.id">{{ account.label }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="purpose-customer">Customer notices</label>
              <select id="purpose-customer" name="purposeCustomer" [(ngModel)]="purposes.customer" [disabled]="!can('settings.email')">
                <option value="">Environment default</option>
                @for (account of data.accounts; track account.id) { <option [value]="account.id">{{ account.label }}</option> }
              </select>
            </div>
            <div class="field">
              <label for="purpose-general">General</label>
              <select id="purpose-general" name="purposeGeneral" [(ngModel)]="purposes.general" [disabled]="!can('settings.email')">
                <option value="">Environment default</option>
                @for (account of data.accounts; track account.id) { <option [value]="account.id">{{ account.label }}</option> }
              </select>
            </div>
            @if (can('settings.email')) {
              <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check2"></i> Save mail types</button></div>
            }
          </form>
        </section>
        </div>
        </div>
      }
      @if (data && tab === 'access') {
        <section class="card">
          <h2>IP access</h2>
          <p class="muted">Block a network, or limit sign-in to an allow list. Your current network is <strong>{{ data.currentIp || 'unknown' }}</strong>. Super Admin can still sign in.</p>
          <form class="form-card" (ngSubmit)="saveIpMode()">
            <div class="field">
              <label for="ip-mode">Allow list</label>
              <select id="ip-mode" name="ipMode" [(ngModel)]="ipMode" [disabled]="!can('settings.manage')">
                <option value="off">Off — only the block list applies</option>
                <option value="allow">On — other staff must match an allowed network</option>
              </select>
            </div>
            @if (can('settings.manage')) {
              <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check2"></i> Save IP mode</button></div>
            }
          </form>
          <div class="ip-boards">
            <section class="ip-board is-block">
              <h3>Block list</h3>
              <div class="ip-board-body">
                @if (!blocked.length) { <p class="muted">No blocked networks.</p> }
                @for (rule of blocked; track rule.id) {
                  <div class="ip-rule">
                    <span class="ip-rule-mark"><i class="bi bi-shield-x"></i></span>
                    <div><strong>{{ rule.value }}</strong><small>{{ rule.label || 'Blocked network' }}</small></div>
                    @if (can('settings.manage')) {
                      <button type="button" class="btn btn-sm btn-delete" (click)="removeRule(rule)" title="Delete"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
                    }
                  </div>
                }
              </div>
            </section>
            <section class="ip-board is-allow">
              <h3>Allow list</h3>
              <div class="ip-board-body">
                @if (!allowed.length) { <p class="muted">No allowed networks.</p> }
                @for (rule of allowed; track rule.id) {
                  <div class="ip-rule">
                    <span class="ip-rule-mark"><i class="bi bi-shield-check"></i></span>
                    <div><strong>{{ rule.value }}</strong><small>{{ rule.label || 'Allowed network' }}</small></div>
                    @if (can('settings.manage')) {
                      <button type="button" class="btn btn-sm btn-delete" (click)="removeRule(rule)" title="Delete"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
                    }
                  </div>
                }
              </div>
            </section>
          </div>
          @if (can('settings.manage')) {
            <form class="form-card thirds" (ngSubmit)="addRule()">
              <h2>Add a network</h2>
              <div class="field">
                <label for="rule-kind">List</label>
                <select id="rule-kind" name="ruleKind" [(ngModel)]="ruleKind">
                  <option value="block">Block</option>
                  <option value="allow">Allow</option>
                </select>
              </div>
              <div class="field"><label for="rule-value">IP or range</label><input id="rule-value" name="ruleValue" [(ngModel)]="ruleValue" placeholder="203.0.113.10 or 203.0.113.0/24"></div>
              <div class="field"><label for="rule-label">Label</label><input id="rule-label" name="ruleLabel" [(ngModel)]="ruleLabel" placeholder="Office, or a vendor"></div>
              <div class="form-actions">
                <button class="btn" type="submit"><i class="bi bi-plus-lg"></i> Add network</button>
                @if (data.currentIp) { <button class="btn btn-ghost" type="button" (click)="ruleValue = data.currentIp">Use my current IP</button> }
              </div>
            </form>
          }
        </section>
      }
      @if (data && tab === 'locations') {
        <div class="layout-board layout-stack" appLayout="settings-locations">
        <div class="layout-col" data-layout-col="main">
        <section class="card" data-layout-box="location">
          <h2>Login locations</h2>
          <p class="muted">When this is on, a bound role or teammate must share browser location and be inside an assigned place. IP is never used to pass or fail this check. Super Admin is always exempt. Off by default.</p>
          <form class="form-card thirds" (ngSubmit)="saveLocation()">
            <label class="alert-option full">
              <input class="switch" type="checkbox" [(ngModel)]="locationEnabled" name="locationEnabled" [disabled]="!can('settings.manage')">
              <span><strong>Require location at staff sign-in</strong><small>Checks stay off until this is on. You can still save places.</small></span>
            </label>
            <div class="field"><label for="recheck">Re-check every (minutes)</label><input id="recheck" name="recheck" type="number" min="5" max="240" [(ngModel)]="recheckMinutes" [disabled]="!can('settings.manage')"></div>
            @if (can('settings.manage')) {
              <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check2"></i> Save location settings</button></div>
            }
          </form>
        </section>
        <section class="card" data-layout-box="places">
          <h2>Places</h2>
          @if (!data.places.length) { <p class="muted">No places yet.</p> }
          @for (place of data.places; track place.id) {
            <div class="account-row">
              <div>
                <strong>{{ place.name }}</strong>
                @if (!place.active) { <span class="pill">Off</span> }
                <p>{{ place.address || 'No address' }} · {{ place.lat }}, {{ place.lng }} · {{ place.radius }} m</p>
                <small>{{ who(place) }} · {{ hours(place) }}</small>
              </div>
              @if (can('settings.manage')) {
                <div class="row-actions">
                  <button type="button" class="btn btn-sm btn-edit" (click)="editPlace(place)" title="Edit"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></button>
                  <button type="button" class="btn btn-sm btn-delete" (click)="removePlace(place)" title="Delete"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
                </div>
              }
            </div>
          }
          @if (can('settings.manage')) {
            <form class="form-card thirds" (ngSubmit)="savePlace()">
              <h2>{{ place.id ? 'Edit place' : 'Add a place' }}</h2>
              <div class="field"><label for="place-name">Name</label><input id="place-name" name="placeName" [(ngModel)]="place.name" placeholder="Head office"></div>
              <div class="field wide"><label for="place-address">Address</label><input id="place-address" name="placeAddress" [(ngModel)]="place.address"></div>
              <div class="field"><label for="place-lat">Latitude</label><input id="place-lat" name="placeLat" type="number" step="any" [(ngModel)]="place.lat"></div>
              <div class="field"><label for="place-lng">Longitude</label><input id="place-lng" name="placeLng" type="number" step="any" [(ngModel)]="place.lng"></div>
              <div class="field"><label for="place-radius">Radius (metres)</label><input id="place-radius" name="placeRadius" type="number" min="25" [(ngModel)]="place.radius"></div>
              <div class="field full"><label>Days</label><div class="tag-row">
                @for (day of days; track day.id) {
                  <button type="button" [class]="'tag-chip' + (place.days.includes(day.id) ? ' is-on tone-navy' : '')" (click)="place.days = toggleNum(place.days, day.id)">{{ day.name }}</button>
                }
              </div></div>
              <div class="field"><label for="place-start">Opens</label><input id="place-start" name="placeStart" type="time" [(ngModel)]="place.start"></div>
              <div class="field"><label for="place-end">Closes</label><input id="place-end" name="placeEnd" type="time" [(ngModel)]="place.end"></div>
              <label class="alert-option full"><input class="switch" type="checkbox" [(ngModel)]="place.active" name="placeActive"><span><strong>Active</strong><small>Inactive places are ignored at sign-in.</small></span></label>
              <div class="settings-split full">
                <div>
                  <h2>Roles</h2>
                  @for (role of data.roles; track role.id) {
                    <label class="alert-option"><input class="switch" type="checkbox" [checked]="place.roleIds.includes(role.id)" (change)="place.roleIds = toggleId(place.roleIds, role.id)"><span><strong>{{ role.name }}</strong></span></label>
                  }
                </div>
                <div>
                  <h2>Teammates</h2>
                  @if (!data.staff.length) { <p class="muted">No other teammates yet.</p> }
                  @for (person of data.staff; track person.id) {
                    <label class="alert-option"><input class="switch" type="checkbox" [checked]="place.staffIds.includes(person.id)" (change)="place.staffIds = toggleId(place.staffIds, person.id)"><span><strong>{{ person.name }}</strong><small>{{ person.email }}</small></span></label>
                  }
                </div>
              </div>
              <div class="form-actions">
                <button class="btn" type="submit"><i class="bi bi-check2"></i> {{ place.id ? 'Update place' : 'Add place' }}</button>
                <button class="btn btn-ghost" type="button" (click)="useHere()"><i class="bi bi-geo-alt"></i> Use my location</button>
                @if (place.id) { <button class="btn btn-ghost" type="button" (click)="resetPlace()">Cancel</button> }
              </div>
            </form>
          }
        </section>
        @if (can('settings.manage')) {
          <section class="card" data-layout-box="override">
            <h2>Temporary override</h2>
            <p class="muted">Let one teammate sign in away from their places until the override ends.</p>
            @for (item of data.overrides; track item.id) {
              <div class="account-row">
                <div><strong>{{ item.staffName }}</strong><p>{{ item.reason }}</p><small>Until {{ item.expiresAt }}</small></div>
                <button type="button" class="btn btn-sm btn-delete" (click)="removeOverride(item.id)" title="Delete"><i class="bi bi-trash"></i><span class="visually-hidden">Delete</span></button>
              </div>
            }
            <form class="form-card thirds" (ngSubmit)="addOverride()">
              <div class="field">
                <label for="override-person">Teammate</label>
                <select id="override-person" name="overridePerson" [(ngModel)]="override.staffId">
                  <option value="">Choose</option>
                  @for (person of data.staff; track person.id) { <option [value]="person.id">{{ person.name }}</option> }
                </select>
              </div>
              <div class="field"><label for="override-hours">Hours</label><input id="override-hours" name="overrideHours" type="number" min="1" max="168" [(ngModel)]="override.hours"></div>
              <div class="field wide"><label for="override-reason">Reason</label><input id="override-reason" name="overrideReason" [(ngModel)]="override.reason" placeholder="Travel, or GPS failed"></div>
              <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-plus-lg"></i> Grant override</button></div>
            </form>
          </section>
        }
        <section class="card" data-layout-box="checks">
          <h2>Recent checks</h2>
          @if (!data.events.length) { <p class="muted">No location or network checks yet.</p> }
          @for (item of data.events; track item.id) {
            <div class="account-row">
              <div>
                <strong>{{ resultName(item.result) }}</strong>
                <p>{{ item.email || 'Staff' }}{{ item.place ? ' · ' + item.place : '' }}{{ item.distance !== null ? ' · ' + item.distance + ' m' : '' }}</p>
                <small>{{ item.ip }} · {{ item.at }}</small>
              </div>
            </div>
          }
        </section>
        </div>
        </div>
      }
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  data: DeskSettings | null = null;
  tab = 'general';
  error = '';
  general = { companyName: 'Altamid Solutions', supportEmail: '', website: '', city: '', country: '' };
  ipMode = 'off';
  ruleKind = 'block';
  ruleValue = '';
  ruleLabel = '';
  locationEnabled = false;
  recheckMinutes = 20;
  purposes = { staff: '', customer: '', general: '' };
  smtp = this.blankAccount();
  testTo = '';
  place = this.blankPlace();
  override = { staffId: '', hours: 8, reason: '' };
  readonly days = [
    { id: 1, name: 'Mon' }, { id: 2, name: 'Tue' }, { id: 3, name: 'Wed' }, { id: 4, name: 'Thu' },
    { id: 5, name: 'Fri' }, { id: 6, name: 'Sat' }, { id: 7, name: 'Sun' },
  ];

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const tab = params.get('tab') || 'general';
      this.tab = ['general', 'email', 'access', 'locations'].includes(tab) ? tab : 'general';
    });
    this.load();
  }

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }

  get blocked(): DeskRule[] {
    return (this.data?.rules || []).filter((rule) => rule.kind === 'block');
  }

  get allowed(): DeskRule[] {
    return (this.data?.rules || []).filter((rule) => rule.kind === 'allow');
  }

  saveGeneral(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    this.write('general', { ...this.general }, 'patch', 'Workspace saved.');
  }

  saveIpMode(): void {
    this.write('ip-mode', { mode: this.ipMode }, 'patch', 'IP access saved.');
  }

  addRule(): void {
    this.write('ip-rules', { kind: this.ruleKind, value: this.ruleValue, label: this.ruleLabel }, 'post', 'Network saved.', () => {
      this.ruleValue = '';
      this.ruleLabel = '';
    });
  }

  async removeRule(rule: DeskRule): Promise<void> {
    const yes = await this.notice.confirm('Remove this network?', rule.value + ' will no longer be on the list.', 'Delete');
    if (!yes) return;
    this.write('ip-rules/' + rule.id + '/delete', {}, 'post', 'Network removed.');
  }

  saveLocation(): void {
    this.write('location', { enabled: this.locationEnabled, recheckMinutes: this.recheckMinutes }, 'patch', 'Location settings saved.');
  }

  savePlace(): void {
    this.write('places', { ...this.place }, 'post', this.place.id ? 'Place updated.' : 'Place added.', () => this.resetPlace());
  }

  editPlace(place: DeskPlace): void {
    this.place = { ...place, roleIds: [...place.roleIds], staffIds: [...place.staffIds], days: [...place.days] };
  }

  async removePlace(place: DeskPlace): Promise<void> {
    const yes = await this.notice.confirm('Delete this place?', place.name + ' will no longer limit sign-in.', 'Delete');
    if (!yes) return;
    this.write('places/' + place.id + '/delete', {}, 'post', 'Place deleted.', () => {
      if (this.place.id === place.id) this.resetPlace();
    });
  }

  useHere(): void {
    if (!navigator.geolocation) {
      this.error = 'This browser cannot share a location.';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.place.lat = Math.round(pos.coords.latitude * 100000) / 100000;
        this.place.lng = Math.round(pos.coords.longitude * 100000) / 100000;
        this.error = '';
      },
      () => (this.error = 'The browser did not share a location.'),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  addOverride(): void {
    this.write('overrides', { ...this.override }, 'post', 'Override granted.', () => (this.override = { staffId: '', hours: 8, reason: '' }));
  }

  async removeOverride(id: string): Promise<void> {
    const yes = await this.notice.confirm('Remove this override?', 'The teammate must be at an allowed place again.', 'Delete');
    if (!yes) return;
    this.write('overrides/' + id + '/delete', {}, 'post', 'Override removed.');
  }

  saveAccount(form: NgForm): void {
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    if (!this.smtp.id && this.smtp.password.trim().length < 4) {
      this.error = 'Enter the app password for this account.';
      return;
    }
    this.write('smtp', { ...this.smtp }, 'post', this.smtp.id ? 'Email account updated.' : 'Email account added.', () => this.resetAccount());
  }

  editAccount(account: DeskAccount): void {
    this.smtp = { ...this.blankAccount(), ...account, password: '' };
  }

  async removeAccount(account: DeskAccount): Promise<void> {
    const yes = await this.notice.confirm('Remove this email account?', account.label + ' will stop sending.', 'Delete');
    if (!yes) return;
    this.write('smtp/' + account.id + '/delete', {}, 'post', 'Email account removed.', () => {
      if (this.smtp.id === account.id) this.resetAccount();
    });
  }

  testAccount(form: NgForm): void {
    this.error = '';
    const problem = formError(form);
    if (problem) {
      this.error = problem;
      return;
    }
    this.api.saveSetting('smtp/' + this.smtp.id + '/test', { to: this.testTo }).subscribe({
      next: () => this.notice.success('Test email sent.'),
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  savePurposes(): void {
    this.write('smtp-purposes', { ...this.purposes }, 'patch', 'Mail types saved.');
  }

  who(place: DeskPlace): string {
    const names = [
      ...(this.data?.roles || []).filter((role) => place.roleIds.includes(role.id)).map((role) => role.name),
      ...(this.data?.staff || []).filter((person) => place.staffIds.includes(person.id)).map((person) => person.name),
    ];
    return names.length ? names.join(', ') : 'Nobody assigned';
  }

  hours(place: DeskPlace): string {
    const names = this.days.filter((day) => place.days.includes(day.id)).map((day) => day.name);
    const clock = place.start || place.end ? (place.start || '00:00') + '–' + (place.end || '23:59') : '';
    if (!names.length && !clock) return 'Always';
    return (names.join(' ') + ' ' + clock).trim();
  }

  resultName(result: string): string {
    const names: Record<string, string> = {
      ok: 'Inside',
      outside: 'Outside',
      location_required: 'Location not shared',
      ip_blocked: 'Network blocked',
      ip_required: 'Network not allowed',
    };
    return names[result] || result;
  }

  toggleId(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  toggleNum(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  }

  resetPlace(): void {
    this.place = this.blankPlace();
  }

  resetAccount(): void {
    this.smtp = this.blankAccount();
    this.testTo = '';
  }

  private load(): void {
    this.api.settings().subscribe({
      next: (res) => this.apply(res.settings as unknown as DeskSettings),
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  private write(path: string, body: Record<string, unknown>, method: 'patch' | 'post', message: string, done?: () => void): void {
    this.error = '';
    this.api.saveSetting(path, body, method).subscribe({
      next: (res) => {
        if (res.settings) this.apply(res.settings as unknown as DeskSettings);
        done?.();
        this.notice.success(message);
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  private apply(settings: DeskSettings): void {
    this.data = settings;
    this.general = { ...settings.general };
    this.ipMode = settings.ipMode || 'off';
    this.locationEnabled = !!settings.locationEnabled;
    this.recheckMinutes = settings.recheckMinutes || 20;
    this.purposes = { ...settings.purposes };
  }

  private blankPlace(): DeskPlace {
    return { id: '', name: '', address: '', lat: 0, lng: 0, radius: 200, active: true, roleIds: [], staffIds: [], days: [], start: '', end: '' };
  }

  private blankAccount(): DeskAccount & { password: string } {
    return { id: '', label: '', host: 'smtp.gmail.com', port: 587, encryption: 'tls', username: '', fromName: 'Altamid Solutions', fromEmail: '', active: true, isDefault: false, hasPassword: false, password: '' };
  }
}
