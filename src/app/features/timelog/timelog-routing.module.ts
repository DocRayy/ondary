import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TimelogComponent } from './timelog.component';
import { TimelogListComponent } from './pages/timelog-list/timelog-list.component';

export const TimelogRoutes: Routes = [
  {
    path: '',
    component: TimelogComponent,
    children: [
      {
        path: '',
        redirectTo: 'list',
        pathMatch: 'full',
      },
      {
        path: 'list',
        component: TimelogListComponent,
      },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(TimelogRoutes)],
  exports: [RouterModule],
})
export class TimelogRoutingModule {}
