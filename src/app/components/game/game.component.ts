import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameService } from '../../services/game.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../services/auth.service';
import { Game, Player, GameInfo } from '../../models/game.model';
import { User } from '../../models/user.model';
import { NgZone } from '@angular/core';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css'],
})
export class GameComponent implements OnInit, OnDestroy {
  gameId!: number;
  gameInfo: any | null = null;
  currentUser: User | null = null;
  isLoading = false;
  errorMessage = '';
  private subscriptions: Subscription[] = [];
  private socketListenersSetup = false; 
  showAlert = false;
  alertMessage = '';

  showRematchModal = false;
  showWaitingModal = false;
  rematchData: any = null;
  rematchResponses: any[] = [];
  currentPlayerId: number | null = null;
  rematchStatus: 'waiting' | 'success' | 'failed' = 'waiting';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private gameService: GameService,
    private socketService: SocketService,
    private authService: AuthService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.gameId = +this.route.snapshot.params['id'];
    this.currentUser = this.authService.getCurrentUser();

    if (!this.currentUser) {
      console.error('[INIT] ❌ No hay usuario autenticado');
      this.router.navigate(['/auth/login']);
      return;
    }

    const routeSub = this.route.params.subscribe(params => {
      const newGameId = +params['id'];
      if (newGameId !== this.gameId) {
        this.handleGameChange(newGameId);
      }
    });
    this.subscriptions.push(routeSub);

    this.initializeSocketConnection();
  }

  private handleGameChange(newGameId: number) {
    if (this.gameId) {
      this.socketService.leaveGameRoom(this.gameId);
    }
    
    this.gameId = newGameId;
    this.gameInfo = null;
    this.errorMessage = '';
    this.closeRematchModals();
    
    setTimeout(() => {
      this.socketService.joinGameRoom(this.gameId);
      
      setTimeout(() => {
        this.loadGameInfo();
      }, 500);
    }, 100);
  }

  private initializeSocketConnection(): void {
    this.setupSocketListeners();
    this.socketService.connect();

    const connectionSub = this.socketService.isConnected$.subscribe(
      (connected) => {
        if (connected) {
          this.socketService.joinGameRoom(this.gameId);
          
          setTimeout(() => {
            this.loadGameInfo();
          }, 500); 
        }
      }
    );

    this.subscriptions.push(connectionSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];
    this.socketService.leaveGameRoom(this.gameId);
    this.socketListenersSetup = false;
  }

  setupSocketListeners() {
    if (this.socketListenersSetup) {
      return;
    }
    this.socketListenersSetup = true;

    this.setupBasicGameListeners();
    
    this.setupSpecialEventListeners();
    
    this.setupRematchListeners();
  }

  // ✅ Eventos básicos del juego
  private setupBasicGameListeners() {
    const basicGameEvents = [
      'chisme:playerJoined',
      'chisme:playerLeft',
      'chisme:gameStarted',
      'chisme:cardDealt',
      'chisme:playerStood',
      'chisme:playerRequestedCard',
      'chisme:gameFinished'
    ];

    basicGameEvents.forEach(eventName => {
      const subscription = this.socketService.on(eventName).subscribe({
        next: () => { 
          this.ngZone.run(() => {
            this.loadGameInfo(); 
          });
        },
        error: (err) => console.error(`Error en ${eventName}:`, err)
      });
      this.subscriptions.push(subscription);
    });
  }

  private setupSpecialEventListeners() {
    const gameEndedByLeaveSub = this.socketService.on('chisme:gameEndedByLeave').subscribe({
      next: () => { 
        this.ngZone.run(() => {
          this.showTemporaryAlert('Juego finalizado por abandono de un jugador');
          setTimeout(() => {
            this.router.navigate(['/lobby']);
          }, 3000);
        });
      },
      error: (err) => console.error('Error en gameEndedByLeave:', err),
    });

    const newGameSub = this.socketService.on('chisme:newGameCreated').subscribe({
      next: () => { 
        this.ngZone.run(() => {
          this.loadGameInfo();
        });
      },
      error: (err) => console.error('Error en newGameCreated:', err),
    });

    this.subscriptions.push(gameEndedByLeaveSub, newGameSub);
  }

  private setupRematchListeners() {
    const rematchProposedSub = this.socketService
      .on('chisme:rematchProposed')
      .subscribe({
        next: () => {
          // ✅ Sin parámetro 'data'
          console.log('🔔 Notificación: Revancha propuesta');
          this.ngZone.run(() => {
            this.handleRematchProposed();
          });
        },
        error: (err) => console.error('Error en rematchProposed:', err),
      });

    const rematchResponseSub = this.socketService
      .on('chisme:rematchResponse')
      .subscribe({
        next: () => {
          console.log('🔔 Notificación: Respuesta de revancha recibida');
          this.ngZone.run(() => {
            this.handleRematchResponse();
          });
        },
        error: (err) => console.error('Error en rematchResponse:', err),
      });

    const rematchCancelledSub = this.socketService
      .on('chisme:rematchCancelled')
      .subscribe({
        next: () => {
          console.log('🔔 Notificación: Revancha cancelada');
          this.ngZone.run(() => {
            this.closeRematchModals();
            this.showTemporaryAlert('Revancha cancelada');
            this.router.navigate(['/lobby']);
          });
        },
        error: (err) => console.error('Error en rematchCancelled:', err),
      });

    const gameRestartedSub = this.socketService
      .on('chisme:gameRestarted')
      .subscribe({
        next: () => {
          console.log(
            '🔔 Notificación: La partida se ha reiniciado para revancha'
          );
          this.ngZone.run(() => {
            this.closeRematchModals();
            this.showTemporaryAlert('Partida acceptada. Reiniciando juego...');
            setTimeout(() => {
              this.loadGameInfo();
            }, 1000);
          });
        },
        error: (err) => console.error('Error en gameRestarted:', err),
      });

    const redirectToLobbySub = this.socketService
      .on('chisme:redirectToLobby')
      .subscribe({
        next: () => {
          console.log(
            '🚪 Notificación: Redirigiendo al lobby por revancha rechazada'
          );
          this.ngZone.run(() => {
            this.closeRematchModals();
            this.showTemporaryAlert(
              'Revancha rechazada por algun jugador. Redirigiendo al lobby...'
            );
            setTimeout(() => {
              this.router.navigate(['/lobby']);
            }, 4000);
          });
        },
        error: (err) => console.error('Error en redirectToLobby:', err),
      });

    this.subscriptions.push(
      rematchProposedSub,
      rematchResponseSub,
      rematchCancelledSub,
      gameRestartedSub,
      redirectToLobbySub
    );
  }

  loadGameInfo() {
    const timestamp = new Date().toISOString().substr(11, 12);
    
    this.gameService.getGameInfo(this.gameId).subscribe({
      next: (gameInfo: any) => {
        this.gameInfo = gameInfo;
        this.errorMessage = '';

        if (gameInfo.winnerId && gameInfo.players) {
          const winnerPlayer = gameInfo.players.find(
            (p: any) => p.userId === gameInfo.winnerId
          );
          if (winnerPlayer) {
            this.gameInfo.winner = winnerPlayer;
          }
        }
      },
      error: (error: any) => {
        console.error(`[ERROR-${timestamp}] Error loading game info:`, error);
        this.errorMessage = 'Error al cargar la información del juego';
      },
    });
  }

  private handleRematchProposed() { 
    
    this.gameService.getRematchInfo(this.gameId.toString()).subscribe({
      next: (rematchInfo: any) => {
        
        if (this.isHost) {
          this.showWaitingModal = true;
          this.rematchData = {
            originalGameId: this.gameId,
            playersToNotify: rematchInfo.players || rematchInfo.playersToNotify
          };
          this.initializeRematchResponses();
        } else {
          this.showRematchModal = true;
          this.rematchData = {
            originalGameId: this.gameId,
            playersToNotify: rematchInfo.players || rematchInfo.playersToNotify
          };
          this.setCurrentPlayerId();
        }
      },
      error: (error) => {
        console.error('❌ Error al obtener datos de revancha:', error);
        this.errorMessage = 'Error al obtener información de la revancha';
      }
    });
  }

  private handleRematchResponse() { 
    console.log('💬 Respuesta de revancha - simplemente recargando información del juego');
    
    this.loadGameInfo();
  }

  private setCurrentPlayerId() {
    if (this.gameInfo?.players && this.currentUser) {
      const currentPlayer = this.gameInfo.players.find(
        (p: any) => p.userId === this.currentUser!.id
      );
      this.currentPlayerId = currentPlayer?.id || null;
    }
  }


  private initializeRematchResponses() {
    if (!this.rematchData?.playersToNotify) {
      return;
    }

    this.rematchResponses = this.rematchData.playersToNotify.map((player: any) => ({
      playerId: player.id,
      playerName: player.user?.fullName || player.user?.email || player.name,
      accepted: false,
      responded: false,
    }));
  }


  startGame() {
    if (!this.gameInfo?.players) return;

    this.isLoading = true;
    this.errorMessage = '';

    const hostPlayer = this.gameInfo.players.find((p: any) => Boolean(p.isHost));
    if (!hostPlayer) {
      this.errorMessage = 'No se pudo encontrar el host del juego';
      this.isLoading = false;
      return;
    }

    this.gameService.startGame(this.gameId, hostPlayer.id).subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al iniciar el juego';
        this.isLoading = false;
      },
    });
  }

  requestCard() {
    if (!this.gameInfo) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.requestCard(this.gameId).subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al solicitar carta';
        this.isLoading = false;
      },
    });
  }

  stand() {
    if (!this.gameInfo) return;

    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.stand(this.gameId).subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al plantarse';
        this.isLoading = false;
      },
    });
  }

  dealCardToPlayer(playerId: number) {
    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.dealCardToPlayer(playerId).subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al dar carta';
        this.isLoading = false;
      },
    });
  }

  standPlayerAsHost(playerId: number) {
    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.standPlayer(playerId).subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al plantar jugador';
        this.isLoading = false;
      },
    });
  }

  proposeRematch() {
    if (!this.gameInfo) return;

    this.isLoading = true;
    this.errorMessage = '';

    const hostPlayer = this.gameInfo.players?.find((p: any) => Boolean(p.isHost));
    if (!hostPlayer) {
      this.errorMessage = 'No se pudo encontrar el host del juego';
      this.isLoading = false;
      return;
    }

    this.gameService.proposeRematch(this.gameId, hostPlayer.id).subscribe({
      next: () => {
        this.isLoading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al proponer revancha';
        this.isLoading = false;
      },
    });
  }

  respondToRematch(accepted: boolean) {
    if (!this.currentPlayerId || !this.rematchData) {
      this.errorMessage = 'Error: No se pudo identificar el jugador';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.respondToRematch(this.gameId, this.currentPlayerId, accepted).subscribe({
      next: () => {
        this.isLoading = false;
        if (accepted) {
          this.showRematchModal = false;
          this.showWaitingModal = true;
        } else {
          this.closeRematchModals();
        }
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al responder a la revancha';
        this.isLoading = false;
      },
    });
  }

  leaveGame() {
    this.gameService.leaveGame(this.gameId).subscribe({
      next: () => {
        this.router.navigate(['/lobby']);
      },
      error: (error: any) => {
        this.router.navigate(['/lobby']);
      },
    });
  }

  get isHost(): boolean {
    if (!this.gameInfo?.players || !this.currentUser) return false;
    return this.gameInfo.players.some(
      (p: any) => p.userId === this.currentUser!.id && Boolean(p.isHost)
    );
  }

  isCurrentPlayer(player: Player): boolean {
    if (!this.gameInfo) return false;
    return this.gameInfo.currentPlayerTurn === player.id;
  }

  isCurrentUser(player: Player): boolean {
    return player.userId === this.currentUser?.id;
  }

  shouldHideCard(player: Player, card: any): boolean {
    // Ahora el backend maneja la lógica, solo verificamos si la carta está marcada como oculta
    if (typeof card === 'object' && card.hidden === true) {
      return true;
    }
    if (card === 'HIDDEN' || (typeof card === 'object' && card.display === 'HIDDEN')) {
      return true;
    }
    return false;
  }

  getPlayerCards(player: any): any[] {
    // Si el servidor envió formattedCards, usar esas
    if (player.formattedCards && player.formattedCards.length > 0) {
      return player.formattedCards.map((cardString: string) => ({
        display: cardString,
        hidden: false
      }));
    }

    // Si no hay formattedCards pero hay cardCount, significa que las cartas están ocultas
    if (player.cardCount && player.cardCount > 0) {
      // Crear array de cartas ocultas basado en la cantidad
      return Array.from({ length: player.cardCount }, () => ({
        display: 'HIDDEN',
        hidden: true
      }));
    }

    // Fallback al método anterior para compatibilidad
    if (player.cards && player.cards.length > 0) {
      return player.cards.map((card: any) => {
        if (card.card === 'HIDDEN') {
          return { display: 'HIDDEN', hidden: true };
        }
        if (card.formatted) {
          return { display: card.formatted, hidden: false };
        }
        return { display: card.card || card, hidden: false };
      });
    }

    return [];
  }

  getCardDisplay(card: any): string {
    if (typeof card === 'object' && card.formatted) return card.formatted;
    if (typeof card === 'object' && card.display) return card.display;
    if (typeof card === 'string') return card;
    return card?.card || card || '?';
  }

  getCardImageClass(card: any): string {
    let cardString = '';

    if (typeof card === 'object' && card.display) {
      cardString = card.display;
    } else if (typeof card === 'string') {
      cardString = card;
    } else {
      return 'card-back';
    }

    if (!cardString) return 'card-back';

    const value = cardString.slice(0, -2);
    const suitEmoji = cardString.slice(-2);

    let suit = '';
    switch (suitEmoji) {
      case '♠️': suit = 'spades'; break;
      case '❤️': suit = 'hearts'; break;
      case '💎': suit = 'diamonds'; break;
      case '♣️': suit = 'clubs'; break;
      default: suit = 'unknown';
    }

    return `card-${value.toLowerCase()}-${suit}`;
  }

  getPlayerStatus(player: Player): string {
    const points = player.totalPoints || player.points || 0;
    const cardCount = this.getPlayerCards(player).length;

    if (this.gameInfo?.status === 'finished') {
      if (points > 21) return 'Pasado (' + points + ')';
      if (points === 21 && cardCount === 2) return 'Blackjack!';
      if (player.isStand || player.isStanding) return 'Plantado (' + points + ')';
      return 'Terminado (' + points + ')';
    }

    if (!this.isHost && !this.isCurrentUser(player)) {
      if (player.isStand || player.isStanding) return 'Plantado';
      if (player.isFinished) return 'Terminado';
      return 'Jugando';
    }

    if (points > 21) return 'Pasado';
    if (points === 21 && cardCount === 2) return 'Blackjack!';
    if (player.isStand || player.isStanding) return 'Plantado';
    if (player.isFinished) return 'Terminado';
    return 'Jugando';
  }

  getGameStatusText(): string {
    if (!this.gameInfo) return '';
    switch (this.gameInfo.status) {
      case 'waiting': return 'Esperando jugadores';
      case 'playing': return 'En progreso';
      case 'finished': return 'Terminado';
      default: return this.gameInfo.status;
    }
  }

  getCurrentPlayerName(): string {
    if (!this.gameInfo?.currentPlayerTurn || !this.gameInfo?.players)
      return 'Desconocido';
    const currentPlayer = this.gameInfo.players.find(
      (p: any) => p.id === this.gameInfo!.currentPlayerTurn
    );
    return (
      currentPlayer?.user?.fullName ||
      currentPlayer?.user?.email ||
      'Desconocido'
    );
  }

  getNonHostPlayersCount(): number {
    if (!this.gameInfo?.players) return 0;
    return this.gameInfo.players.filter(
      (player: any) => !Boolean(player.isHost)
    ).length;
  }

  getPendingCardRequests(): number {
    if (!this.gameInfo?.players) return 0;
    return this.gameInfo.players.filter((player: any) =>
      Boolean(player.hasCardRequest)
    ).length;
  }

  closeRematchModal() {
    this.showRematchModal = false;
  }

  closeRematchModals() {
    this.showRematchModal = false;
    this.showWaitingModal = false;
    this.rematchData = null;
    this.rematchResponses = [];
    this.rematchStatus = 'waiting';
  }

  cancelRematch() {
    this.closeRematchModals();
  }

  showTemporaryAlert(message: string, duration = 3000) {
  this.alertMessage = message;
  this.showAlert = false; 
  setTimeout(() => {
    this.showAlert = true;
  }, 10);

  setTimeout(() => {
    this.showAlert = false;
  }, duration);
}
}