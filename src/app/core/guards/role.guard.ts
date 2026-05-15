import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { RolePermissionService, UserRole } from '../auth/role-permission.service';

export const roleGuard: CanActivateChildFn = (route) => {
  const permission = inject(RolePermissionService);
  const router = inject(Router);
  const roles = route.data?.['roles'] as UserRole[] | undefined;

  if (!roles?.length || permission.hasRole(roles)) {
    return true;
  }

  return router.createUrlTree(['/']);
};
