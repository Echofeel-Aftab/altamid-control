import 'reflect-metadata';
import { existsSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { static as expressStatic, type NextFunction, type Request, type Response } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './http-error';

loadEnv();

function dashboardDir(): string | null {
  const candidates = [
    process.env.CONTROL_WEB_ROOT,
    join(__dirname, '../../dashboard/dist/dashboard/browser'),
    join(__dirname, '../../dashboard/dist/dashboard'),
    join(process.cwd(), 'apps/dashboard/dist/dashboard/browser'),
    join(process.cwd(), 'apps/dashboard/dist/dashboard'),
    join(process.cwd(), 'public'),
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const origin = (process.env.CONTROL_ORIGIN || 'http://localhost:4200,http://127.0.0.1:4200')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  app.enableCors({ origin, allowedHeaders: ['Content-Type', 'Authorization'] });
  app.useGlobalFilters(new AllExceptionsFilter());

  const web = dashboardDir();
  if (web) {
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/v1')) return next();
      return expressStatic(web, { index: false })(req, res, next);
    });
    expressApp.get('*', (req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith('/v1')) return next();
      res.sendFile(join(web, 'index.html'), (err) => (err ? next(err) : undefined));
    });
    console.log('Serving Control dashboard from ' + web);
  }

  const port = Number(process.env.PORT || 4100);
  await app.listen(port);
  console.log('Altamid Control API listening on http://127.0.0.1:' + port);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
