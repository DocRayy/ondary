import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';
import gsap from 'gsap';

@Directive({
  selector: '[appGsapModal]',
  standalone: true,
})
export class GsapModalDirective implements AfterViewInit, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private enterTween?: gsap.core.Timeline;

  ngAfterViewInit(): void {
    const element = this.elementRef.nativeElement;
    const panel = this.getPanel(element);

    this.enterTween = gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .fromTo(element, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.18 })
      .fromTo(
        panel,
        { autoAlpha: 0, y: 18, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.26 },
        '<',
      );
  }

  ngOnDestroy(): void {
    this.enterTween?.kill();

    if (typeof document === 'undefined') {
      return;
    }

    const element = this.elementRef.nativeElement;
    const clone = element.cloneNode(true) as HTMLElement;
    const panel = this.getPanel(clone);

    clone.style.pointerEvents = 'none';
    clone.style.margin = '0';
    document.body.appendChild(clone);

    gsap
      .timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: () => clone.remove(),
      })
      .to(panel, { autoAlpha: 0, y: 14, scale: 0.97, duration: 0.18 })
      .to(clone, { autoAlpha: 0, duration: 0.18 }, '<');
  }

  private getPanel(root: HTMLElement): HTMLElement {
    return (
      root.querySelector<HTMLElement>('[role="dialog"]') ||
      root.querySelector<HTMLElement>('form') ||
      root.firstElementChild as HTMLElement ||
      root
    );
  }
}
