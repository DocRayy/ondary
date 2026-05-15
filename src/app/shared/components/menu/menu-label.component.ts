import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'z-menu-label, [z-menu-label]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'class()',
    role: 'presentation',
  },
})
export class ZardMenuLabelComponent {
  readonly class = input('px-2 py-1.5 text-sm font-semibold text-tertiary-900');
}
