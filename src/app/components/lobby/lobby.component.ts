import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from '../../services/game.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../services/auth.service';
import { Game } from '../../models/game.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./lobby.component.css'],
  templateUrl: './lobby.component.html',
})
export class LobbyComponent implements OnInit, OnDestroy {
  availableGames: Game[] = [];
  currentUser: User | null = null;
  isLoading = false;
  isJoining = false;
  joinRetryAttempt = 0;
  errorMessage = '';
  
  showCreateModal = false;
  selectedMaxPlayers = 6;
  gameName = '';
  
  private subscriptions: Subscription[] = [];

  constructor(
    private gameService: GameService,
    private socketService: SocketService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
  this.currentUser = this.authService.getCurrentUser();
  if (!this.currentUser) {
    this.router.navigate(['/auth/login']);
    return;
  }

  this.socketService.connect();

  const sub = this.socketService.isConnected$.subscribe(isConnected => {
    if (isConnected) {
      this.setupSocketListeners();
      this.loadAvailableGames();
      sub.unsubscribe(); 
    }
  });

  this.subscriptions.push(sub);
}


  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];
  }

  setupSocketListeners() {
    // ✅ Solo notificaciones de eventos, sin datos - recargar lista de juegos
    const newGameSub = this.socketService.on('chisme:newGameCreated').subscribe(() => {
      console.log('🎮 Nuevo juego creado - refrescando lista');
      this.loadAvailableGames();
    });

    const gameUpdateSub = this.socketService.on('chisme:gameUpdate').subscribe(() => {
      console.log('🔄 Actualización de juego - refrescando lista');
      this.loadAvailableGames();
    });

    const playerJoinedSub = this.socketService.on('chisme:playerJoined').subscribe(() => {
      console.log('👤 Jugador se unió - refrescando lista');
      this.loadAvailableGames();
    });

    const playerLeftSub = this.socketService.on('chisme:playerLeft').subscribe(() => {
      console.log('🚪 Jugador salió - refrescando lista');
      this.loadAvailableGames();
    });

    const gameStartedSub = this.socketService.on('chisme:gameStarted').subscribe(() => {
      console.log('🎮 Juego iniciado - refrescando lista');
      this.loadAvailableGames();
    });

    const gameFinishedSub = this.socketService.on('chisme:gameFinished').subscribe(() => {
      console.log('🏁 Juego terminado - refrescando lista');
      this.loadAvailableGames();
    });

    this.subscriptions.push(newGameSub, gameUpdateSub, playerJoinedSub, playerLeftSub, gameStartedSub, gameFinishedSub);
  }

  loadAvailableGames() {
    this.isLoading = true;
    this.errorMessage = '';


    this.gameService.listAvailableGames().subscribe({
      next: (games: Game[]) => {
        this.availableGames = games;
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading games:', error);
        this.errorMessage = 'Error al cargar los juegos';
        this.isLoading = false;
      }
    });
  }

  showCreateGameModal() {
    this.showCreateModal = true;
    this.selectedMaxPlayers = 6; 
    this.gameName = `Partida de ${this.currentUser?.fullName || 'Anónimo'}`;
    this.errorMessage = '';
  }

  hideCreateGameModal() {
    this.showCreateModal = false;
    this.gameName = '';
    this.errorMessage = '';
  }

  createGame() {
    this.isLoading = true;
    this.errorMessage = '';

    const gameData = {
      maxPlayers: this.selectedMaxPlayers,
      hostName: this.gameName.trim()
    };

    this.gameService.createGame(gameData).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.hideCreateGameModal();
        
        const game = response.game || response;
        if (game.id) {
          this.router.navigate(['/game', game.id]);
        } else {
          console.error('Game ID is undefined:', game);
          this.errorMessage = 'Error: ID del juego no válido';
        }
      },
      error: (error: any) => {
        this.errorMessage = 'Error al crear el juego';
        this.isLoading = false;
        console.error('Error creating game:', error);
      }
    });
  }

  joinGame(gameId: number) {
    this.isJoining = true;
    this.errorMessage = '';
    this.joinRetryAttempt = 0;

    
    this.attemptJoinGame(gameId, 3); 
  }

  private attemptJoinGame(gameId: number, maxRetries: number, currentAttempt: number = 1) {
    this.joinRetryAttempt = currentAttempt;
    
    this.gameService.joinGame(gameId).subscribe({
      next: (response) => {
        this.isJoining = false;
        this.joinRetryAttempt = 0;
        this.router.navigate(['/game', gameId]);
      },
      error: (error: any) => {
        if (error.status === 400 && error.error?.message?.includes('Ya estás en esta partida')) {
          this.isJoining = false;
          this.joinRetryAttempt = 0;
          this.router.navigate(['/game', gameId]);
          return;
        }
        
        if (error.status === 503 && error.error?.retry && currentAttempt < maxRetries) {
          setTimeout(() => {
            this.attemptJoinGame(gameId, maxRetries, currentAttempt + 1);
          }, 1000); 
          return;
        }
        
        this.errorMessage = error.error?.message || 'Error al unirse al juego';
        this.isJoining = false;
        this.joinRetryAttempt = 0;
        setTimeout(() => this.loadAvailableGames(), 1000);
      }
    });
  }

  getJoinButtonText(): string {
    if (!this.isJoining) {
      return 'Unirse';
    }
    
    if (this.joinRetryAttempt > 1) {
      return `Reintentando... (${this.joinRetryAttempt}/3)`;
    }
    
    return 'Uniéndose...';
  }

  refreshGames() {
    this.loadAvailableGames();
  }

  logout() {
    this.authService.logout();
    this.socketService.disconnect();
    this.router.navigate(['/auth/login']);
  }

  getGameStatusText(game: Game): string {
    switch (game.status) {
      case 'waiting': return 'Esperando jugadores';
      case 'playing': return 'En juego';
      case 'finished': return 'Terminado';
      default: return game.status;
    }
  }

  getHostName(game: Game): string {
    const host = game.players?.find(player => Boolean(player.isHost));
    return host?.user?.fullName || host?.user?.email || game.hostName || 'Desconocido';
  }

  getNonHostPlayers(game: Game): number {
    if (!game.players) return 0;
    return game.players.filter(player => !Boolean(player.isHost)).length;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
}
