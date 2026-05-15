import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, shareReplay } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class FcIconService {
  private svgCache = new Map<string, Observable<SafeHtml>>();
  constructor(
    private http: HttpClient,
    private sanitizer: DomSanitizer,
  ) {}
  getSvg(iconPath: string): Observable<SafeHtml> {
    if (this.svgCache.has(iconPath)) {
      return this.svgCache.get(iconPath)!;
    }
    const svg$ = this.http.get(iconPath, { responseType: 'text' }).pipe(
      map((svg) => this.sanitizer.bypassSecurityTrustHtml(svg)),
      shareReplay(1), // ensures one network request and caching
    );
    this.svgCache.set(iconPath, svg$);
    return svg$;
  }
}
