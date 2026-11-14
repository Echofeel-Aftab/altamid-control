import { Component, Injectable, inject } from '@angular/core';

interface NoticeItem {
  id: number;
  text: string;
  tone: 'ok' | 'bad';
  leaving: boolean;
}

interface ConfirmAsk {
  title: string;
  text: string;
  confirm: string;
}

@Injectable({ providedIn: 'root' })
export class NoticeService {
  items: NoticeItem[] = [];
  ask: ConfirmAsk | null = null;
  private nextId = 1;
  private pending: ((yes: boolean) => void) | null = null;

  success(text: string): void {
    this.push(text, 'ok');
  }

  error(text: string): void {
    this.push(text, 'bad');
  }

  confirm(title: string, text: string, confirm = 'Delete'): Promise<boolean> {
    this.answer(false);
    return new Promise((resolve) => {
      this.pending = resolve;
      this.ask = { title, text, confirm };
    });
  }

  answer(yes: boolean): void {
    this.ask = null;
    const done = this.pending;
    this.pending = null;
    done?.(yes);
  }

  private push(text: string, tone: 'ok' | 'bad'): void {
    const id = this.nextId++;
    this.items = [...this.items, { id, text, tone, leaving: false }];
    window.setTimeout(() => {
      this.items = this.items.map((item) => (item.id === id ? { ...item, leaving: true } : item));
    }, 2800);
    window.setTimeout(() => {
      this.items = this.items.filter((item) => item.id !== id);
    }, 3200);
  }
}

@Component({
  selector: 'app-notice',
  template: `
    <div class="notice-stack" aria-live="polite">
      @for (item of notice.items; track item.id) {
        <div class="notice" [class.bad]="item.tone === 'bad'" [class.leaving]="item.leaving">
          <i class="bi" [class.bi-check-circle-fill]="item.tone === 'ok'" [class.bi-exclamation-circle-fill]="item.tone === 'bad'"></i>
          <span>{{ item.text }}</span>
        </div>
      }
    </div>
    @if (notice.ask) {
      <div class="confirm-back">
        <div class="confirm-card" role="dialog" aria-modal="true" [attr.aria-label]="notice.ask.title">
          <div class="confirm-icon"><i class="bi bi-trash"></i></div>
          <h2>{{ notice.ask.title }}</h2>
          <p>{{ notice.ask.text }}</p>
          <div class="confirm-actions">
            <button type="button" class="btn btn-ghost" (click)="notice.answer(false)">Cancel</button>
            <button type="button" class="btn btn-bad" (click)="notice.answer(true)">{{ notice.ask.confirm }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class NoticeComponent {
  readonly notice = inject(NoticeService);
}
