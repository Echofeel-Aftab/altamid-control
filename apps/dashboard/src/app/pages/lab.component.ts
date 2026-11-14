import { Component, inject } from '@angular/core';
import { LayoutDirective } from '../shared/layout.directive';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { apiError, pill } from '../core/models';
import { canonicalJson } from '../../../../../packages/contract/canonical';
import { AccessDecision, LeaseV1, decideAccess } from '../../../../../packages/contract/policy';
import { PageGuideComponent } from '../shared/page-guide.component';

@Component({
  selector: 'app-lab',
  imports: [FormsModule, LayoutDirective, PageGuideComponent],
  template: `
    <header class="top">
      <div>
        <p class="kicker">Prove a product before it is connected</p>
        <h1>Connection lab</h1>
        <app-page-guide />
        <p class="muted">This calls the same <code>/v1/lease/check</code> a PHP, Node, React, or mobile backend will call. <code>ok</code> means Control signed the reply. <code>usable</code> is what the product obeys.</p>
      </div>
    </header>
    <div class="page-stack">
    @if (error) { <div class="banner bad">{{ error }}</div> }
    <div class="layout-board layout-stack" appLayout="lab">
    <div class="layout-col" data-layout-col="main">
    <form class="card form-card" data-layout-box="request" (ngSubmit)="run()">
      <div class="field"><label for="product">Product code</label><input id="product" name="product" [(ngModel)]="form.product"></div>
      <div class="field wide"><label for="key">License key</label><input id="key" name="key" [(ngModel)]="form.licenseKey"></div>
      <div class="field"><label for="instance">Instance id</label><input id="instance" name="instance" [(ngModel)]="form.instanceId"></div>
      <div class="field"><label for="binding">Host or device</label><input id="binding" name="binding" [(ngModel)]="form.binding"></div>
      <div class="field"><label for="runtime">Runtime</label><input id="runtime" name="runtime" [(ngModel)]="form.runtime"></div>
      <div class="field"><label for="version">Version</label><input id="version" name="version" [(ngModel)]="form.version"></div>
      <div class="field"><label for="seats">Seats in use</label><input id="seats" name="seats" type="number" [(ngModel)]="form.seats"></div>
      <div class="form-actions"><button class="btn" type="submit" [disabled]="busy"><i class="bi bi-shield-check"></i> {{ busy ? 'Checking…' : 'Check in' }}</button></div>
    </form>
    @if (lease) {
      <section class="card" data-layout-box="result">
        <div class="card-head">
          <h2>Result</h2>
          <div class="pills">
            <span [class]="pill(lease.usable ? 'active' : 'revoked')">{{ lease.usable ? 'allow' : 'restrict' }}</span>
            <span [class]="pill(lease.verdict)">{{ lease.verdict }}</span>
          </div>
        </div>
        <p>{{ lease.message }}</p>
        <p class="muted">Signature {{ signatureOk === null ? 'could not be checked in this browser' : signatureOk ? 'verified in this browser' : 'FAILED in this browser' }}.</p>
        @if (decision) {
          <p>A product using the shared rule would <strong>{{ decision.access }}</strong> ({{ decision.reason }}).</p>
        }
        <pre>{{ pretty }}</pre>
      </section>
      <section class="card form-card" data-layout-box="offline">
        <div class="field wide"><label for="when">If Control is unreachable on</label><input id="when" name="when" type="datetime-local" [(ngModel)]="offlineAt"></div>
        <div class="form-actions"><button type="button" class="btn btn-ghost" (click)="simulate()">Simulate unreachable</button></div>
        @if (offlineDecision) {
          <p>The product would <strong>{{ offlineDecision.access }}</strong> from the stored lease ({{ offlineDecision.reason }}).</p>
        }
      </section>
    }
    </div>
    </div>
    </div>
  `,
})
export class LabComponent {
  private readonly api = inject(ApiService);
  readonly pill = pill;
  busy = false;
  error = '';
  lease: LeaseV1 | null = null;
  signatureOk: boolean | null = null;
  decision: AccessDecision | null = null;
  offlineDecision: AccessDecision | null = null;
  pretty = '';
  offlineAt = '';
  form = {
    product: 'crm',
    licenseKey: '',
    instanceId: 'lab-install-1',
    binding: 'lab.altamid.local',
    runtime: 'node',
    version: '1.0.0',
    seats: 1,
  };

  run(): void {
    this.busy = true;
    this.error = '';
    this.offlineDecision = null;
    this.api.checkLease({
      product: this.form.product,
      license_key: this.form.licenseKey,
      instance_id: this.form.instanceId,
      binding: this.form.binding,
      runtime: this.form.runtime,
      version: this.form.version,
      usage: { seats: Number(this.form.seats) },
    }).subscribe({
      next: async (res) => {
        this.lease = res.lease;
        this.pretty = JSON.stringify(res.lease, null, 2);
        this.decision = decideAccess({ now: Math.floor(Date.now() / 1000), transportFailed: false, fresh: res.lease, stored: null });
        this.signatureOk = await this.verify(res.lease, res.signature);
        this.busy = false;
      },
      error: (error: unknown) => {
        this.error = apiError(error);
        this.busy = false;
      },
    });
  }

  simulate(): void {
    if (!this.lease || !this.offlineAt) return;
    const now = Math.floor(new Date(this.offlineAt).getTime() / 1000);
    this.offlineDecision = decideAccess({ now, transportFailed: true, fresh: null, stored: this.lease });
  }

  private async verify(lease: LeaseV1, signature: string): Promise<boolean | null> {
    try {
      const keys = await new Promise<Array<{ publicKeyRaw: string; status: string }>>((resolve, reject) => {
        this.api.publicKeys().subscribe({ next: (res) => resolve(res.keys), error: (error: unknown) => reject(error) });
      });
      const current = keys.find((item) => item.status === 'current') || keys[0];
      if (!current) return null;
      const algorithm = { name: 'Ed25519' } as AlgorithmIdentifier;
      const key = await crypto.subtle.importKey('raw', base64UrlToBytes(current.publicKeyRaw), algorithm, false, ['verify']);
      return crypto.subtle.verify(algorithm, key, base64UrlToBytes(signature), new TextEncoder().encode(canonicalJson(lease)));
    } catch {
      return null;
    }
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
