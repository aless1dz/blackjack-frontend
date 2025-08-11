import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { catchError, of, retry, delay } from 'rxjs';
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
    console.log('⚡ Manejando cambio de partida:', this.gameId, '->', newGameId);
    
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

    const events = [
      'chisme:playerJoined',
      'chisme:playerLeft', 
      'chisme:gameStarted',
      'chisme:cardDealt',
      'chisme:playerStood',
      'chisme:playerRequestedCard', // ✅ Usar el método .on() consistente
      'chisme:gameFinished'
    ];

    const gameEndedByLeaveSub = this.socketService.on('chisme:gameEndedByLeave').subscribe({
      next: (data) => {
        console.log('🛑 Partida terminada por abandono:', data);
        this.ngZone.run(() => {
          alert(data.message || 'La partida ha sido cancelada porque alguien abandonó');
          this.router.navigate(['/lobby']);
        });
      },
      error: (err) => console.error('Error en gameEndedByLeave:', err),
    });

    this.subscriptions.push(gameEndedByLeaveSub);

    const rematchEvents = [
      'chisme:rematchProposed',
      'chisme:rematchResponse'
    ];

    events.forEach(eventName => {
      const subscription = this.socketService.on(eventName).pipe(
        catchError((error) => {
          return of(null);
        }),
        retry({ count: 3, delay: 1000 }) 
      ).subscribe({
        next: (data) => {
          if (data !== null) { 

            this.ngZone.run(() => {
              this.loadGameInfo();
            });
          }
        },
        error: (err) => {

        },
      });
      
      this.subscriptions.push(subscription);
    });

    const newGameSub = this.socketService.on('chisme:newGameCreated').subscribe({
      next: (data) => {
        if (data?.newGame?.id && !this.showWaitingModal && !this.showRematchModal) {
          this.ngZone.run(() => {
            this.router.navigate(['/game', data.newGame.id]);
          });
        } else if (this.showWaitingModal || this.showRematchModal) {
        }
      },
      error: (err) => console.error('Error en newGameCreated:', err),
    });

    this.subscriptions.push(newGameSub);
    
    this.setupRematchListeners();
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

        if (gameInfo && gameInfo.players) {
          gameInfo.players.forEach((player: any, index: number) => {
          });
        }
      },
      error: (error: any) => {
        console.error(`[ERROR-${timestamp}] Error loading game info:`, error);
        this.errorMessage = 'Error al cargar la información del juego';
      },
    });
  }

  debugSocketState() {
    
    this.socketService.isConnected$.subscribe(connected => {
      console.log('Socket connected:', connected);
    }).unsubscribe();
    
    console.log('Listeners setup:', this.socketListenersSetup);
    console.log('Active subscriptions:', this.subscriptions.length);
    console.log('Game ID:', this.gameId);
    console.log('========================');
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
    if (this.gameInfo?.status === 'finished') {
      return false;
    }

    if (this.isHost) {
      return false;
    }

    if (this.isCurrentUser(player)) {
      return false;
    }

    if (player.isHost) {
      return true;
    }

    return true;
  }

  getPlayerCards(player: any): any[] {
    if (player.formattedCards && player.formattedCards.length > 0) {
      return player.formattedCards.map((cardString: string) => ({
        display: cardString,
      }));
    }

    if (player.cards && player.cards.length > 0) {
      return player.cards.map((card: any) => {
        if (card.formatted) {
          return { display: card.formatted };
        }
        return { display: card.card || card };
      });
    }

    return [];
  }

  getCardDisplay(card: any): string {
    if (typeof card === 'object' && card.formatted) {
      return card.formatted;
    }

    if (typeof card === 'object' && card.display) {
      return card.display;
    }

    if (typeof card === 'string') {
      return card;
    }

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
      case '♠️':
        suit = 'spades';
        break;
      case '❤️':
        suit = 'hearts';
        break;
      case '💎':
        suit = 'diamonds';
        break;
      case '♣️':
        suit = 'clubs';
        break;
      default:
        suit = 'unknown';
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
      case 'waiting':
        return 'Esperando jugadores';
      case 'playing':
        return 'En progreso';
      case 'finished':
        return 'Terminado';
      default:
        return this.gameInfo.status;
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

  startGame() {
    if (!this.gameInfo?.players) return;

    this.isLoading = true;
    this.errorMessage = '';

    const hostPlayer = this.gameInfo.players.find((p: any) =>
      Boolean(p.isHost)
    );
    if (!hostPlayer) {
      this.errorMessage = 'No se pudo encontrar el host del juego';
      this.isLoading = false;
      return;
    }

    this.gameService.startGame(this.gameId, hostPlayer.id).subscribe({
      next: (response) => {
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
      next: (response) => {
        this.isLoading = false;
        console.log(`🃏 Carta solicitada en partida ${this.gameId}`);
      },
      error: (error: any) => {
        console.error(`❌ Error al solicitar carta en partida ${this.gameId}:`, error);
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
        console.log(`🛁 Plantado en partida ${this.gameId}`);
      },
      error: (error: any) => {
        console.error(`❌ Error al plantarse en partida ${this.gameId}:`, error);
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

    const hostPlayer = this.gameInfo.players?.find((p: any) =>
      Boolean(p.isHost)
    );
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
        this.errorMessage =
          error.error?.message || 'Error al proponer revancha';
        this.isLoading = false;
      },
    });
  }

  leaveGame() {
    this.gameService.leaveGame(this.gameId).subscribe({
      next: () => {
        console.log(`🚪 Saliendo de partida ${this.gameId}`);
        this.router.navigate(['/lobby']);
      },
      error: (error: any) => {
        console.error(`❌ Error al salir de partida ${this.gameId}:`, error);
        this.router.navigate(['/lobby']);
      },
    });
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


  private setupRematchListeners() {
    const rematchProposedSub = this.socketService.on('chisme:rematchProposed').subscribe({
      next: (data) => {
        console.log('🎮 Revancha propuesta recibida:', data);
        this.ngZone.run(() => {
          this.handleRematchProposed(data);
        });
      },
      error: (err) => console.error('Error en rematchProposed:', err),
    });

    const rematchResponseSub = this.socketService.on('chisme:rematchResponse').subscribe({
      next: (data) => {
        console.log('💬 Respuesta de revancha recibida:', data);
        this.ngZone.run(() => {
          this.handleRematchResponse(data);
        });
      },
      error: (err) => console.error('Error en rematchResponse:', err),
    });

    const rematchCancelledSub = this.socketService.on('chisme:rematchCancelled').subscribe({
      next: (data) => {
        console.log('❌ Revancha cancelada:', data);
        this.ngZone.run(() => {
          if (data.gameId && Number(data.gameId) !== Number(this.gameId)) {
            console.log(`🚫 [DEBUG] Ignorando rematch cancelled - no es para esta partida. Evento gameId: ${data.gameId} (${typeof data.gameId}), Mi gameId: ${this.gameId} (${typeof this.gameId})`);
            return;
          }
          
          this.closeRematchModals();
          alert(data.message || 'La revancha ha sido cancelada');
          // Redirigir al lobby
          this.router.navigate(['/lobby']);
        });
      },
      error: (err) => console.error('Error en rematchCancelled:', err),
    });

    const allPlayersAcceptedRematchSub = this.socketService.on('chisme:allPlayersAcceptedRematch').subscribe({
      next: (data) => {
        console.log('🎉 TODOS los jugadores aceptaron la revancha:', data);
        this.ngZone.run(() => {
          
          if (data?.newGameId) {
            console.log('🚀 Redirigiendo TODOS a la nueva partida:', data.newGameId);
            this.rematchStatus = 'success';
            
            setTimeout(() => {
              this.navigateToNewGame(data.newGameId);
            }, 2000);
          }
        });
      },
      error: (err) => console.error('Error en allPlayersAcceptedRematch:', err),
    });

    const newGameFromRematchSub = this.socketService.on('chisme:newGameCreated').subscribe({
      next: (data) => {
        console.log('🎮 Nuevo juego creado desde revancha:', data);
        if (data?.newGame?.id && this.showWaitingModal) {
          console.log('🚀 Redirigiendo a la nueva partida de revancha:', data.newGame.id);
          this.ngZone.run(() => {
            setTimeout(() => {
              this.router.navigate(['/game', data.newGame.id]);
            }, 1500);
          });
        }
      },
      error: (err) => console.error('Error en newGameCreated (revancha):', err),
    });

    this.subscriptions.push(rematchProposedSub, rematchResponseSub, rematchCancelledSub, allPlayersAcceptedRematchSub, newGameFromRematchSub);
  }

  private handleRematchProposed(data: any) {
    console.log('📄 [DEBUG] Datos de revancha propuesta:', JSON.stringify(data, null, 2));
    console.log('📄 [DEBUG] ¿Eres host?', this.isHost);
    
    const rematchGameId = data.rematch?.originalGameId;
    if (rematchGameId && Number(rematchGameId) !== Number(this.gameId)) {
      console.log(`🚫 [DEBUG] Ignorando revancha - no es para esta partida. Revancha gameId: ${rematchGameId} (${typeof rematchGameId}), Mi gameId: ${this.gameId} (${typeof this.gameId})`);
      return;
    }
    
    console.log('✅ [DEBUG] Revancha es para MI partida, procesando...');
    
    if (this.isHost) {
      this.showWaitingModal = true;
      this.rematchData = data.rematch;
      console.log('📄 [DEBUG] Host - rematchData:', JSON.stringify(this.rematchData, null, 2));
      this.initializeRematchResponses();
      console.log('📄 [DEBUG] Host - respuestas inicializadas:', this.rematchResponses);
    } else {
      this.showRematchModal = true;
      this.rematchData = data.rematch;
      console.log('📄 [DEBUG] No-Host - rematchData:', JSON.stringify(this.rematchData, null, 2));
      
      if (this.gameInfo?.players && this.currentUser) {
        const currentPlayer = this.gameInfo.players.find(
          (p: any) => p.userId === this.currentUser!.id
        );
        this.currentPlayerId = currentPlayer?.id || null;
        console.log('📄 [DEBUG] No-Host - currentPlayerId:', this.currentPlayerId);
        console.log('📄 [DEBUG] No-Host - currentUser:', this.currentUser?.id);
      }
    }
  }

  private handleRematchResponse(data: any) {
    console.log('📝 [DEBUG] Respuesta de revancha completa:', JSON.stringify(data, null, 2));
    
    if (data.gameId && Number(data.gameId) !== Number(this.gameId)) {
      console.log(`🚫 [DEBUG] Ignorando rematch response - no es para esta partida. Evento gameId: ${data.gameId} (${typeof data.gameId}), Mi gameId: ${this.gameId} (${typeof this.gameId})`);
      return;
    }
    
    const { playerId, accepted, playerName } = data;
    console.log('📝 [DEBUG] playerId:', playerId, 'accepted:', accepted, 'playerName:', playerName);
    console.log('📝 [DEBUG] rematchResponses antes:', this.rematchResponses);

    const responseIndex = this.rematchResponses.findIndex(
      (r) => r.playerId === playerId
    );

    if (responseIndex !== -1) {
      this.rematchResponses[responseIndex] = {
        ...this.rematchResponses[responseIndex],
        accepted,
        responded: true,
      };
    }

    if (this.isHost) {
      this.checkAllRematchResponsesAndCreateGame();
    }
  }

  private initializeRematchResponses() {
    if (!this.gameInfo?.players || !this.rematchData?.playersToNotify) {
      return;
    }

    this.rematchResponses = this.rematchData.playersToNotify.map((player: any) => ({
      playerId: player.id,
      playerName: player.user?.fullName || player.user?.email || player.name,
      accepted: false,
      responded: false,
    }));
  }

  private checkAllRematchResponsesAndCreateGame() {
    if (this.rematchResponses.length === 0) {
      console.log('⚠️ No hay respuestas de revancha para verificar');
      return;
    }

    const allResponded = this.rematchResponses.every((r) => r.responded);
    const allAccepted = this.rematchResponses.every((r) => r.accepted);
    const anyRejected = this.rematchResponses.some((r) => r.responded && !r.accepted);

    console.log('🔍 [DEBUG] Estado de respuestas:', {
      allResponded,
      allAccepted,
      anyRejected,
      responses: this.rematchResponses
    });

    if (anyRejected) {
      this.rematchStatus = 'failed';
      setTimeout(() => {
        this.closeRematchModals();
      }, 3000);
      return;
    }

    if (allResponded && allAccepted) {
      console.log('🎉 ¡Todos aceptaron la revancha! Creando nueva partida...');
      
      const acceptedPlayerIds = this.rematchResponses
        .filter(r => r.accepted)
        .map(r => r.playerId);
      
      console.log('📋 IDs de jugadores que aceptaron:', acceptedPlayerIds);
      
      this.gameService.createRematchWhenAllAccepted(this.gameId, acceptedPlayerIds).subscribe({
        next: (result) => {
          console.log('🎮 Resultado de creación de partida:', result);
          if (result.allAccepted) {
            this.rematchStatus = 'success';
          }
        },
        error: (error) => {
          console.error('❌ Error al crear partida de revancha:', error);
          this.errorMessage = 'Error al crear la nueva partida de revancha';
          this.rematchStatus = 'failed';
        }
      });
    } else {
      console.log('⏳ Esperando más respuestas...', {
        respondedCount: this.rematchResponses.filter(r => r.responded).length,
        totalCount: this.rematchResponses.length
      });
      this.rematchStatus = 'waiting';
    }
  }

  private checkAllRematchResponses() {
    if (this.rematchResponses.length === 0) {
      console.log('⚠️ No hay respuestas de revancha para verificar');
      return;
    }

    const allResponded = this.rematchResponses.every((r) => r.responded);
    const allAccepted = this.rematchResponses.every((r) => r.accepted);
    const anyRejected = this.rematchResponses.some((r) => r.responded && !r.accepted);


    if (anyRejected) {
      this.rematchStatus = 'failed';
      setTimeout(() => {
        this.closeRematchModals();
      }, 3000);
    } else if (allResponded && allAccepted) {
      console.log('🎉 ¡Todos aceptaron la revancha! Redirigiendo a:', this.rematchData?.newGameId);
      this.rematchStatus = 'success';
      
      if (this.rematchData?.newGameId) {
        setTimeout(() => {
          console.log('🚀 Navegando a la nueva partida...');
          this.navigateToNewGame(this.rematchData.newGameId);
        }, 3000);
      } else {
        console.error('❌ Error: No se encontró newGameId en rematchData:', this.rematchData);
        this.errorMessage = 'Error: No se pudo obtener el ID de la nueva partida';
        this.rematchStatus = 'failed';
      }
    } else {
      console.log('⏳ Esperando más respuestas...', {
        respondedCount: this.rematchResponses.filter(r => r.responded).length,
        totalCount: this.rematchResponses.length
      });
      this.rematchStatus = 'waiting';
    }
  }

  private navigateToNewGame(newGameId: number) {
    console.log('🎯 Iniciando navegación a nueva partida:', newGameId);
    
    this.closeRematchModals();
    
    console.log('🚪 Saliendo de sala actual:', this.gameId);
    this.socketService.leaveGameRoom(this.gameId);
    
    this.router.navigate(['/game', newGameId]).then(success => {
      if (success) {
        console.log('✅ Navegación exitosa a partida:', newGameId);
      } else {
        console.error('❌ Error en navegación a partida:', newGameId);
      }
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
          console.log('✅ Revancha aceptada, esperando otros jugadores...');
          this.showRematchModal = false;
          this.showWaitingModal = true;
          this.initializeRematchResponses();
          const myResponseIndex = this.rematchResponses.findIndex(
            (r) => r.playerId === this.currentPlayerId
          );
          if (myResponseIndex !== -1) {
            this.rematchResponses[myResponseIndex].accepted = true;
            this.rematchResponses[myResponseIndex].responded = true;
          }
        } else {
          console.log('❌ Revancha rechazada');
          this.closeRematchModals();
        }
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al responder a la revancha';
        this.isLoading = false;
      },
    });
  }

  closeRematchModal() {
    this.showRematchModal = false;
  }

  closeRematchModals() {
    this.showRematchModal = false;
    this.showWaitingModal = false;
    this.rematchData = null;
    this.rematchResponses = [];
  }

  cancelRematch() {
    this.closeRematchModals();
  }
}
