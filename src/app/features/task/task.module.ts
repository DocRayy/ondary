import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { TaskListComponent } from './pages/task-list/task-list.component';
import { TaskRoutingModule } from './task-routing.module';
import { TaskComponent } from './task.component';

@NgModule({
  imports: [CommonModule, TaskRoutingModule, TaskComponent, TaskListComponent],
})
export class TaskModule {}
