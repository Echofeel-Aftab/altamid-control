import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService, SessionService, clearToken } from '../core/api.service';
import { PRESENCE_OPTIONS, Customer, ProductCard, apiCode, apiError, can as allow, presenceIcon, presenceName } from '../core/models';
import { applyTheme, isDarkTheme, setDarkTheme } from '../core/theme';
import { NoticeComponent, NoticeService } from '../shared/notice.component';

interface SearchHit {
  label: string;
  hint: string;
  icon: string;
  link: string;
  permit?: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NoticeComponent],
  template: `
    <div class="app-shell">
      <aside class="sidebar" (mouseover)="showFlyout($event)" (mouseout)="hideFlyout($event)">
        <a class="sidebar-brand" routerLink="/" aria-label="Altamid Control">
          <span class="brand-mark"><img src="brand/logo-icon.png" alt="Altamid"></span>
          <span class="brand-text">
            <strong>Altamid</strong>
            <span>Control</span>
          </span>
        </a>
        <nav class="sidebar-nav">
          @if (can('dashboard.view')) {
            <div class="nav-label">Overview</div>
            <a class="nav-link" routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" aria-label="Dashboard">
              <i class="bi bi-grid-1x2"></i><span class="nav-text">Dashboard</span>
            </a>
          }
          @if (can('products.view')) {
            <div class="nav-label">Catalog</div>
            <a class="nav-link" routerLink="/products" routerLinkActive="active" aria-label="Products">
              <i class="bi bi-box-seam"></i><span class="nav-text">Products</span>
            </a>
          }
          @if (can('customers.view') || can('revenue.view') || can('offers.view') || can('coupons.view') || can('lab.use')) {
            <div class="nav-label">Subscribers</div>
          }
          @if (can('customers.view')) {
            <a class="nav-link" routerLink="/customers" routerLinkActive="active" aria-label="Customers">
              <i class="bi bi-building"></i><span class="nav-text">Customers</span>
            </a>
          }
          @if (can('revenue.view')) {
            <a class="nav-link" routerLink="/revenue" routerLinkActive="active" aria-label="Revenue">
              <i class="bi bi-currency-rupee"></i><span class="nav-text">Revenue</span>
            </a>
          }
          @if (can('offers.view') || can('coupons.view')) {
            <a class="nav-link" routerLink="/coupons" routerLinkActive="active" aria-label="Coupons">
              <i class="bi bi-ticket-perforated"></i><span class="nav-text">Coupons</span>
            </a>
          }
          @if (can('lab.use')) {
            <a class="nav-link" routerLink="/lab" routerLinkActive="active" aria-label="Connection lab">
              <i class="bi bi-plug"></i><span class="nav-text">Connection lab</span>
            </a>
          }
          @if (can('reports.view') || can('audit.view') || can('users.view') || can('roles.manage') || can('settings.view') || can('settings.manage') || can('settings.email')) {
            <div class="nav-label">System</div>
          }
          @if (can('reports.view')) {
            <a class="nav-link" routerLink="/reports" routerLinkActive="active" aria-label="Reports">
              <i class="bi bi-file-earmark-bar-graph"></i><span class="nav-text">Reports</span>
            </a>
          }
          @if (can('audit.view')) {
            <a class="nav-link" routerLink="/audit" routerLinkActive="active" aria-label="Audit">
              <i class="bi bi-journal-text"></i><span class="nav-text">Audit</span>
            </a>
          }
          @if (can('users.view')) {
            <a class="nav-link" routerLink="/team" routerLinkActive="active" aria-label="Team">
              <i class="bi bi-people"></i><span class="nav-text">Team</span>
            </a>
          }
          @if (can('roles.manage')) {
            <a class="nav-link" routerLink="/roles" routerLinkActive="active" aria-label="Roles">
              <i class="bi bi-shield-lock"></i><span class="nav-text">Roles</span>
            </a>
          }
          @if (can('settings.view') || can('settings.manage') || can('settings.email')) {
            <a class="nav-link" routerLink="/settings" routerLinkActive="active" aria-label="Settings">
              <i class="bi bi-gear"></i><span class="nav-text">Settings</span>
            </a>
          }
          <a class="nav-link" routerLink="/manual" routerLinkActive="active" aria-label="User manual">
            <i class="bi bi-book"></i><span class="nav-text">User manual</span>
          </a>
        </nav>
        <button type="button" class="sidebar-collapse" (click)="toggleSidebar()" [attr.aria-label]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
          <svg class="side-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path class="side-ico-panel" d="M9 3.25H6.25a3 3 0 0 0-3 3v11.5a3 3 0 0 0 3 3H9z"></path>
            <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="3"></rect>
            @if (collapsed) {
              <path d="m13.4 9 3.1 3-3.1 3"></path>
            } @else {
              <path d="m16.5 9-3.1 3 3.1 3"></path>
            }
          </svg>
          <span class="nav-text">{{ collapsed ? 'Expand' : 'Collapse' }}</span>
        </button>
      </aside>
      @if (flyout) {
        <div class="nav-flyout" [style.top.px]="flyoutTop">{{ flyout }}</div>
      }
      <div class="workspace">
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="icon-btn sidebar-toggle" [class.is-collapsed]="collapsed" (click)="toggleSidebar()" [attr.aria-label]="collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
              <svg class="side-ico" viewBox="0 0 24 24" aria-hidden="true">
                <path class="side-ico-panel" d="M9 3.25H6.25a3 3 0 0 0-3 3v11.5a3 3 0 0 0 3 3H9z"></path>
                <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="3"></rect>
                @if (collapsed) {
                  <path d="m13.4 9 3.1 3-3.1 3"></path>
                } @else {
                  <path d="m16.5 9-3.1 3 3.1 3"></path>
                }
              </svg>
            </button>
            <div class="topbar-now">
              <div class="topbar-now-clock">
                <strong>{{ clock }}</strong>
                <span>{{ dateLabel }}</span>
              </div>
              @if (weather) {
                <div class="topbar-now-weather" [attr.title]="weather.label + ' in ' + weather.place">
                  <i [class]="'bi ' + weather.icon"></i>
                  <span>{{ weather.temp }}°</span>
                  <small>{{ weather.place }}</small>
                </div>
              }
            </div>
          </div>
          <form class="topbar-search" role="search" (submit)="$event.preventDefault(); openFirst()">
            <i class="bi bi-search"></i>
            <input type="search" placeholder="Search anything in Control..." [value]="query" (input)="onSearch($any($event.target).value)" (focus)="searchOpen = query.trim().length > 0" aria-label="Search">
            @if (searchOpen) {
              <div class="search-results">
                @if (!hits.length) {
                  <div class="search-empty">Nothing matches that search.</div>
                } @else {
                  @for (hit of hits; track hit.link) {
                    <a [routerLink]="hit.link" (click)="searchOpen = false">
                      <i class="bi {{ hit.icon }}"></i>
                      <span>{{ hit.label }}<small>{{ hit.hint }}</small></span>
                    </a>
                  }
                }
              </div>
            }
          </form>
          <div class="topbar-actions">
            <button type="button" class="icon-btn" (click)="theme()" [attr.title]="dark ? 'Switch to light mode' : 'Switch to dark mode'" [attr.aria-label]="dark ? 'Switch to light mode' : 'Switch to dark mode'">
              <i class="bi" [class.bi-sun-fill]="dark" [class.bi-moon-stars-fill]="!dark"></i>
            </button>
            <div class="user-drop">
              <button type="button" class="user-chip" (click)="$event.stopPropagation(); userOpen = !userOpen" [attr.aria-expanded]="userOpen">
                <span class="avatar">
                  @if (session.avatarUrl) { <img [src]="session.avatarUrl" alt=""> }
                  @else { {{ initial }} }
                  <span [class]="'presence-mark presence-' + (session.staff?.presence || 'online')" aria-hidden="true"><i [class]="'bi ' + presenceIcon(session.staff?.presence)"></i></span>
                </span>
                <span>
                  <strong>{{ session.staff?.name }}</strong>
                  <small>{{ roleLabel }} · <span [class]="'presence-word presence-' + (session.staff?.presence || 'online')">{{ presenceLabel }}</span></small>
                </span>
                <i class="bi bi-chevron-down"></i>
              </button>
              @if (userOpen) {
                <div class="user-menu">
                  <div class="presence-menu">
                    <div class="presence-menu-title">Status</div>
                    @for (item of presenceOptions; track item.id) {
                      <button type="button" [class.is-current]="session.staff?.presence === item.id" (click)="choosePresence(item.id)">
                        <span [class]="'presence-mark presence-' + item.id" aria-hidden="true"><i [class]="'bi ' + item.icon"></i></span> {{ item.label }}
                      </button>
                    }
                    @if (customOpen) {
                      <div class="presence-custom-row">
                        <input [value]="customLabel" (input)="customLabel = $any($event.target).value" placeholder="In a meeting" maxlength="40" aria-label="Custom status">
                        <button type="button" (click)="saveCustom()">Set</button>
                      </div>
                    }
                  </div>
                  <a routerLink="/profile" routerLinkActive="active" (click)="userOpen = false"><i class="bi bi-person"></i> Profile</a>
                  <a routerLink="/manual" routerLinkActive="active" (click)="userOpen = false"><i class="bi bi-journal-text"></i> User manual</a>
                  <button type="button" (click)="logout()"><i class="bi bi-box-arrow-right"></i> Sign out</button>
                </div>
              }
            </div>
          </div>
        </header>
        <div class="content">
          @if (ready) {
            <router-outlet />
          }
        </div>
        <footer class="app-footer"><span>© {{ year }} Altamid Solutions</span><span>Control</span></footer>
      </div>
      <app-notice />
    </div>
  `,
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly year = new Date().getFullYear();
  ready = false;
  dark = false;
  collapsed = false;
  flyout = '';
  flyoutTop = 0;
  userOpen = false;
  searchOpen = false;
  query = '';
  clock = '';
  dateLabel = '';
  weather: { temp: number; icon: string; label: string; place: string } | null = null;
  hits: SearchHit[] = [];
  readonly presenceOptions = PRESENCE_OPTIONS;
  readonly presenceIcon = presenceIcon;
  customOpen = false;
  customLabel = '';
  private products: ProductCard[] = [];
  private customers: Customer[] = [];
  private timer = 0;
  private searchTimer = 0;
  private locating = false;
  private presenceTimer = 0;
  private weatherTimer = 0;
  private lastInput = Date.now();
  private pushingPresence = false;

  get initial(): string {
    return (this.session.staff?.name || 'A').trim().charAt(0).toUpperCase();
  }

  get roleLabel(): string {
    return this.session.staff?.roleName || (this.session.staff?.role || '').replaceAll('_', ' ');
  }

  get presenceLabel(): string {
    return presenceName(this.session.staff);
  }

  can(slug: string): boolean {
    return allow(this.session.staff, slug);
  }

  ngOnInit(): void {
    this.dark = isDarkTheme();
    applyTheme(this.dark);
    this.collapsed = localStorage.getItem('altamid_control_sidebar') === '1';
    this.applySidebar();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 1000);
    this.api.me().subscribe({
      next: (res) => {
        this.session.staff = res.staff;
        this.customLabel = res.staff.presenceLabel || '';
        this.ready = true;
        if (res.staff.hasAvatar) this.loadAvatar(res.staff.id);
        this.beat();
        this.presenceTimer = window.setInterval(() => this.beat(), 30000);
        this.loadWeather();
        this.weatherTimer = window.setInterval(() => this.loadWeather(), 20 * 60 * 1000);
        if (this.can('products.view')) this.api.products().subscribe({ next: (res) => (this.products = res.items) });
        if (this.can('customers.view')) this.api.customers('', 'all').subscribe({ next: (res) => (this.customers = res.items) });
      },
      error: () => this.logout(),
    });
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
    window.clearInterval(this.presenceTimer);
    window.clearInterval(this.weatherTimer);
    window.clearTimeout(this.searchTimer);
  }

  @HostListener('document:pointerdown')
  @HostListener('document:keydown')
  noteActivity(): void {
    const wasIdle = Date.now() - this.lastInput > 5 * 60 * 1000;
    this.lastInput = Date.now();
    if (wasIdle) this.beat();
  }

  @HostListener('document:visibilitychange')
  onVisibility(): void {
    this.beat();
  }

  @HostListener('document:click', ['$event'])
  closeMenus(event: Event): void {
    const node = event.target as HTMLElement | null;
    if (!node?.closest('.user-drop')) this.userOpen = false;
    if (!node?.closest('.topbar-search')) this.searchOpen = false;
  }

  theme(): void {
    this.dark = !this.dark;
    setDarkTheme(this.dark);
  }

  toggleSidebar(): void {
    this.collapsed = !this.collapsed;
    this.flyout = '';
    localStorage.setItem('altamid_control_sidebar', this.collapsed ? '1' : '0');
    this.applySidebar();
  }

  showFlyout(event: Event): void {
    if (!this.collapsed || !window.matchMedia('(min-width: 992px)').matches) return;
    const item = (event.target as HTMLElement | null)?.closest?.('.nav-link, .sidebar-collapse, .sidebar-brand') as HTMLElement | null;
    if (!item) {
      this.flyout = '';
      return;
    }
    const label = item.getAttribute('aria-label') || '';
    if (!label) return;
    const box = item.getBoundingClientRect();
    const half = 16;
    const center = box.top + box.height / 2;
    this.flyout = label;
    this.flyoutTop = Math.round(Math.min(window.innerHeight - half - 8, Math.max(half + 8, center)));
  }

  hideFlyout(event: MouseEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as Node).contains(next)) return;
    this.flyout = '';
  }

  onSearch(value: string): void {
    this.query = value;
    this.searchOpen = value.trim().length > 0;
    window.clearTimeout(this.searchTimer);
    this.searchTimer = window.setTimeout(() => this.buildHits(), 180);
  }

  openFirst(): void {
    const hit = this.hits[0];
    if (!hit) return;
    this.searchOpen = false;
    void this.router.navigateByUrl(hit.link);
  }

  choosePresence(id: string): void {
    if (id === 'custom') {
      this.customOpen = true;
      return;
    }
    this.customOpen = false;
    this.pushPresence(id, '', 'manual');
  }

  saveCustom(): void {
    const label = this.customLabel.trim();
    if (label.length < 2) return;
    this.pushPresence('custom', label, 'manual');
    this.customOpen = false;
  }

  logout(): void {
    clearToken();
    this.session.staff = null;
    void this.router.navigateByUrl('/login');
  }

  private applySidebar(): void {
    document.documentElement.classList.toggle('sidebar-collapsed', this.collapsed);
  }

  private loadWeather(): void {
    this.api.weather().subscribe({
      next: (res) => (this.weather = res.weather),
      error: () => undefined,
    });
  }

  private loadAvatar(id: string): void {
    this.api.avatar(id).subscribe({
      next: (file) => (this.session.avatarUrl = 'data:' + file.contentType + ';base64,' + file.data),
    });
  }

  private beat(): void {
    const staff = this.session.staff;
    if (!staff || this.pushingPresence) return;
    const idle = document.hidden || Date.now() - this.lastInput > 5 * 60 * 1000;
    const manualHold = staff.presenceSource === 'manual' && staff.presence !== 'online' && staff.presence !== 'away';
    if (idle && staff.presence === 'online') {
      this.pushPresence('away', '', 'auto');
      return;
    }
    if (!idle && staff.presence === 'away' && staff.presenceSource !== 'manual') {
      this.pushPresence('online', '', 'auto');
      return;
    }
    if (!idle && !manualHold) {
      if (staff.locationDue) this.confirmPlace();
      else this.api.touchSeen().subscribe({ next: (res) => (this.session.staff = res.staff), error: (error: unknown) => this.gateOut(error) });
    }
  }

  private confirmPlace(): void {
    if (this.locating || !navigator.geolocation) return;
    this.locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locating = false;
        this.api.touchSeen({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }).subscribe({
          next: (res) => (this.session.staff = res.staff),
          error: (error: unknown) => this.gateOut(error),
        });
      },
      () => {
        this.locating = false;
        sessionStorage.setItem('altamid_control_gate', 'Allow location to stay signed in. This account must be at an allowed place.');
        this.logout();
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }

  private gateOut(error: unknown): void {
    const code = apiCode(error);
    if (code !== 'location_outside' && code !== 'ip_blocked' && code !== 'ip_required') return;
    sessionStorage.setItem('altamid_control_gate', apiError(error));
    this.logout();
  }

  private pushPresence(presence: string, label: string, source: 'auto' | 'manual'): void {
    if (this.pushingPresence) return;
    this.pushingPresence = true;
    this.api.setPresence({ presence, label, source }).subscribe({
      next: (res) => {
        this.session.staff = res.staff;
        this.customLabel = res.staff.presenceLabel || this.customLabel;
        this.pushingPresence = false;
        if (source === 'manual') this.notice.success('Status set to ' + presenceName(res.staff) + '.');
      },
      error: () => (this.pushingPresence = false),
    });
  }

  private tick(): void {
    const now = new Date();
    this.clock = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    this.dateLabel = now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  private buildHits(): void {
    const q = this.query.trim().toLowerCase();
    if (!q) {
      this.hits = [];
      return;
    }
    const pages: SearchHit[] = [
      { label: 'Dashboard', hint: 'Overview', icon: 'bi-grid-1x2', link: '/', permit: 'dashboard.view' },
      { label: 'Products', hint: 'Catalog', icon: 'bi-box-seam', link: '/products', permit: 'products.view' },
      { label: 'Customers', hint: 'Subscribers', icon: 'bi-building', link: '/customers', permit: 'customers.view' },
      { label: 'Revenue', hint: 'Purchases', icon: 'bi-currency-rupee', link: '/revenue', permit: 'revenue.view' },
      { label: 'Coupons', hint: 'Offers and coupon codes', icon: 'bi-ticket-perforated', link: '/coupons', permit: 'offers.view' },
      { label: 'Connection lab', hint: 'Prove a license', icon: 'bi-plug', link: '/lab', permit: 'lab.use' },
      { label: 'Reports', hint: 'Generate a register', icon: 'bi-file-earmark-bar-graph', link: '/reports', permit: 'reports.view' },
      { label: 'Audit', hint: 'History', icon: 'bi-journal-text', link: '/audit', permit: 'audit.view' },
      { label: 'Team', hint: 'Staff access', icon: 'bi-people', link: '/team', permit: 'users.view' },
      { label: 'Roles', hint: 'Permissions', icon: 'bi-shield-lock', link: '/roles', permit: 'roles.manage' },
      { label: 'Settings', hint: 'Email, networks, and login places', icon: 'bi-gear', link: '/settings', permit: 'settings.view' },
      { label: 'User manual', hint: 'How Control works', icon: 'bi-book', link: '/manual', permit: '' },
      { label: 'Profile', hint: 'Your account', icon: 'bi-person', link: '/profile', permit: '' },
    ].filter((hit) => {
      const allowed = hit.link === '/coupons'
        ? this.can('offers.view') || this.can('coupons.view')
        : hit.link === '/settings'
          ? this.can('settings.view') || this.can('settings.manage') || this.can('settings.email')
          : !hit.permit || this.can(hit.permit);
      return allowed && (hit.label.toLowerCase().includes(q) || hit.hint.toLowerCase().includes(q));
    });
    const products = this.products
      .filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(q))
      .map((product) => ({ label: product.name, hint: 'Product', icon: 'bi-box-seam', link: '/products/' + product.code }));
    const customers = this.customers
      .filter((customer) => `${customer.name} ${customer.contactName} ${customer.contactEmail}`.toLowerCase().includes(q))
      .map((customer) => ({ label: customer.name, hint: 'Customer', icon: 'bi-building', link: '/customers/' + customer.id }));
    this.hits = [...products, ...customers, ...pages].slice(0, 8);
  }
}
