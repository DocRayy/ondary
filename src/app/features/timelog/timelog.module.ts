import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TimelogRoutingModule } from './timelog-routing.module';
import { TimelogComponent } from './timelog.component';
import { TimelogListComponent } from './pages/timelog-list/timelog-list.component';

@NgModule({
  imports: [CommonModule, TimelogRoutingModule, TimelogComponent, TimelogListComponent],
})
export class TimelogModule {}
