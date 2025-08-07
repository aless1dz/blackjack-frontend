import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError, of, map } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../models/user.model';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private tokenKey = 'blackjack_token';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
  }

  initializeAuth(): Observable<User | null> {
    const token = localStorage.getItem(this.tokenKey);
    if (token) {
      return this.getProfile().pipe(
        tap(user => {
          this.currentUserSubject.next(user);
        }),
        catchError(error => {
          this.logout();
          return of(null);
        })
      );
    } else {
      return of(null);
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials)
      .pipe(
        tap(response => {
          localStorage.setItem(this.tokenKey, response.token.value);
          
          this.currentUserSubject.next(response.user);
        }),
        catchError(error => {
          console.error('Login failed:', error);
          throw error;
        })
      );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, data)
      .pipe(
        tap(response => {

          localStorage.setItem(this.tokenKey, response.token.value);
          
          this.currentUserSubject.next(response.user);
        }),
        catchError(error => {
          console.error('Registration failed:', error);
          throw error;
        })
      );
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.currentUserSubject.next(null);
  }

  getProfile(): Observable<User> {
    return this.http.get<{user: User}>(`${this.apiUrl}/auth/me`).pipe(
      map(response => response.user),

    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const isAuth = !!token;
    return isAuth;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  setCurrentUser(user: User | null): void {
    this.currentUserSubject.next(user);
  }
}
