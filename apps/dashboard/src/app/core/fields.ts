import { NgForm } from '@angular/forms';

const NAMES: Record<string, string> = {
  name: 'Name',
  company: 'Company',
  email: 'Email',
  support: 'Support email',
  phone: 'Phone',
  website: 'Website',
  offerName: 'Name',
  offerCode: 'Code',
  offerValue: 'Discount',
  offerStart: 'Start date',
  offerEnd: 'End date',
  offerProduct: 'Product',
  couponName: 'Name',
  couponCode: 'Code',
  couponValue: 'Discount',
  couponStart: 'Start date',
  couponEnd: 'End date',
  couponProduct: 'Product',
  smtpLabel: 'Label',
  smtpUser: 'Username',
  smtpHost: 'Host',
  smtpPort: 'Port',
  smtpFrom: 'From email',
  smtpTest: 'Test email',
  code: 'Code',
  tag: 'Key tag',
  seat: 'Seat unit',
  planName: 'Opening plan',
  planCode: 'Plan code',
  price: 'List price',
  password: 'Password',
  start: 'Start date',
  end: 'End date',
  grace: 'Grace days',
  bought: 'Seats purchased',
  max: 'Install limit',
  channel: 'Channel',
  ruleValue: 'IP or range',
  placeName: 'Name',
  placeLat: 'Latitude',
  placeLng: 'Longitude',
  placeRadius: 'Radius',
  overrideReason: 'Reason',
};

export function formError(form: NgForm): string {
  if (!form.invalid) return '';
  form.control.markAllAsTouched();
  for (const key of Object.keys(form.controls)) {
    const control = form.controls[key];
    if (!control.invalid || control.disabled) continue;
    const errors = control.errors || {};
    const label = NAMES[key] || 'This field';
    if (errors['required']) return label + ' is required.';
    if (errors['email'] || ((key === 'email' || key === 'support' || key === 'smtpFrom' || key === 'smtpTest') && errors['pattern'])) {
      return 'Enter a valid email.';
    }
    if (errors['minlength']) {
      const need = Number((errors['minlength'] as { requiredLength?: number }).requiredLength || 2);
      return label + ' must be at least ' + need + ' characters.';
    }
    if (errors['pattern']) {
      const pattern = String((errors['pattern'] as { requiredPattern?: string }).requiredPattern || '');
      if (key === 'phone') return 'Enter a phone number, or leave it blank.';
      if (key === 'website') return 'Website must start with http:// or https://.';
      if (pattern.includes('{6}')) return 'Enter the 6-digit code from the email.';
      if (key === 'tag') return 'Key tag must be 2 to 8 letters, such as FIELD.';
      if (key === 'channel' || key === 'seat') return label + ' must be a short code.';
      return 'Use a short code such as diwali-20.';
    }
    if (errors['min'] || errors['max']) return 'Check ' + label.toLowerCase() + '.';
    return 'Check ' + label.toLowerCase() + '.';
  }
  return 'Check the highlighted fields.';
}
