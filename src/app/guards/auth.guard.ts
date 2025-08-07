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
    const token = this.authService.getToken();
    
    if (!token) {
      this.router.navigate(['/auth/login']);
      return of(false);
    }

    return this.authService.getProfile().pipe(
      map(user => {
        this.authService.setCurrentUser(user);
        return true;
      }),
      catchError(error => {
        this.authService.logout();
        this.router.navigate(['/auth/login']);
        return of(false);
      })
    );
  }
}
