import { Component, ElementRef, Input, OnDestroy, ViewChild, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-password',
  template: `
    <span class="secret">
      <input
        #field
        [id]="inputId"
        [name]="inputName"
        [attr.type]="shown ? 'text' : 'password'"
        (input)="change($any($event.target).value)"
        (change)="change($any($event.target).value)"
        (animationstart)="filled($event)"
        (blur)="touched()"
        [placeholder]="placeholder"
        [attr.autocomplete]="autocomplete"
        [attr.minlength]="minlength"
        [required]="required"
        [disabled]="disabled"
      >
      <button type="button" class="secret-eye" (click)="shown = !shown" [attr.aria-pressed]="shown" [attr.aria-controls]="inputId || null" [attr.aria-label]="shown ? 'Hide password' : 'Show password'">
        <i class="bi" [class.bi-eye]="!shown" [class.bi-eye-slash]="shown"></i>
      </button>
    </span>
  `,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordComponent), multi: true }],
})
export class PasswordComponent implements ControlValueAccessor, OnDestroy {
  @ViewChild('field') field?: ElementRef<HTMLInputElement>;
  @Input() inputId = '';
  @Input() inputName = '';
  @Input() placeholder = '';
  @Input() autocomplete = 'current-password';
  @Input() minlength: number | null = null;
  @Input() required = false;
  shown = false;
  value = '';
  disabled = false;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private readonly syncOnSubmit = (event: Event): void => {
    const input = this.field?.nativeElement;
    const form = event.target;
    if (!input || !(form instanceof HTMLFormElement) || !form.contains(input)) return;
    if (input.value !== this.value) this.change(input.value);
  };

  constructor() {
    document.addEventListener('submit', this.syncOnSubmit, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('submit', this.syncOnSubmit, true);
  }

  filled(event: Event): void {
    if ((event as AnimationEvent).animationName !== 'autofill-start') return;
    const input = event.target as HTMLInputElement | null;
    if (input && input.value !== this.value) this.change(input.value);
  }

  writeValue(value: string | null): void {
    this.value = value || '';
    const input = this.field?.nativeElement;
    if (input && input.value !== this.value) input.value = this.value;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  change(value: string): void {
    this.value = value;
    this.onChange(value);
  }

  touched(): void {
    this.onTouched();
  }
}
