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
    this.authService.initializeAuth().subscribe({
      next: (user) => {
        if (user) {
        } else {
        }
      },
      error: (error) => {
      }
    });

    // Auto-conectar socket si el usuario está autenticado
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.socketService.connect();
      } else {
        this.socketService.disconnect();
      }
    });
  }
}
