import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnInit {
  title = 'Blackjack Game';

  constructor(
    private authService: AuthService,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    console.log('App initialized, checking authentication...');
    
    // Inicializar autenticación al cargar la app
    this.authService.initializeAuth().subscribe({
      next: (user) => {
        if (user) {
          console.log('User authenticated on app start:', user);
        } else {
          console.log('No authenticated user on app start');
        }
      },
      error: (error) => {
        console.error('Error initializing auth:', error);
      }
    });

    // Auto-conectar socket si el usuario está autenticado
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        console.log('User authenticated, connecting socket...');
        this.socketService.connect();
      } else {
        console.log('User not authenticated, disconnecting socket...');
        this.socketService.disconnect();
      }
    });
  }
}
