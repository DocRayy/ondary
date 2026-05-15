import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ProjectListComponent } from './pages/project-list/project-list.component';
import { ProjectComponent } from './project.component';
import { ProjectRoutingModule } from './project-routing.module';

@NgModule({
  imports: [CommonModule, ProjectRoutingModule, ProjectComponent, ProjectListComponent],
})
export class ProjectModule {}
