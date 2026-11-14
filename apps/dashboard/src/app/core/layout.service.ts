import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService, SessionService } from './api.service';

export type PageLayout = Record<string, string[]>;

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly memory = new Map<string, PageLayout>();
  private readonly dirty = new Set<string>();
  private flight: Promise<void> | null = null;
  private loaded = false;

  read(page: string): PageLayout | null {
    if (this.memory.has(page)) return this.memory.get(page) || null;
    const local = this.readLocal(page);
    if (local) this.memory.set(page, local);
    return local;
  }

  ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    if (!this.flight) {
      this.flight = firstValueFrom(this.api.layouts())
        .then((res) => {
          const remote = res.layouts || {};
          for (const [page, cols] of Object.entries(remote)) {
            if (this.dirty.has(page)) continue;
            this.memory.set(page, cols);
            this.writeLocal(page, cols);
          }
          for (const page of this.localPages()) {
            if (remote[page] || this.dirty.has(page)) continue;
            const cols = this.readLocal(page);
            if (!cols) continue;
            this.memory.set(page, cols);
            this.api.saveLayout(page, cols).subscribe({ error: () => undefined });
          }
          this.loaded = true;
        })
        .catch(() => {
          this.flight = null;
        });
    }
    return this.flight;
  }

  save(page: string, cols: PageLayout): void {
    this.dirty.add(page);
    this.memory.set(page, cols);
    this.writeLocal(page, cols);
    this.api.saveLayout(page, cols).subscribe({ error: () => undefined });
  }

  reset(page: string): void {
    this.dirty.add(page);
    this.memory.delete(page);
    localStorage.removeItem(this.storageKey(page));
    this.api.resetLayout(page).subscribe({
      next: () => this.dirty.delete(page),
      error: () => undefined,
    });
  }

  private storageKey(page: string): string {
    return `altamid_control_layout_${this.session.staff?.id || 'me'}_${page}`;
  }

  private readLocal(page: string): PageLayout | null {
    try {
      const raw = localStorage.getItem(this.storageKey(page));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PageLayout;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeLocal(page: string, cols: PageLayout): void {
    localStorage.setItem(this.storageKey(page), JSON.stringify(cols));
  }

  private localPages(): string[] {
    const prefix = `altamid_control_layout_${this.session.staff?.id || 'me'}_`;
    const pages: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i) || '';
      if (key.startsWith(prefix)) pages.push(key.slice(prefix.length));
    }
    return pages;
  }
}
