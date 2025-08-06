import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): Observable<boolean> {
    console.log('AuthGuard: Checking authentication...');
    
    const token = this.authService.getToken();
    
    if (!token) {
      console.log('AuthGuard: No token found, redirecting to login');
      this.router.navigate(['/auth/login']);
      return of(false);
    }

    // Verificar si el token es válido haciendo una llamada al backend
    return this.authService.getProfile().pipe(
      map(user => {
        console.log('AuthGuard: User authenticated:', user);
        this.authService.setCurrentUser(user);
        return true;
      }),
      catchError(error => {
        console.log('AuthGuard: Authentication failed:', error);
        this.authService.logout();
        this.router.navigate(['/auth/login']);
        return of(false);
      })
    );
  }
}
