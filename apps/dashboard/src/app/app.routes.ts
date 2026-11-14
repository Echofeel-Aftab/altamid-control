import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';
import { AuditComponent } from './pages/audit.component';
import { CustomerComponent } from './pages/customer.component';
import { CustomersComponent } from './pages/customers.component';
import { LabComponent } from './pages/lab.component';
import { LoginComponent } from './pages/login.component';
import { ManualComponent } from './pages/manual.component';
import { OverviewComponent } from './pages/overview.component';
import { ProfileComponent } from './pages/profile.component';
import { ProductComponent } from './pages/product.component';
import { ReportComponent } from './pages/report.component';
import { CouponsComponent } from './pages/coupons.component';
import { RevenueComponent } from './pages/revenue.component';
import { ReportsComponent } from './pages/reports.component';
import { ProductsComponent } from './pages/products.component';
import { SubscriptionComponent } from './pages/subscription.component';
import { RoleComponent } from './pages/role.component';
import { SettingsComponent } from './pages/settings.component';
import { RolesComponent } from './pages/roles.component';
import { TeamComponent } from './pages/team.component';
import { TeammateComponent } from './pages/teammate.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', component: OverviewComponent },
      { path: 'products', component: ProductsComponent },
      { path: 'products/:code', component: ProductComponent },
      { path: 'customers', component: CustomersComponent },
      { path: 'revenue', component: RevenueComponent },
      { path: 'coupons', component: CouponsComponent },
      { path: 'customers/:id', component: CustomerComponent },
      { path: 'subscriptions/:id', component: SubscriptionComponent },
      { path: 'lab', component: LabComponent },
      { path: 'reports', component: ReportsComponent },
      { path: 'reports/:type', component: ReportComponent },
      { path: 'audit', component: AuditComponent },
      { path: 'team', component: TeamComponent },
      { path: 'team/new', component: TeammateComponent },
      { path: 'team/:id', component: TeammateComponent },
      { path: 'roles', component: RolesComponent },
      { path: 'roles/:id', component: RoleComponent },
      { path: 'settings', component: SettingsComponent },
      { path: 'settings/:tab', component: SettingsComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'manual', component: ManualComponent },
    ],
  },
];
