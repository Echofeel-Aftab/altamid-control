import { Component, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, SessionService } from '../core/api.service';
import { Plan, ProductCard, Release, SubscriptionBrief, apiError, can as allow, inr, pill, when } from '../core/models';
import { DataColumn, DataTableComponent, RowActionsDirective } from '../shared/data-table.component';
import { NoticeService } from '../shared/notice.component';
import { LayoutDirective } from '../shared/layout.directive';
import { SheetComponent } from '../shared/sheet.component';
import { PageGuideComponent } from '../shared/page-guide.component';

const TABS = ['connection', 'plans', 'subscribers', 'releases', 'settings'] as const;
type ProductTab = (typeof TABS)[number];

@Component({
  selector: 'app-product',
  imports: [FormsModule, RouterLink, DataTableComponent, RowActionsDirective, SheetComponent, LayoutDirective, PageGuideComponent],
  template: `
    @if (product) {
      <header class="top">
        <div>
          <p class="kicker">{{ product.code }} · key tag {{ product.keyTag }}</p>
          <h1>{{ product.name }}</h1>
          <app-page-guide />
          <p class="muted">{{ product.summary }}</p>
        </div>
        <span [class]="pill(product.status)">{{ product.status }}</span>
      </header>
      <div class="page-stack">
        @if (error && !adding && !editing && !composing) { <div class="banner bad">{{ error }}</div> }
        <nav class="product-tabs" aria-label="Product controls">
          <button type="button" class="product-tab" [class.is-active]="tab === 'connection'" (click)="open('connection')"><i class="bi bi-plug"></i> Connection</button>
          <button type="button" class="product-tab" [class.is-active]="tab === 'plans'" (click)="open('plans')"><i class="bi bi-layers"></i> Plans <span>{{ plans.length }}</span></button>
          @if (can(session.staff, 'subscriptions.view')) {
            <button type="button" class="product-tab" [class.is-active]="tab === 'subscribers'" (click)="open('subscribers')"><i class="bi bi-people"></i> Subscribers <span>{{ subscriptions.length }}</span></button>
          }
          <button type="button" class="product-tab" [class.is-active]="tab === 'releases'" (click)="open('releases')"><i class="bi bi-cloud-upload"></i> Releases <span>{{ releases.length }}</span></button>
          <button type="button" class="product-tab" [class.is-active]="tab === 'settings'" (click)="open('settings')"><i class="bi bi-sliders"></i> Settings</button>
        </nav>

        @if (tab === 'connection') {
          <div class="layout-board layout-split" appLayout="product">
            <div class="layout-col" data-layout-col="main">
            <section class="card" data-layout-box="connect">
              <h2><i class="bi bi-plug"></i> How this product will connect</h2>
              <p class="muted">Any language calls this address. The reply is a signed lease. The product obeys <code>usable</code>, not the HTTP status alone.</p>
              <div class="field">
                <label id="runtime-label">Sample runtime</label>
                <div class="runtime-pick" #runtimePick>
                  <button type="button" class="runtime-pick-btn" aria-labelledby="runtime-label" aria-haspopup="listbox" [attr.aria-expanded]="runtimeOpen" (click)="runtimeOpen = !runtimeOpen">
                    <span>{{ runtimeLabel }}</span>
                    <i class="bi bi-chevron-down"></i>
                  </button>
                  @if (runtimeOpen) {
                    <div class="runtime-pick-menu" role="listbox" aria-labelledby="runtime-label">
                      @for (group of runtimeGroups; track group) {
                        <p>{{ group }}</p>
                        @for (item of runtimesFor(group); track item.id) {
                          <button type="button" role="option" [attr.aria-selected]="runtime === item.id" [class.is-selected]="runtime === item.id" (click)="chooseRuntime(item.id)">{{ item.label }}</button>
                        }
                      }
                    </div>
                  }
                </div>
              </div>
              <pre>{{ snippet }}</pre>
              <button type="button" class="btn btn-ghost" (click)="copySnippet()"><i class="bi bi-clipboard"></i> Copy sample</button>
              <ul class="connect-layers">
                <li><i class="bi bi-hdd-network"></i> Call this from the product server. The license key never belongs in the browser.</li>
                <li><i class="bi bi-shield-check"></i> Every reply is signed. The product verifies the signature and ignores a reply that does not match.</li>
                <li><i class="bi bi-arrow-repeat"></i> A live install keeps its own check-in pace. A wrong key is slowed. A timeout keeps the last good lease. None of these is a revoke.</li>
              </ul>
            </section>
            </div>
            <div class="layout-col" data-layout-col="side">
            <section class="card" data-layout-box="state">
              <h2><i class="bi bi-hdd-network"></i> Connection state</h2>
              <p class="muted">Not connected keeps the product in the catalog. Ready means a product may start checking in. Connected means a live install is expected.</p>
              <div class="field">
                <label for="state">State</label>
                <select id="state" name="state" [(ngModel)]="connectionState" [disabled]="!manage">
                  <option value="catalog_only">Not connected</option>
                  <option value="ready">Ready to connect</option>
                  <option value="connected">Connected</option>
                </select>
              </div>
              <div class="field">
                <label for="policy">Default binding</label>
                <select id="policy" name="policy" [(ngModel)]="hostPolicy" [disabled]="!manage">
                  <option value="bind_first">Lock to the first host or device</option>
                  <option value="allowlist">Only hosts the team lists</option>
                  <option value="any">Any host</option>
                </select>
              </div>
              <p class="muted">A subscription can still override this binding. The key tag on every license is <strong>{{ product.keyTag }}</strong>.</p>
              @if (manage) {
                <button type="button" class="btn" (click)="saveState()"><i class="bi bi-check2"></i> Save connection</button>
              }
            </section>
            </div>
          </div>
        }

        @if (tab === 'plans') {
          @if (manage) {
            <div class="profile-actions">
              <button type="button" class="btn" (click)="beginPlan()"><i class="bi bi-plus-lg"></i> Add plan</button>
            </div>
          }
          <app-data-table tableId="product-plans" title="Plans" empty="No plans on this product." [rows]="plans" [columns]="planColumns">
            <ng-template appRowActions let-plan>
              @if (manage) {
                <button type="button" class="btn btn-sm btn-edit" title="Edit" (click)="editPlan(plan)"><i class="bi bi-pencil-square"></i><span class="visually-hidden">Edit</span></button>
              }
            </ng-template>
          </app-data-table>
          <app-sheet [open]="editing" [title]="'Edit ' + planName" (closed)="editing = false">
            <form class="form-card" (ngSubmit)="savePrice()">
              @if (error) { <div class="banner bad">{{ error }}</div> }
              <div class="field"><label for="plan-name">Name</label><input id="plan-name" name="planName" [(ngModel)]="planName"></div>
              <div class="field">
                <label for="plan-billing">Billing</label>
                <select id="plan-billing" name="planBilling" [(ngModel)]="planBilling">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="trial">Trial</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div class="field">
                <label for="plan-status">Status</label>
                <select id="plan-status" name="planStatus" [(ngModel)]="planStatus">
                  <option value="active">Active</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
              <div class="field"><label for="price-amount">List price, INR</label><input id="price-amount" name="priceAmount" type="number" min="0" step="1" [(ngModel)]="priceAmount"></div>
              <div class="field">
                <label for="price-basis">Charged</label>
                <select id="price-basis" name="priceBasis" [(ngModel)]="priceBasis">
                  <option value="seat">Per {{ product.seatUnit }}</option>
                  <option value="flat">Flat for the subscription</option>
                </select>
              </div>
              <div class="field"><label for="seat-cap">Seat cap</label><input id="seat-cap" name="seatCap" [(ngModel)]="seatCap" placeholder="Empty means no cap"></div>
              <div class="field wide"><label for="plan-note">Note</label><input id="plan-note" name="planNote" [(ngModel)]="planNote"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-ghost" (click)="editing = false">Cancel</button>
                <button class="btn" type="submit"><i class="bi bi-check2"></i> Save plan</button>
              </div>
            </form>
          </app-sheet>
          <app-sheet [open]="adding" title="Add a plan" (closed)="adding = false">
            <form class="form-card" (ngSubmit)="addPlan()">
              @if (error) { <div class="banner bad">{{ error }}</div> }
              <div class="field"><label for="new-plan-name">Name</label><input id="new-plan-name" name="newPlanName" [(ngModel)]="newPlan.name" placeholder="Growth"></div>
              <div class="field"><label for="new-plan-code">Code</label><input id="new-plan-code" name="newPlanCode" [(ngModel)]="newPlan.code" placeholder="growth"></div>
              <div class="field">
                <label for="new-billing">Billing</label>
                <select id="new-billing" name="newBilling" [(ngModel)]="newPlan.billingPeriod">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="trial">Trial</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div class="field"><label for="new-price">List price, INR</label><input id="new-price" name="newPrice" type="number" min="0" step="1" [(ngModel)]="newPlan.priceAmount"></div>
              <div class="field">
                <label for="new-basis">Charged</label>
                <select id="new-basis" name="newBasis" [(ngModel)]="newPlan.priceBasis">
                  <option value="seat">Per {{ product.seatUnit }}</option>
                  <option value="flat">Flat for the subscription</option>
                </select>
              </div>
              <div class="field full"><label for="new-note">Note</label><input id="new-note" name="newNote" [(ngModel)]="newPlan.priceNote"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-ghost" (click)="adding = false">Cancel</button>
                <button class="btn" type="submit"><i class="bi bi-plus-lg"></i> Add plan</button>
              </div>
            </form>
          </app-sheet>
        }

        @if (tab === 'subscribers') {
          <div class="kpi-row thirds">
            <article class="card kpi tone-teal"><div class="kpi-top"><span>Subscribers</span><span class="kpi-icon"><i class="bi bi-people"></i></span></div><div class="kpi-figure"><strong>{{ subscriptions.length }}</strong><small>On this product</small></div></article>
            <article class="card kpi tone-green"><div class="kpi-top"><span>In force</span><span class="kpi-icon"><i class="bi bi-check2-circle"></i></span></div><div class="kpi-figure"><strong>{{ inForce }}</strong><small>Active, trial, or grace</small></div></article>
            <article class="card kpi tone-gold"><div class="kpi-top"><span>Purchases</span><span class="kpi-icon"><i class="bi bi-graph-up"></i></span></div><div class="kpi-figure"><strong class="money">{{ inr(purchaseTotal) }}</strong><small>Cancelled left out</small></div></article>
          </div>
          <app-data-table tableId="product-subscribers" title="Subscribers" empty="No subscriber for this product yet." [rows]="subscriptions" [columns]="subscriberColumns">
            <ng-template appRowActions let-row>
              <a class="btn btn-sm btn-view" [routerLink]="['/subscriptions', row.id]" title="View"><i class="bi bi-eye"></i><span class="visually-hidden">View</span></a>
            </ng-template>
          </app-data-table>
        }

        @if (tab === 'releases') {
          @if (can(session.staff, 'releases.manage')) {
            <div class="profile-actions">
              <button type="button" class="btn" (click)="beginRelease()"><i class="bi bi-plus-lg"></i> New release</button>
            </div>
          }
          <app-sheet [open]="composing" title="New release" (closed)="composing = false">
            <section class="form-card">
              @if (error) { <div class="banner bad">{{ error }}</div> }
              <p class="muted">Register the version now. Package upload comes later. Publishing replaces the current version on that channel. A yanked release stays yanked.</p>
              <div class="field"><label for="version">Version</label><input id="version" name="version" [(ngModel)]="version" placeholder="1.0.0"></div>
              <div class="field">
                <label for="channel">Channel</label>
                <select id="channel" name="channel" [(ngModel)]="channel">
                  <option value="stable">Stable</option>
                  <option value="beta">Beta</option>
                  <option value="edge">Edge</option>
                </select>
              </div>
              <div class="field full"><label for="notes">Notes</label><textarea id="notes" name="notes" [(ngModel)]="notes" placeholder="What changed in this version"></textarea></div>
              <div class="form-actions">
                <button type="button" class="btn btn-ghost" (click)="composing = false">Cancel</button>
                <button type="button" class="btn" (click)="addRelease()"><i class="bi bi-save"></i> Save draft</button>
              </div>
            </section>
          </app-sheet>
          <app-data-table tableId="product-releases" title="Releases" empty="No versions registered yet." [rows]="releases" [columns]="releaseColumns">
            <ng-template appRowActions let-release>
              @if (can(session.staff, 'releases.manage') && (release.state === 'draft' || release.state === 'superseded')) {
                <button type="button" class="btn btn-sm btn-edit" title="Publish" (click)="publish(release)"><i class="bi bi-cloud-check"></i><span class="visually-hidden">Publish</span></button>
              }
              @if (can(session.staff, 'releases.manage') && release.state !== 'yanked') {
                <button type="button" class="btn btn-sm btn-delete" title="Yank" (click)="yank(release)"><i class="bi bi-slash-circle"></i><span class="visually-hidden">Yank</span></button>
              }
            </ng-template>
          </app-data-table>
        }

        @if (tab === 'settings') {
          <form class="card form-card" (ngSubmit)="saveSettings()">
            <h2><i class="bi bi-sliders"></i> Product settings</h2>
            <div class="field"><label for="code">Code</label><input id="code" [value]="product.code" disabled></div>
            <div class="field"><label for="tag">Key tag</label><input id="tag" [value]="product.keyTag" disabled></div>
            <div class="field"><label for="name">Name</label><input id="name" name="name" [(ngModel)]="profileName" [disabled]="!manage"></div>
            <div class="field">
              <label for="catalog-status">Catalog status</label>
              <select id="catalog-status" name="catalogStatus" [(ngModel)]="profileStatus" [disabled]="!manage">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="retired">Retired</option>
              </select>
            </div>
            <div class="field"><label for="seat">Seat unit</label><input id="seat" name="seat" [(ngModel)]="profileSeat" [disabled]="!manage" placeholder="user"></div>
            <div class="field full"><label for="summary">Summary</label><input id="summary" name="summary" [(ngModel)]="profileSummary" [disabled]="!manage"></div>
            <p class="muted full">The code and the key tag stay permanent. A retired or draft product cannot take a new subscription. Existing subscriptions stay as they are.</p>
            @if (manage) {
              <div class="form-actions"><button class="btn" type="submit"><i class="bi bi-check2"></i> Save settings</button></div>
            }
          </form>
        }
      </div>
    }
  `,
})
export class ProductComponent implements OnInit {
  @ViewChild('runtimePick') private runtimePick?: ElementRef<HTMLElement>;
  private readonly api = inject(ApiService);
  private readonly notice = inject(NoticeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly can = allow;
  readonly pill = pill;
  readonly inr = inr;
  readonly planColumns: DataColumn<Plan>[] = [
    { key: 'name', label: 'Plan', text: (row) => row.name, sub: (row) => row.status },
    { key: 'code', label: 'Code', text: (row) => row.code },
    { key: 'billing', label: 'Billing', text: (row) => row.billingPeriod },
    { key: 'price', label: 'List price', text: (row) => (row.priceAmount ? inr(row.priceAmount) + (row.priceBasis === 'flat' ? ' flat' : ' / seat') : 'Quote') },
    { key: 'cap', label: 'Seat cap', text: (row) => (row.seatLimit ? String(row.seatLimit) : 'No cap') },
    { key: 'note', label: 'Note', text: (row) => row.priceNote },
    { key: 'basis', label: 'Price basis', text: (row) => (row.priceBasis === 'flat' ? 'Flat' : 'Per seat'), optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];
  readonly subscriberColumns: DataColumn<SubscriptionBrief>[] = [
    { key: 'customer', label: 'Customer', text: (row) => row.customerName, link: (row) => '/subscriptions/' + row.id },
    { key: 'plan', label: 'Plan', text: (row) => row.planName },
    { key: 'status', label: 'Status', text: (row) => row.effectiveStatus, pill: true },
    { key: 'seats', label: 'Seats', text: (row) => String(row.seatsPurchased || 1) },
    { key: 'offer', label: 'Offer', text: (row) => row.offerCode || '' },
    { key: 'coupon', label: 'Coupon', text: (row) => row.couponCode || '', optional: true },
    { key: 'ends', label: 'Ends', text: (row) => row.endsAt },
    { key: 'purchase', label: 'Purchase', text: (row) => inr(row.purchaseAmount) },
    { key: 'starts', label: 'Starts', text: (row) => row.startsAt, optional: true },
    { key: 'list', label: 'List cost', text: (row) => inr(row.listAmount), optional: true },
    { key: 'discount', label: 'Discount', text: (row) => inr(row.discountAmount), optional: true },
    { key: 'stored', label: 'Account status', text: (row) => row.status, pill: true, optional: true },
    { key: 'grace', label: 'Grace days', text: (row) => String(row.graceDays ?? ''), optional: true },
    { key: 'channel', label: 'Channel', text: (row) => row.channel || '', optional: true },
    { key: 'binding', label: 'Binding', text: (row) => row.hostPolicy || '', optional: true },
    { key: 'cap', label: 'Seat limit', text: (row) => (row.seatLimit ? String(row.seatLimit) : 'No cap'), optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];
  readonly releaseColumns: DataColumn<Release>[] = [
    { key: 'version', label: 'Version', text: (row) => row.version, sub: (row) => row.channel },
    { key: 'state', label: 'State', text: (row) => row.state, pill: true },
    { key: 'published', label: 'Published', text: (row) => (row.publishedAt ? row.publishedAt.slice(0, 10) : '') },
    { key: 'notes', label: 'Notes', text: (row) => row.notes },
    { key: 'package', label: 'Package', text: (row) => (row.hasPackage ? 'Yes' : 'No'), optional: true },
    { key: 'added', label: 'Added', text: (row) => when(row.createdAt), optional: true },
    { key: 'updated', label: 'Last updated', text: (row) => when(row.updatedAt), optional: true },
  ];
  product: ProductCard | null = null;
  plans: Plan[] = [];
  releases: Release[] = [];
  subscriptions: SubscriptionBrief[] = [];
  tab: ProductTab = 'connection';
  connectionState = 'catalog_only';
  hostPolicy = 'bind_first';
  runtime = 'php';
  runtimeOpen = false;
  readonly sampleRuntimes = [
    { id: 'php', label: 'PHP', group: 'Server' },
    { id: 'laravel', label: 'Laravel', group: 'Server' },
    { id: 'node', label: 'Node.js', group: 'Server' },
    { id: 'python', label: 'Python', group: 'Server' },
    { id: 'java', label: 'Java', group: 'Server' },
    { id: 'dotnet', label: '.NET', group: 'Server' },
    { id: 'go', label: 'Go', group: 'Server' },
    { id: 'ruby', label: 'Ruby', group: 'Server' },
    { id: 'rust', label: 'Rust', group: 'Server' },
    { id: 'angular', label: 'Angular', group: 'Web' },
    { id: 'react', label: 'React', group: 'Web' },
    { id: 'browser', label: 'Browser', group: 'Web' },
    { id: 'react-native', label: 'React Native', group: 'Mobile' },
    { id: 'flutter', label: 'Flutter', group: 'Mobile' },
    { id: 'swift', label: 'Swift', group: 'Mobile' },
    { id: 'kotlin', label: 'Kotlin', group: 'Mobile' },
  ];
  version = '';
  channel = 'stable';
  notes = '';
  error = '';
  pricePlan = '';
  priceAmount = 0;
  priceBasis: 'seat' | 'flat' = 'seat';
  planName = '';
  planBilling = 'monthly';
  planStatus = 'active';
  planNote = '';
  seatCap = '';
  profileName = '';
  profileSummary = '';
  profileStatus = 'active';
  profileSeat = 'user';
  newPlan = { name: '', code: '', billingPeriod: 'monthly', priceAmount: 0, priceBasis: 'seat', priceNote: '' };
  editing = false;
  adding = false;
  composing = false;

  get manage(): boolean {
    return this.can(this.session.staff, 'products.manage');
  }

  get inForce(): number {
    return this.subscriptions.filter((row) => ['active', 'trialing', 'grace', 'past_due'].includes(row.effectiveStatus)).length;
  }

  get purchaseTotal(): number {
    return this.subscriptions
      .filter((row) => row.status !== 'cancelled' && row.status !== 'revoked')
      .reduce((sum, row) => sum + Number(row.purchaseAmount || 0), 0);
  }

  get runtimeLabel(): string {
    return this.sampleRuntimes.find((item) => item.id === this.runtime)?.label || 'PHP';
  }

  @HostListener('document:click', ['$event'])
  closeRuntime(event: MouseEvent): void {
    const root = this.runtimePick?.nativeElement;
    if (!this.runtimeOpen || !root) return;
    if (event.target instanceof Node && root.contains(event.target)) return;
    this.runtimeOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeRuntimeOnEscape(): void {
    this.runtimeOpen = false;
  }

  chooseRuntime(id: string): void {
    this.runtime = id;
    this.runtimeOpen = false;
  }

  get runtimeGroups(): string[] {
    return [...new Set(this.sampleRuntimes.map((item) => item.group))];
  }

  runtimesFor(group: string): Array<{ id: string; label: string; group: string }> {
    return this.sampleRuntimes.filter((item) => item.group === group);
  }

  get snippet(): string {
    const body = JSON.stringify(
      {
        product: this.product?.code || 'crm',
        license_key: 'AS1.' + (this.product?.keyTag || 'CRM') + '.…',
        instance_id: 'stable-id-for-this-install',
        binding: 'the-host-or-device',
        runtime: this.runtime,
        version: '1.0.0',
        usage: { seats: 1 },
      },
      null,
      2,
    );
    switch (this.runtime) {
      case 'php':
        return `$body = <<<'JSON'\n${body}\nJSON;\n$reply = json_decode(file_get_contents(getenv('CONTROL_URL') . '/v1/lease/check', false, stream_context_create([\n    'http' => ['method' => 'POST', 'header' => "Content-Type: application/json\\r\\n", 'content' => $body],\n])), true);\n$usable = (bool) ($reply['usable'] ?? false);`;
      case 'laravel':
        return `$payload = json_decode(<<<'JSON'\n${body}\nJSON, true);\n$reply = Http::acceptJson()->post(config('services.altamid.url') . '/v1/lease/check', $payload);\n$usable = (bool) $reply->json('usable');`;
      case 'node':
      case 'react':
      case 'browser':
      case 'react-native':
        return `const payload = ${body};\nconst reply = await fetch(CONTROL_URL + '/v1/lease/check', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify(payload),\n}).then((res) => res.json());\nconst usable = reply.usable === true;`;
      case 'angular':
        return `const payload = ${body};\nthis.http.post(CONTROL_URL + '/v1/lease/check', payload).subscribe((reply) => {\n  const usable = reply.usable === true;\n});`;
      case 'python':
        return `payload = ${body}\nreply = requests.post(f"{CONTROL_URL}/v1/lease/check", json=payload, timeout=15).json()\nusable = bool(reply.get("usable"))`;
      case 'java':
        return `HttpRequest request = HttpRequest.newBuilder(URI.create(controlUrl + "/v1/lease/check"))\n    .header("Content-Type", "application/json")\n    .POST(HttpRequest.BodyPublishers.ofString("""\n${body}\n""")).build();\nString reply = client.send(request, HttpResponse.BodyHandlers.ofString()).body();\nboolean usable = reply.contains("\\"usable\\":true");`;
      case 'dotnet':
        return `using var reply = await http.PostAsJsonAsync(controlUrl + "/v1/lease/check", payload);\nvar lease = await reply.Content.ReadFromJsonAsync<Lease>();\nvar usable = lease?.Usable == true;\n\n// payload\n${body}`;
      case 'go':
        return `body := []byte(\`${body}\`)\nres, err := http.Post(controlURL+"/v1/lease/check", "application/json", bytes.NewReader(body))\n// Decode the JSON reply and obey the usable field.`;
      case 'ruby':
        return `uri = URI("#{ENV['CONTROL_URL']}/v1/lease/check")\nres = Net::HTTP.post(uri, <<~JSON, 'Content-Type' => 'application/json')\n${body}\nJSON\nusable = JSON.parse(res.body)['usable'] == true`;
      case 'rust':
        return `let body = r#"${body}"#;\nlet reply = reqwest::Client::new()\n    .post(format!("{CONTROL_URL}/v1/lease/check"))\n    .header("Content-Type", "application/json")\n    .body(body)\n    .send().await?;\nlet usable = reply.json::<Value>().await?["usable"].as_bool().unwrap_or(false);`;
      case 'flutter':
        return `final payload = jsonDecode(r'''\n${body}\n''');\nfinal res = await http.post(\n  Uri.parse('$controlUrl/v1/lease/check'),\n  headers: {'Content-Type': 'application/json'},\n  body: jsonEncode(payload),\n);\nfinal usable = jsonDecode(res.body)['usable'] == true;`;
      case 'swift':
        return `var request = URLRequest(url: controlURL.appendingPathComponent("v1/lease/check"))\nrequest.httpMethod = "POST"\nrequest.setValue("application/json", forHTTPHeaderField: "Content-Type")\nrequest.httpBody = """\n${body}\n""".data(using: .utf8)\nlet (data, _) = try await URLSession.shared.data(for: request)\nlet usable = (try JSONDecoder().decode(Lease.self, from: data)).usable`;
      case 'kotlin':
        return `val body = """\n${body}\n""".trimIndent()\nval request = Request.Builder().url("$controlUrl/v1/lease/check")\n    .post(body.toRequestBody("application/json".toMediaType()))\n    .build()\nval usable = JSONObject(client.newCall(request).execute().body!!.string()).getBoolean("usable")`;
      default:
        return body;
    }
  }

  ngOnInit(): void {
    const asked = this.route.snapshot.queryParamMap.get('tab') || '';
    if ((TABS as readonly string[]).includes(asked)) this.tab = asked as ProductTab;
    this.reload();
  }

  open(tab: ProductTab): void {
    this.tab = tab;
    this.error = '';
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  reload(): void {
    const code = this.route.snapshot.paramMap.get('code') || '';
    this.api.product(code).subscribe({
      next: (res) => {
        this.product = res.product;
        this.plans = res.product.plans;
        if (this.editing && !this.plans.some((plan) => plan.code === this.pricePlan)) this.editing = false;
        this.releases = res.product.releases;
        this.connectionState = res.product.connectionState;
        this.hostPolicy = res.product.hostPolicy;
        this.profileName = res.product.name;
        this.profileSummary = res.product.summary;
        this.profileStatus = res.product.status;
        this.profileSeat = res.product.seatUnit;
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
    if (this.can(this.session.staff, 'subscriptions.view')) {
      this.api.productSubscriptions(code).subscribe({
        next: (res) => (this.subscriptions = res.items),
        error: () => undefined,
      });
    }
  }

  beginPlan(): void {
    this.error = '';
    this.editing = false;
    this.adding = true;
  }

  beginRelease(): void {
    this.error = '';
    this.composing = true;
  }

  editPlan(plan: Plan): void {
    this.error = '';
    this.adding = false;
    this.editing = true;
    this.pricePlan = plan.code;
    this.priceAmount = plan.priceAmount;
    this.priceBasis = plan.priceBasis;
    this.planName = plan.name;
    this.planBilling = plan.billingPeriod;
    this.planStatus = plan.status;
    this.planNote = plan.priceNote;
    this.seatCap = plan.seatLimit ? String(plan.seatLimit) : '';
  }

  addPlan(): void {
    if (!this.product) return;
    this.api.createPlan(this.product.code, this.newPlan).subscribe({
      next: () => {
        this.notice.success('Plan added.');
        this.newPlan = { name: '', code: '', billingPeriod: 'monthly', priceAmount: 0, priceBasis: 'seat', priceNote: '' };
        this.adding = false;
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  savePrice(): void {
    if (!this.product || !this.pricePlan) return;
    this.api
      .updatePlanPrice(this.product.code, this.pricePlan, {
        name: this.planName,
        billingPeriod: this.planBilling,
        status: this.planStatus,
        priceAmount: Number(this.priceAmount),
        priceBasis: this.priceBasis,
        priceNote: this.planNote,
        seatLimit: this.seatCap,
      })
      .subscribe({
        next: () => {
          this.notice.success('Plan saved.');
          this.editing = false;
          this.reload();
        },
        error: (error: unknown) => (this.error = apiError(error)),
      });
  }

  saveState(): void {
    if (!this.product) return;
    this.api.updateProduct(this.product.code, { connectionState: this.connectionState, hostPolicy: this.hostPolicy }).subscribe({
      next: () => {
        this.notice.success('Connection saved.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  saveSettings(): void {
    if (!this.product) return;
    this.api
      .updateProduct(this.product.code, {
        name: this.profileName,
        summary: this.profileSummary,
        status: this.profileStatus,
        seatUnit: this.profileSeat,
      })
      .subscribe({
        next: () => {
          this.notice.success('Product saved.');
          this.reload();
        },
        error: (error: unknown) => (this.error = apiError(error)),
      });
  }

  copySnippet(): void {
    const text = this.snippet;
    void navigator.clipboard.writeText(text).then(() => this.notice.success('Check-in sample copied.'));
  }

  addRelease(): void {
    if (!this.product) return;
    this.api.createRelease(this.product.code, { version: this.version, channel: this.channel, notes: this.notes }).subscribe({
      next: () => {
        this.version = '';
        this.notes = '';
        this.notice.success('Release added.');
        this.composing = false;
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  publish(release: Release): void {
    this.api.publishRelease(release.id).subscribe({
      next: () => {
        this.notice.success(release.version + ' is published.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }

  async yank(release: Release): Promise<void> {
    if (!this.can(this.session.staff, 'releases.manage') || release.state === 'yanked') return;
    const yes = await this.notice.confirm('Yank ' + release.version + '?', 'A yanked release stays yanked. Installs on that version are refused.', 'Yank');
    if (!yes) return;
    this.api.yankRelease(release.id).subscribe({
      next: () => {
        this.notice.success(release.version + ' was yanked.');
        this.reload();
      },
      error: (error: unknown) => (this.error = apiError(error)),
    });
  }
}
