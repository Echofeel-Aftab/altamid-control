import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from './database.service';
import { ControlService } from './control.service';
import { readGeo, SettingsService } from './settings.service';
import { SigningService } from './signing.service';

@Controller('v1')
export class ControlController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ControlService) private readonly control: ControlService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(SigningService) private readonly signing: SigningService,
  ) {}

  @Get('health')
  async health(): Promise<Record<string, unknown>> {
    await this.db.one('SELECT 1 AS ok');
    return { ok: true, service: 'altamid-control', contractVersion: 1, time: new Date().toISOString() };
  }

  @Get('keys')
  async keys(): Promise<Record<string, unknown>> {
    return { ok: true, keys: await this.signing.publicKeys() };
  }

  @Post('lease/check')
  async check(@Body() body: unknown, @Req() req: Request): Promise<Record<string, unknown>> {
    const signed = await this.control.checkLease(body, clientIp(req));
    return { ok: true, ...signed };
  }

  @Post('auth/login')
  async login(@Body() body: { email?: string; password?: string; remember?: boolean; lat?: number; lng?: number; accuracy?: number }, @Req() req: Request): Promise<Record<string, unknown>> {
    const result = await this.control.login(String(body?.email || ''), String(body?.password || ''), clientIp(req), readGeo(body), body?.remember === true);
    return { ok: true, ...result };
  }

  @Post('auth/forgot')
  async forgot(@Body() body: { email?: string }): Promise<Record<string, unknown>> {
    await this.control.forgotPassword(String(body?.email || ''));
    return { ok: true };
  }

  @Post('auth/reset')
  async reset(@Body() body: { email?: string; code?: string; password?: string }, @Req() req: Request): Promise<Record<string, unknown>> {
    await this.control.resetPassword(String(body?.email || ''), String(body?.code || ''), String(body?.password || ''), clientIp(req));
    return { ok: true };
  }

  @Get('auth/me')
  async me(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    return { ok: true, staff: await this.control.requireStaff(authorization) };
  }

  @Get('overview')
  async overview(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'dashboard.view');
    return { ok: true, ...(await this.control.overview()) };
  }

  @Get('products')
  async products(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'products.view');
    return { ok: true, items: await this.control.listProducts() };
  }

  @Post('products')
  async createProduct(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'products.manage');
    return { ok: true, product: await this.control.createProduct(staff, body || {}, clientIp(req)) };
  }

  @Post('products/:code/plans')
  async createPlan(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'products.manage');
    return { ok: true, product: await this.control.createPlan(staff, code, body || {}, clientIp(req)) };
  }

  @Get('products/:code')
  async product(@Headers('authorization') authorization: string | undefined, @Param('code') code: string): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'products.view');
    return { ok: true, product: await this.control.getProduct(code) };
  }

  @Patch('products/:code')
  async updateProduct(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'products.manage');
    return { ok: true, product: await this.control.updateProduct(staff, code, body || {}, clientIp(req)) };
  }

  @Patch('products/:code/plans/:planCode')
  async updatePlanPrice(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Param('planCode') planCode: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'products.manage');
    return { ok: true, product: await this.control.updatePlanPrice(staff, code, planCode, body || {}, clientIp(req)) };
  }

  @Get('products/:code/subscriptions')
  async productSubscriptions(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
  ): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'subscriptions.view');
    return { ok: true, items: await this.control.listSubscriptions(code) };
  }

  @Post('products/:code/releases')
  async createRelease(
    @Headers('authorization') authorization: string | undefined,
    @Param('code') code: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'releases.manage');
    return { ok: true, product: await this.control.createRelease(staff, code, body || {}, clientIp(req)) };
  }

  @Post('releases/:id/publish')
  async publish(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') releaseId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'releases.manage');
    return { ok: true, product: await this.control.publishRelease(staff, releaseId, clientIp(req)) };
  }

  @Post('releases/:id/yank')
  async yank(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') releaseId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'releases.manage');
    return { ok: true, product: await this.control.yankRelease(staff, releaseId, clientIp(req)) };
  }

  @Get('customers')
  async customers(
    @Headers('authorization') authorization: string | undefined,
    @Query('q') q = '',
    @Query('status') status = 'active',
  ): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'customers.view');
    return { ok: true, items: await this.control.listCustomers(q, status) };
  }

  @Post('customers')
  async createCustomer(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'customers.manage');
    return { ok: true, customer: await this.control.createCustomer(staff, body || {}, clientIp(req)) };
  }

  @Get('customers/:id')
  async customer(@Headers('authorization') authorization: string | undefined, @Param('id') customerId: string): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'customers.view');
    return { ok: true, customer: await this.control.getCustomer(customerId) };
  }

  @Patch('customers/:id')
  async updateCustomer(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') customerId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'customers.manage');
    return { ok: true, customer: await this.control.updateCustomer(staff, customerId, body || {}, clientIp(req)) };
  }

  @Post('subscriptions')
  async createSubscription(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'subscriptions.manage');
    return { ok: true, subscription: await this.control.createSubscription(staff, body || {}, clientIp(req)) };
  }

  @Get('subscriptions/:id')
  async subscription(@Headers('authorization') authorization: string | undefined, @Param('id') subId: string): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'subscriptions.view');
    return { ok: true, subscription: await this.control.getSubscription(subId) };
  }

  @Patch('subscriptions/:id')
  async updateSubscription(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') subId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'subscriptions.manage');
    return { ok: true, subscription: await this.control.updateSubscription(staff, subId, body || {}, clientIp(req)) };
  }

  @Post('subscriptions/:id/keys')
  async issueKey(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') subId: string,
    @Body() body: { label?: string },
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'licenses.manage');
    return { ok: true, ...(await this.control.issueKey(staff, subId, String(body?.label || ''), clientIp(req))) };
  }

  @Post('subscriptions/:id/keys/:keyId/revoke')
  async revokeKey(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') subId: string,
    @Param('keyId') keyId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'licenses.manage');
    return { ok: true, subscription: await this.control.revokeKey(staff, subId, keyId, clientIp(req)) };
  }

  @Post('subscriptions/:id/reset-binding')
  async resetBinding(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') subId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'licenses.manage');
    return { ok: true, subscription: await this.control.resetBinding(staff, subId, clientIp(req)) };
  }

  @Get('revenue')
  async revenue(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'revenue.view');
    return { ok: true, ...(await this.control.revenue()) };
  }

  @Get('offers')
  async offers(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'offers.view');
    return { ok: true, items: await this.control.listOffers() };
  }

  @Post('offers')
  async createOffer(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'offers.create');
    return { ok: true, offer: await this.control.createOffer(staff, body || {}, clientIp(req)) };
  }

  @Post('offers/:id/release')
  async releaseOffer(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') offerId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'offers.update');
    return { ok: true, offer: await this.control.setOfferStatus(staff, offerId, 'released', clientIp(req)) };
  }

  @Post('offers/:id/end')
  async endOffer(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') offerId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'offers.delete');
    return { ok: true, offer: await this.control.setOfferStatus(staff, offerId, 'ended', clientIp(req)) };
  }

  @Patch('offers/:id')
  async updateOffer(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') offerId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'offers.update');
    return { ok: true, offer: await this.control.updateOffer(staff, offerId, body || {}, clientIp(req)) };
  }

  @Post('offers/:id/delete')
  async deleteOffer(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') offerId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'offers.delete');
    return { ok: true, ...(await this.control.deleteOffer(staff, offerId, clientIp(req))) };
  }

  @Get('coupons')
  async coupons(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'coupons.view');
    return { ok: true, items: await this.control.listCoupons() };
  }

  @Post('coupons')
  async createCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'coupons.create');
    return { ok: true, coupon: await this.control.createCoupon(staff, body || {}, clientIp(req)) };
  }

  @Patch('coupons/:id')
  async updateCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') couponId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'coupons.update');
    return { ok: true, coupon: await this.control.updateCoupon(staff, couponId, body || {}, clientIp(req)) };
  }

  @Post('coupons/:id/release')
  async releaseCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') couponId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'coupons.update');
    return { ok: true, coupon: await this.control.setCouponStatus(staff, couponId, 'released', clientIp(req)) };
  }

  @Post('coupons/:id/delete')
  async deleteCoupon(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') couponId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'coupons.delete');
    return { ok: true, ...(await this.control.deleteCoupon(staff, couponId, clientIp(req))) };
  }

  @Get('reports/:type')
  async report(
    @Headers('authorization') authorization: string | undefined,
    @Param('type') type: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'reports.view');
    return { ok: true, report: await this.control.report(type, String(from || ''), String(to || '')) };
  }

  @Get('audit')
  async audit(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'audit.view');
    return { ok: true, items: await this.control.auditLog() };
  }

  @Get('staff')
  async staff(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'users.view');
    return { ok: true, items: await this.control.listStaff() };
  }

  @Post('staff')
  async createStaff(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'users.manage');
    return { ok: true, staff: await this.control.createStaff(staff, body || {}, clientIp(req)) };
  }

  @Patch('staff/:id')
  async updateStaff(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') staffId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'users.manage');
    return { ok: true, staff: await this.control.updateStaff(staff, staffId, body || {}, clientIp(req)) };
  }

  @Get('staff/:id')
  async staffOne(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') staffId: string,
  ): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'users.view');
    return { ok: true, staff: await this.control.getStaff(staffId) };
  }

  @Get('staff/:id/avatar')
  async staffAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') staffId: string,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, ...(await this.control.avatarData(staff, staffId)) };
  }

  @Post('staff/:id/delete')
  async deleteStaff(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') staffId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'users.manage');
    await this.control.deleteStaff(staff, staffId, clientIp(req));
    return { ok: true };
  }

  @Patch('me')
  async updateMe(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, staff: await this.control.updateProfile(staff, body || {}, clientIp(req)) };
  }

  @Post('me/otp')
  async sendProfileOtp(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, ...(await this.control.sendProfileOtp(staff)) };
  }

  @Post('me/password')
  async changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    await this.control.changePassword(staff, body || {}, clientIp(req));
    return { ok: true };
  }

  @Post('me/avatar')
  async saveAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, staff: await this.control.saveAvatar(staff, body || {}, clientIp(req)) };
  }

  @Post('me/avatar/remove')
  async clearAvatar(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, staff: await this.control.clearAvatar(staff, body || {}, clientIp(req)) };
  }

  @Post('me/presence')
  async setPresence(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, staff: await this.control.setPresence(staff, body || {}) };
  }

  @Get('me/layouts')
  async layouts(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, layouts: await this.control.listLayouts(staff) };
  }

  @Put('me/layouts/:page')
  async saveLayout(
    @Headers('authorization') authorization: string | undefined,
    @Param('page') page: string,
    @Body() body: { cols?: unknown },
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, cols: await this.control.saveLayout(staff, page, body?.cols) };
  }

  @Delete('me/layouts/:page')
  async resetLayout(
    @Headers('authorization') authorization: string | undefined,
    @Param('page') page: string,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    await this.control.resetLayout(staff, page);
    return { ok: true };
  }

  @Post('me/seen')
  async touchSeen(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { lat?: number; lng?: number; accuracy?: number },
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization);
    return { ok: true, staff: await this.control.touchSeen(staff, clientIp(req), readGeo(body)) };
  }

  @Get('roles')
  async roles(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireAny(authorization, ['users.view', 'roles.manage']);
    return { ok: true, items: await this.control.listRoles() };
  }

  @Post('roles')
  async createRole(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'roles.manage');
    return { ok: true, ...(await this.control.createRole(staff, body || {}, clientIp(req))) };
  }

  @Get('roles/:id')
  async role(@Headers('authorization') authorization: string | undefined, @Param('id') roleId: string): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'roles.manage');
    return { ok: true, ...(await this.control.getRole(roleId)) };
  }

  @Patch('roles/:id')
  async updateRole(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') roleId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'roles.manage');
    return { ok: true, ...(await this.control.updateRole(staff, roleId, body || {}, clientIp(req))) };
  }

  @Post('roles/:id/delete')
  async deleteRole(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') roleId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'roles.manage');
    await this.control.deleteRole(staff, roleId, clientIp(req));
    return { ok: true };
  }

  @Get('weather')
  async weather(@Headers('authorization') authorization: string | undefined): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization);
    return { ok: true, weather: await this.settings.weather() };
  }

  @Get('settings')
  async settingsSnapshot(@Headers('authorization') authorization: string | undefined, @Req() req: Request): Promise<Record<string, unknown>> {
    await this.control.requireAny(authorization, ['settings.view', 'settings.manage', 'settings.email']);
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Patch('settings/general')
  async saveGeneral(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.saveGeneral(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Patch('settings/ip-mode')
  async saveIpMode(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.saveIpMode(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/ip-rules')
  async addIpRule(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.addIpRule(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/ip-rules/:id/delete')
  async deleteIpRule(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') ruleId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.deleteIpRule(staff.id, ruleId, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Patch('settings/location')
  async saveLocationSettings(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.saveLocation(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/places')
  async savePlace(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.savePlace(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/places/:id/delete')
  async deletePlace(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') placeId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.deletePlace(staff.id, placeId, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/overrides')
  async addOverride(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.addOverride(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/overrides/:id/delete')
  async deleteOverride(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') overrideId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.manage');
    await this.settings.deleteOverride(staff.id, overrideId, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/smtp')
  async saveSmtp(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.email');
    await this.settings.saveSmtp(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/smtp/:id/delete')
  async deleteSmtp(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') accountId: string,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.email');
    await this.settings.deleteSmtp(staff.id, accountId, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }

  @Post('settings/smtp/:id/test')
  async testSmtp(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') accountId: string,
    @Body() body: { to?: string },
  ): Promise<Record<string, unknown>> {
    await this.control.requireStaff(authorization, 'settings.email');
    await this.settings.testSmtp(accountId, String(body?.to || ''));
    return { ok: true };
  }

  @Patch('settings/smtp-purposes')
  async savePurposes(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const staff = await this.control.requireStaff(authorization, 'settings.email');
    await this.settings.savePurposes(staff.id, body || {}, clientIp(req));
    return { ok: true, settings: await this.settings.snapshot(clientIp(req)) };
  }
}

function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
}
