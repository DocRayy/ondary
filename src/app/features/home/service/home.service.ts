import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '@app/core/auth/auth.service';
import { environment } from '../../../../environments/environment';
import { ApiCollectionResponse, UserRelatedRecord } from '../schema/home.schema';

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly apiUrl = environment.API_URL;

  getCollection<T extends UserRelatedRecord = UserRelatedRecord>(endpoint: string) {
    return this.http
      .get<ApiCollectionResponse<T>>(`${this.apiUrl}${endpoint}`, {
        headers: this.createAuthHeaders(),
      })
      .pipe(
        map((response) => this.normalizeCollection(response)),
        catchError(() => of([] as T[])),
      );
  }

  private normalizeCollection<T extends UserRelatedRecord>(
    response: ApiCollectionResponse<T>,
  ): T[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (!response) {
      return [];
    }

    if (Array.isArray(response.data)) {
      return response.data;
    }

    if (Array.isArray(response.items)) {
      return response.items;
    }

    if (Array.isArray(response.results)) {
      return response.results;
    }

    return [];
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}
