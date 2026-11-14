import { Component, DestroyRef, ElementRef, HostListener, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { guideForPath } from './page-guides';

@Component({
  selector: 'app-page-guide',
  imports: [RouterLink],
  host: { class: 'no-print' },
  template: `
    @if (guide(); as item) {
      <button type="button" class="page-guide-btn" #btn [class.is-open]="open"
        aria-label="How this page works" title="How this page works"
        [attr.aria-expanded]="open" (click)="toggle($event)">
        <i class="bi bi-info-circle"></i>
      </button>
      @if (open) {
        <div class="page-guide-panel" role="dialog" aria-labelledby="pageGuideTitle" #panel
          [style.top.px]="top" [style.left.px]="left" [style.width.px]="width">
          <div class="page-guide-head">
            <div>
              <p class="page-guide-kicker">How this works</p>
              <h2 id="pageGuideTitle">{{ item.title }}</h2>
            </div>
            <button type="button" class="page-guide-close" aria-label="Close" (click)="close($event)">&times;</button>
          </div>
          <div class="page-guide-block">
            <h3>Why use it</h3>
            <p>{{ item.why }}</p>
          </div>
          <div class="page-guide-block">
            <h3>How it helps</h3>
            <p>{{ item.helps }}</p>
          </div>
          <div class="page-guide-block page-guide-example">
            <h3>Example</h3>
            <p>{{ item.example }}</p>
          </div>
          <div class="page-guide-block">
            <h3>How to use it</h3>
            <ol class="page-guide-flow">
              @for (step of item.steps; track step) {
                <li>{{ step }}</li>
              }
            </ol>
          </div>
          <a class="page-guide-more" routerLink="/manual" (click)="open = false">Open full user manual</a>
        </div>
      }
    }
  `,
})
export class PageGuideComponent {
  private readonly router = inject(Router);
  private url = this.router.url;
  open = false;
  top = 12;
  left = 12;
  width = 360;
  private readonly button = viewChild<ElementRef<HTMLButtonElement>>('btn');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    const destroy = inject(DestroyRef);
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(destroy),
    ).subscribe(() => {
      this.url = this.router.url;
      this.open = false;
    });
    const onScroll = (event: Event) => {
      if (!this.open) return;
      const panel = this.panel()?.nativeElement;
      if (panel && event.target instanceof Node && panel.contains(event.target)) return;
      this.open = false;
    };
    document.addEventListener('scroll', onScroll, true);
    destroy.onDestroy(() => document.removeEventListener('scroll', onScroll, true));
  }

  guide() {
    return guideForPath(this.url);
  }

  toggle(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.open = !this.open;
    if (this.open) setTimeout(() => this.place());
  }

  close(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.open = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open) return;
    const target = event.target as Node | null;
    const button = this.button()?.nativeElement;
    const panel = this.panel()?.nativeElement;
    if (target && (button?.contains(target) || panel?.contains(target))) return;
    this.open = false;
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.open) this.open = false;
  }

  private place(): void {
    const button = this.button()?.nativeElement;
    const panel = this.panel()?.nativeElement;
    if (!button || !panel) return;
    const rect = button.getBoundingClientRect();
    const pad = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    this.width = Math.min(400, Math.max(280, viewportWidth - 24));
    let left = rect.left;
    if (left + this.width > viewportWidth - 12) left = Math.max(12, viewportWidth - this.width - 12);
    let top = rect.bottom + pad;
    const height = panel.offsetHeight;
    if (top + height > viewportHeight - 12 && rect.top - pad - height >= 12) top = rect.top - pad - height;
    else if (top + height > viewportHeight - 12) top = Math.max(12, viewportHeight - height - 12);
    this.top = Math.round(top);
    this.left = Math.round(left);
  }
}
