import { Routes } from '@angular/router';

export const LayoutRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('../features/home/pages/home.component').then((m) => m.HomeComponent),
    data: { roles: ['member', 'admin', 'manager'] },
  },
  {
    path: 'task',
    loadChildren: () => import('../features/task/task.module').then((m) => m.TaskModule),
    data: { roles: ['member', 'manager'] },
  },
  {
    path: 'timelog',
    loadChildren: () =>
      import('../features/timelog/timelog-routing.module').then((m) => m.TimelogRoutes),
    data: { roles: ['member', 'manager'] },
  },
  {
    path: 'projects',
    loadChildren: () => import('../features/project/project.module').then((m) => m.ProjectModule),
    data: { roles: ['manager'] },
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('../features/reports/pages/my-reports.component').then((m) => m.MyReportsComponent),
    data: { roles: ['member', 'manager'] },
  },
  {
    path: 'members/list',
    loadComponent: () =>
      import('../features/members/pages/team-members.component').then(
        (m) => m.TeamMembersComponent,
      ),
    data: { roles: ['member', 'admin', 'manager'] },
  },
  {
    path: 'members/add',
    loadComponent: () =>
      import('../features/members/pages/member-add/member-add.component').then(
        (m) => m.MemberAddComponent,
      ),
    data: { roles: ['admin', 'manager'] },
  },
  {
    path: 'dashboard',
    redirectTo: '',
    pathMatch: 'full',
  },
];
