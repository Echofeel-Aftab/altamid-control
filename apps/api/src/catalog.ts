export interface PlanSeed {
  code: string;
  name: string;
  billingPeriod: 'trial' | 'monthly' | 'yearly' | 'custom';
  priceNote: string;
  priceAmount: number;
  priceBasis: 'seat' | 'flat';
  sort: number;
}

export interface ProductSeed {
  code: string;
  keyTag: string;
  name: string;
  summary: string;
  seatUnit: string;
  /** Extra subscriptions can be added as outlets (branches) of one install. */
  outlets?: boolean;
  plans: PlanSeed[];
}

export function opensOutlets(productCode: string): boolean {
  return CATALOG.some((product) => product.code === productCode && product.outlets === true);
}

export const CATALOG: ProductSeed[] = [
  {
    code: 'crm',
    keyTag: 'CRM',
    name: 'Altamid CRM',
    summary: 'Track leads, deals, and customers. Never lose a follow-up again.',
    seatUnit: 'user',
    plans: [
      { code: 'trial', name: 'Free trial', billingPeriod: 'trial', priceNote: '14 days. No card required to start', priceAmount: 0, priceBasis: 'seat', sort: 0 },
      { code: 'starter', name: 'Starter', billingPeriod: 'monthly', priceNote: 'Per user / month. Pipelines, tasks, email', priceAmount: 499, priceBasis: 'seat', sort: 1 },
      { code: 'growth', name: 'Growth', billingPeriod: 'monthly', priceNote: 'Per user / month. Automation, quotations, WhatsApp, reports', priceAmount: 999, priceBasis: 'seat', sort: 2 },
      { code: 'business', name: 'Business', billingPeriod: 'monthly', priceNote: 'Per user / month. Multiple pipelines, API, roles, priority support', priceAmount: 1499, priceBasis: 'seat', sort: 3 },
    ],
  },
  {
    code: 'hrms-payroll',
    keyTag: 'HRMS',
    name: 'Altamid HRMS & Payroll',
    summary: 'Attendance, leave, payroll, and employee records in one place.',
    seatUnit: 'employee',
    outlets: true,
    plans: [
      { code: 'essentials', name: 'Essentials', billingPeriod: 'monthly', priceNote: 'Per employee / month. Records, attendance, leave', priceAmount: 149, priceBasis: 'seat', sort: 0 },
      { code: 'payroll', name: 'Payroll', billingPeriod: 'monthly', priceNote: 'Per employee / month. Full India payroll and compliance', priceAmount: 299, priceBasis: 'seat', sort: 1 },
      { code: 'enterprise', name: 'Enterprise', billingPeriod: 'custom', priceNote: 'Custom workflows, API, SSO, dedicated support', priceAmount: 0, priceBasis: 'seat', sort: 2 },
    ],
  },
  {
    code: 'shopsuite',
    keyTag: 'SHOP',
    name: 'Altamid ShopSuite',
    summary: 'Billing, POS, stock and supplier management for retail and wholesale.',
    seatUnit: 'outlet',
    plans: [
      { code: 'single-outlet', name: 'Single Outlet', billingPeriod: 'monthly', priceNote: 'Per month. One counter, full billing and stock', priceAmount: 1999, priceBasis: 'flat', sort: 0 },
      { code: 'multi-outlet', name: 'Multi-Outlet', billingPeriod: 'monthly', priceNote: 'Per outlet / month. Central dashboard and transfers', priceAmount: 1499, priceBasis: 'seat', sort: 1 },
      { code: 'distribution', name: 'Distribution', billingPeriod: 'custom', priceNote: 'Wholesale and van sales', priceAmount: 0, priceBasis: 'flat', sort: 2 },
    ],
  },
  {
    code: 'invoice-billing',
    keyTag: 'INV',
    name: 'Altamid Invoice & Billing',
    summary: 'GST-ready invoices, quotations, and payment tracking.',
    seatUnit: 'business',
    plans: [
      { code: 'free', name: 'Free', billingPeriod: 'monthly', priceNote: 'Limited invoices / month. Start without a card', priceAmount: 0, priceBasis: 'flat', sort: 0 },
      { code: 'pro', name: 'Pro', billingPeriod: 'monthly', priceNote: 'Per month. Unlimited, recurring, reminders, payment links', priceAmount: 999, priceBasis: 'flat', sort: 1 },
      { code: 'team', name: 'Team', billingPeriod: 'monthly', priceNote: 'Per month. Multiple users and businesses', priceAmount: 1999, priceBasis: 'flat', sort: 2 },
    ],
  },
  {
    code: 'projects',
    keyTag: 'PROJ',
    name: 'Altamid Projects',
    summary: 'Plan work, assign tasks, and see what is on time and what is slipping.',
    seatUnit: 'user',
    plans: [
      { code: 'starter', name: 'Starter', billingPeriod: 'monthly', priceNote: 'Per user / month. Projects, tasks, and core views', priceAmount: 399, priceBasis: 'seat', sort: 0 },
      { code: 'business', name: 'Business', billingPeriod: 'monthly', priceNote: 'Per user / month. Time tracking, Gantt, client access, budgets', priceAmount: 799, priceBasis: 'seat', sort: 1 },
    ],
  },
  {
    code: 'desk',
    keyTag: 'DESK',
    name: 'Altamid Desk',
    summary: 'A shared inbox and ticketing system for customer support.',
    seatUnit: 'agent',
    plans: [
      { code: 'team', name: 'Team', billingPeriod: 'monthly', priceNote: 'Per agent / month. Shared inbox and assignments', priceAmount: 799, priceBasis: 'seat', sort: 0 },
      { code: 'pro', name: 'Pro', billingPeriod: 'monthly', priceNote: 'Per agent / month. SLAs, automation, CSAT, knowledge base', priceAmount: 1499, priceBasis: 'seat', sort: 1 },
    ],
  },
];
