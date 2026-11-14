import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { readToken } from './api.service';

export const authGuard: CanActivateFn = () => {
  if (readToken()) return true;
  return inject(Router).createUrlTree(['/login']);
};
