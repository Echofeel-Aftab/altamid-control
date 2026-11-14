import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-sheet',
  template: `
    @if (open) {
      <div class="sheet-back">
        <div class="sheet-card" role="dialog" aria-modal="true" [attr.aria-label]="title">
          <header class="sheet-head">
            <div>
              <h2>{{ title }}</h2>
              @if (hint) { <p>{{ hint }}</p> }
            </div>
            <button type="button" class="icon-btn" (click)="closed.emit()" aria-label="Close"><i class="bi bi-x-lg"></i></button>
          </header>
          <div class="sheet-body">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `,
})
export class SheetComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() hint = '';
  @Output() closed = new EventEmitter<void>();
}
