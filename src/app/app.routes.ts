import { Routes } from '@angular/router';
import { authChildGuard, authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { AuthRoutes } from './features/auth/auth.route';
import { LayoutRoutes } from './layout/layout.routes';

export const routes: Routes = [
  ...AuthRoutes,
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    canActivate: [authGuard],
    canActivateChild: [authChildGuard, roleGuard],
    children: [...LayoutRoutes],
  },

  {
    path: '**',
    redirectTo: '',
    pathMatch: 'full',
  },
];
