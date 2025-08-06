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
  template: `
    <div class="lobby-container">
      <header class="lobby-header">
        <h1>🃏 Blackjack Lobby</h1>
        <div class="user-info">
          <span>Bienvenido, {{ currentUser?.fullName }}!</span>
          <button (click)="logout()" class="logout-btn">Salir</button>
        </div>
      </header>

      <div class="lobby-content">
        <div class="actions-section">
          <button (click)="showCreateGameModal()" class="create-game-btn" [disabled]="isLoading">
            {{ isLoading ? 'Creando...' : 'Crear Nuevo Juego' }}
          </button>
          <button (click)="refreshGames()" class="refresh-btn" [disabled]="isLoading">
            🔄 Actualizar
          </button>
        </div>

        <div class="games-section">
          <h2>Juegos Disponibles</h2>
          
          <div *ngIf="isLoading" class="loading">
            Cargando juegos...
          </div>

          <div *ngIf="!isLoading && availableGames.length === 0" class="no-games">
            No hay juegos disponibles. ¡Crea uno nuevo!
          </div>

          <div class="games-grid" *ngIf="!isLoading && availableGames.length > 0">
            <div 
              *ngFor="let game of availableGames" 
              class="game-card"
              [class.full]="game.players && game.players.length >= game.maxPlayers"
            >
              <div class="game-header">
                <h3>{{ game.hostName || ('Juego #' + game.id) }}</h3>
                <span class="game-status">{{ getGameStatusText(game) }}</span>
              </div>
              
              <div class="game-info">
                <p><strong>Anfitrión:</strong> {{ getHostName(game) }}</p>
                <p><strong>Jugadores:</strong> {{ getNonHostPlayers(game) }} / {{ game.maxPlayers }}</p>
                <p><strong>Creado:</strong> {{ formatDate(game.createdAt) }}</p>
              </div>

              <div class="players-list" *ngIf="game.players && game.players.length > 0">
                <h4>Jugadores:</h4>
                <ul>
                  <li *ngFor="let player of game.players">
                    {{ player.user?.username }}
                    <span *ngIf="player.isHost" class="host-badge">HOST</span>
                  </li>
                </ul>
              </div>

              <button 
                (click)="joinGame(game.id)" 
                class="join-btn"
                [disabled]="isJoining || getNonHostPlayers(game) >= game.maxPlayers"
              >
                {{ getJoinButtonText() }}
              </button>
            </div>
          </div>
        </div>

        <div class="error-message" *ngIf="errorMessage">
          {{ errorMessage }}
        </div>
      </div>

      <!-- Modal para crear juego -->
      <div *ngIf="showCreateModal" class="modal-overlay" (click)="hideCreateGameModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <h3>Crear Nueva Partida</h3>
          
          <div class="form-group">
            <label for="gameName">Nombre de la partida:</label>
            <input 
              type="text" 
              id="gameName" 
              [(ngModel)]="gameName" 
              class="text-input"
              placeholder="Ej: Partida de {{ currentUser?.fullName }}"
              maxlength="50"
            >
          </div>

          <div class="form-group">
            <label>Número máximo de jugadores:</label>
            <input 
              type="number" 
              [(ngModel)]="selectedMaxPlayers" 
              class="number-input"
              min="2"
              max="10"
              placeholder="Ej: 4"
            >
            <small class="help-text">Entre 2 y 10 jugadores (sin contar al anfitrión)</small>
          </div>

          <div class="modal-actions">
            <button (click)="createGame()" class="create-btn" [disabled]="isLoading || !gameName.trim() || selectedMaxPlayers < 2 || selectedMaxPlayers > 10">
              {{ isLoading ? 'Creando...' : 'Crear Partida' }}
            </button>
            <button (click)="hideCreateGameModal()" class="cancel-btn">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .lobby-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      padding: 1rem;
    }

    .lobby-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 1rem 2rem;
      border-radius: 10px;
      margin-bottom: 2rem;
      backdrop-filter: blur(10px);
    }

    .lobby-header h1 {
      color: white;
      margin: 0;
      font-size: 2rem;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 1rem;
      color: white;
    }

    .logout-btn {
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.3s;
    }

    .logout-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .lobby-content {
      max-width: 1200px;
      margin: 0 auto;
    }

    .actions-section {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      justify-content: center;
    }

    .create-game-btn, .refresh-btn {
      padding: 1rem 2rem;
      border: none;
      border-radius: 8px;
      font-size: 1.1rem;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .create-game-btn {
      background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
      color: white;
    }

    .refresh-btn {
      background: rgba(255, 255, 255, 0.9);
      color: #2a5298;
    }

    .create-game-btn:hover, .refresh-btn:hover {
      transform: translateY(-2px);
    }

    .create-game-btn:disabled, .refresh-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .games-section {
      background: rgba(255, 255, 255, 0.95);
      padding: 2rem;
      border-radius: 15px;
      backdrop-filter: blur(10px);
    }

    .games-section h2 {
      text-align: center;
      color: #333;
      margin-bottom: 2rem;
    }

    .loading, .no-games {
      text-align: center;
      color: #666;
      font-size: 1.1rem;
      padding: 2rem;
    }

    .games-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .game-card {
      background: white;
      border-radius: 10px;
      padding: 1.5rem;
      box-shadow: 0 5px 15px rgba(0,0,0,0.1);
      transition: transform 0.2s;
    }

    .game-card:hover {
      transform: translateY(-3px);
    }

    .game-card.full {
      opacity: 0.7;
    }

    .game-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #eee;
    }

    .game-header h3 {
      margin: 0;
      color: #2a5298;
    }

    .game-status {
      background: #e8f4f8;
      color: #2a5298;
      padding: 0.25rem 0.5rem;
      border-radius: 15px;
      font-size: 0.875rem;
    }

    .game-info {
      margin-bottom: 1rem;
    }

    .game-info p {
      margin: 0.5rem 0;
      color: #555;
    }

    .players-list {
      margin-bottom: 1rem;
    }

    .players-list h4 {
      margin: 0 0 0.5rem 0;
      color: #333;
      font-size: 1rem;
    }

    .players-list ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .players-list li {
      padding: 0.25rem 0;
      color: #666;
    }

    .host-badge {
      background: #f39c12;
      color: white;
      padding: 0.125rem 0.375rem;
      border-radius: 10px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }

    .join-btn {
      width: 100%;
      padding: 0.75rem;
      background: linear-gradient(135deg, #2a5298 0%, #1e3c72 100%);
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1rem;
      transition: transform 0.2s;
    }

    .join-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .join-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
    }

    .error-message {
      background: #e74c3c;
      color: white;
      padding: 1rem;
      border-radius: 5px;
      text-align: center;
      margin-top: 1rem;
    }

    /* Estilos del Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      padding: 2rem;
      border-radius: 10px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .modal-content h3 {
      margin: 0 0 1.5rem 0;
      color: #333;
      text-align: center;
    }

    .form-group {
      margin-bottom: 1.5rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #333;
      font-weight: 500;
    }

    .select-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 1rem;
      background: white;
      cursor: pointer;
    }

    .select-input:focus {
      outline: none;
      border-color: #2a5298;
      box-shadow: 0 0 5px rgba(42, 82, 152, 0.3);
    }

    .text-input, .number-input {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 5px;
      font-size: 1rem;
      background: white;
      box-sizing: border-box;
    }

    .text-input:focus, .number-input:focus {
      outline: none;
      border-color: #2a5298;
      box-shadow: 0 0 5px rgba(42, 82, 152, 0.3);
    }

    .help-text {
      color: #666;
      font-size: 0.85rem;
      margin-top: 0.25rem;
      display: block;
    }

    .modal-actions {
      display: flex;
      gap: 1rem;
      justify-content: center;
    }

    .create-btn {
      background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1rem;
      transition: transform 0.2s;
    }

    .create-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .create-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
      transform: none;
    }

    .cancel-btn {
      background: #95a5a6;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1rem;
      transition: transform 0.2s;
    }

    .cancel-btn:hover {
      transform: translateY(-2px);
      background: #7f8c8d;
    }
  `]
})
export class LobbyComponent implements OnInit, OnDestroy {
  availableGames: Game[] = [];
  currentUser: User | null = null;
  isLoading = false;
  isJoining = false;
  joinRetryAttempt = 0;
  errorMessage = '';
  
  // Propiedades para el modal de crear juego
  showCreateModal = false;
  selectedMaxPlayers = 4;
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
    
    // Conectar sockets si no están conectados
    this.socketService.connect();
    
    this.loadAvailableGames();
    this.setupSocketListeners();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  setupSocketListeners() {
    // Escuchar cuando se creen nuevos juegos
    const newGameSub = this.socketService.onNewGameCreated().subscribe(() => {
      console.log('New game created event received');
      this.loadAvailableGames();
    });

    // Escuchar actualizaciones de juegos
    const gameUpdateSub = this.socketService.onGameUpdate().subscribe(() => {
      console.log('Game update event received');
      this.loadAvailableGames();
    });

    // Escuchar cuando un jugador se une a un juego
    const playerJoinedSub = this.socketService.onPlayerJoined().subscribe(() => {
      console.log('Player joined event received');
      this.loadAvailableGames();
    });

    // Escuchar cuando un jugador deja un juego
    const playerLeftSub = this.socketService.onPlayerLeft().subscribe(() => {
      console.log('Player left event received');
      this.loadAvailableGames();
    });

    this.subscriptions.push(newGameSub, gameUpdateSub, playerJoinedSub, playerLeftSub);
  }

  loadAvailableGames() {
    this.isLoading = true;
    this.errorMessage = '';

    console.log('Loading available games...');

    this.gameService.listAvailableGames().subscribe({
      next: (games: Game[]) => {
        console.log('Available games loaded:', games);
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
    this.selectedMaxPlayers = 4; // Valor por defecto
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
        console.log('Game created successfully:', response);
        this.isLoading = false;
        this.hideCreateGameModal();
        
        // El backend devuelve un objeto con game y hostPlayer
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

    console.log(`Attempting to join game ${gameId}`);
    
    this.attemptJoinGame(gameId, 3); // 3 intentos máximo
  }

  private attemptJoinGame(gameId: number, maxRetries: number, currentAttempt: number = 1) {
    this.joinRetryAttempt = currentAttempt;
    
    this.gameService.joinGame(gameId).subscribe({
      next: (response) => {
        console.log(`Successfully joined game ${gameId}:`, response);
        this.isJoining = false;
        this.joinRetryAttempt = 0;
        this.router.navigate(['/game', gameId]);
      },
      error: (error: any) => {
        console.error(`Failed to join game ${gameId} (attempt ${currentAttempt}):`, error);
        
        // Si el usuario ya está en la partida, navegar directamente al juego
        if (error.status === 400 && error.error?.message?.includes('Ya estás en esta partida')) {
          console.log(`User already in game ${gameId}, navigating to game...`);
          this.isJoining = false;
          this.joinRetryAttempt = 0;
          this.router.navigate(['/game', gameId]);
          return;
        }
        
        // Si es un error de concurrencia y tenemos intentos restantes
        if (error.status === 503 && error.error?.retry && currentAttempt < maxRetries) {
          console.log(`Retrying join game ${gameId} in 1 second (attempt ${currentAttempt + 1}/${maxRetries})`);
          setTimeout(() => {
            this.attemptJoinGame(gameId, maxRetries, currentAttempt + 1);
          }, 1000); // Esperar 1 segundo antes de reintentar
          return;
        }
        
        // Error final o sin más intentos
        this.errorMessage = error.error?.message || 'Error al unirse al juego';
        this.isJoining = false;
        this.joinRetryAttempt = 0;
        // Refrescar la lista de juegos después de un error
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
    // Convertir isHost a boolean y contar los que no son host
    return game.players.filter(player => !Boolean(player.isHost)).length;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
  }
}
