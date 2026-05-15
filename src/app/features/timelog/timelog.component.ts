import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-timelog',
  standalone: true,
  templateUrl: './timelog.component.html',
  styleUrls: ['./timelog.component.css'],
  imports: [RouterOutlet],
})
export class TimelogComponent {}
