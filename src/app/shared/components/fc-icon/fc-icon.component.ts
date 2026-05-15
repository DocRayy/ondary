import { Component, effect, inject, model, signal } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';
import { FcIconService } from './fc-icon.service';
import { ICON_DEFINITIONS, IconDefinition } from './icon.constant';

@Component({
  selector: 'fc-icon',
  imports: [],
  standalone: true,
  template: '',
  host: {
    class: 'fc-icon aspect-square',
    '[innerHTML]': 'svgContent()',
    '[style.display]': '"inline-block"',
  },
  styles: [
    `
      :host {
        line-height: 0;
      }
      :host ::ng-deep svg {
        width: 1em;
        height: 1em;
      }
    `,
  ],
})
export class FcIconComponent {
  private iconService = inject(FcIconService);

  icon = model.required<IconDefinition>();
  title = model<string>();

  readonly svgContent = signal<SafeHtml | null>(null);

  constructor() {
    effect(() => {
      const iconPath = ICON_DEFINITIONS[this.icon()];
      this.iconService.getSvg(iconPath).subscribe((svg) => {
        this.svgContent.set(svg);
      });
    });
  }
}
