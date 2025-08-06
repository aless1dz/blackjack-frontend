import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError, of, map } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3334/api';
  private tokenKey = 'blackjack_token';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // No cargar token automáticamente en el constructor
    console.log('AuthService initialized');
  }

  // Método para inicializar y verificar token
  initializeAuth(): Observable<User | null> {
    const token = localStorage.getItem(this.tokenKey);
    if (token) {
      console.log('Token found, verifying...');
      return this.getProfile().pipe(
        tap(user => {
          console.log('User profile loaded:', user);
          this.currentUserSubject.next(user);
        }),
        catchError(error => {
          console.log('Token verification failed:', error);
          this.logout();
          return of(null);
        })
      );
    } else {
      console.log('No token found');
      return of(null);
    }
  }

  login(credentials: LoginRequest): Observable<AuthResponse> {
    console.log('Attempting login...', credentials);
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, credentials)
      .pipe(
        tap(response => {
          console.log('Login successful:', response);
          console.log('Token received:', response.token.value);
          localStorage.setItem(this.tokenKey, response.token.value);
          
          // Establecer el usuario directamente desde la respuesta
          this.currentUserSubject.next(response.user);
        }),
        catchError(error => {
          console.error('Login failed:', error);
          throw error;
        })
      );
  }

  register(data: RegisterRequest): Observable<AuthResponse> {
    console.log('Attempting registration...', data);
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, data)
      .pipe(
        tap(response => {
          console.log('Registration successful:', response);
          console.log('Token received:', response.token.value);
          localStorage.setItem(this.tokenKey, response.token.value);
          
          // Establecer el usuario directamente desde la respuesta
          this.currentUserSubject.next(response.user);
        }),
        catchError(error => {
          console.error('Registration failed:', error);
          throw error;
        })
      );
  }

  logout(): void {
    console.log('Logging out...');
    localStorage.removeItem(this.tokenKey);
    this.currentUserSubject.next(null);
  }

  getProfile(): Observable<User> {
    console.log('Getting user profile...');
    return this.http.get<{user: User}>(`${this.apiUrl}/auth/me`).pipe(
      map(response => response.user),
      tap(user => console.log('Profile loaded:', user)),
      catchError(error => {
        console.error('Failed to get profile:', error);
        throw error;
      })
    );
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const isAuth = !!token;
    console.log('Is authenticated:', isAuth);
    return isAuth;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  // Método para actualizar el usuario actual (usado por el guard)
  setCurrentUser(user: User | null): void {
    this.currentUserSubject.next(user);
  }
}
