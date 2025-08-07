// game.component.ts - Versión corregida con gestión correcta de sockets
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

  // ✅ Propiedades para revancha
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

    console.log('🎮 Iniciando GameComponent para partida:', this.gameId);

    if (!this.currentUser) {
      console.error('[INIT] ❌ No hay usuario autenticado');
      this.router.navigate(['/auth/login']);
      return;
    }

    // Suscribirse a cambios en los parámetros de ruta
    const routeSub = this.route.params.subscribe(params => {
      const newGameId = +params['id'];
      if (newGameId !== this.gameId) {
        console.log('🔄 Cambio de partida detectado:', this.gameId, '->', newGameId);
        this.handleGameChange(newGameId);
      }
    });
    this.subscriptions.push(routeSub);

    this.initializeSocketConnection();
  }

  private handleGameChange(newGameId: number) {
    console.log('⚡ Manejando cambio de partida:', this.gameId, '->', newGameId);
    
    // Salir de la sala actual
    if (this.gameId) {
      this.socketService.leaveGameRoom(this.gameId);
    }
    
    // Actualizar ID de partida
    this.gameId = newGameId;
    
    // Limpiar estado anterior
    this.gameInfo = null;
    this.errorMessage = '';
    this.closeRematchModals();
    
    // Unirse a nueva sala y cargar información
    setTimeout(() => {
      console.log('🚪 Uniéndose a nueva sala:', this.gameId);
      this.socketService.joinGameRoom(this.gameId);
      
      setTimeout(() => {
        console.log('📊 Cargando info de nueva partida...');
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
          
          // ✅ CARGAR info inicial con delay para asegurar que está en la sala
          setTimeout(() => {
            console.log('[SOCKET] 📊 Cargando info inicial del juego...');
            this.loadGameInfo();
          }, 500); // Aumentado el delay
        }
      }
    );

    this.subscriptions.push(connectionSub);
  }

  ngOnDestroy() {
    
    this.subscriptions.forEach((sub) => sub.unsubscribe());
    this.subscriptions = [];
    
    // Salir de la sala
    this.socketService.leaveGameRoom(this.gameId);
    
    // Marcar que los listeners ya no están configurados
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

    const rematchEvents = [
      'chisme:rematchProposed',
      'chisme:rematchResponse'
    ];

    events.forEach(eventName => {
      const subscription = this.socketService.on(eventName).pipe(
        catchError((error) => {
          return of(null);
        }),
        retry({ count: 3, delay: 1000 }) // Reintentar hasta 3 veces con 1s de delay
      ).subscribe({
        next: (data) => {
          if (data !== null) { // Solo procesar si no es el valor null del catchError

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
        // Solo redirigir si NO estamos en proceso de revancha
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
    
    // ✅ CAMBIO: Configurar listeners de revancha
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
            (p: any) => p.id === gameInfo.winnerId
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

  // ✅ CAMBIO 9: Método para debug (temporal)
  debugSocketState() {
    
    // ✅ Obtener el valor actual del Observable
    this.socketService.isConnected$.subscribe(connected => {
      console.log('Socket connected:', connected);
    }).unsubscribe();
    
    console.log('Listeners setup:', this.socketListenersSetup);
    console.log('Active subscriptions:', this.subscriptions.length);
    console.log('Game ID:', this.gameId);
    console.log('========================');
  }

  // ✅ Resto de métodos permanecen igual
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
    // ✅ Si el juego ha terminado, mostrar todas las cartas
    if (this.gameInfo?.status === 'finished') {
      return false;
    }

    // Si eres el host, puedes ver todas las cartas siempre
    if (this.isHost) {
      return false;
    }

    // Siempre puedes ver tus propias cartas
    if (this.isCurrentUser(player)) {
      return false;
    }

    // Las cartas del dealer se ocultan hasta que el juego termine
    if (player.isHost) {
      return true; // Ocultar cartas del dealer hasta el final
    }

    // Ocultar cartas de otros jugadores durante el juego
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

    // ✅ Cuando el juego termine, mostrar información completa para todos
    if (this.gameInfo?.status === 'finished') {
      if (points > 21) return 'Pasado (' + points + ')';
      if (points === 21 && cardCount === 2) return 'Blackjack!';
      if (player.isStand || player.isStanding) return 'Plantado (' + points + ')';
      return 'Terminado (' + points + ')';
    }

    // Durante el juego, mostrar información limitada para otros jugadores
    if (!this.isHost && !this.isCurrentUser(player)) {
      if (player.isStand || player.isStanding) return 'Plantado';
      if (player.isFinished) return 'Terminado';
      return 'Jugando';
    }

    // Para el host o el propio jugador, siempre mostrar información completa
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
        // ✅ No llamar loadGameInfo aquí, se hará automáticamente por el socket
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

    this.gameService.requestCard().subscribe({
      next: (response) => {
        this.isLoading = false;
        // ✅ No llamar loadGameInfo aquí, se hará automáticamente por el socket
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

    this.gameService.stand().subscribe({
      next: () => {
        this.isLoading = false;
        // ✅ No llamar loadGameInfo aquí, se hará automáticamente por el socket
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
        // ✅ No llamar loadGameInfo aquí, se hará automáticamente por el socket
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
        // ✅ No llamar loadGameInfo aquí, se hará automáticamente por el socket
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
    this.gameService.leaveGame().subscribe({
      next: () => {
        this.router.navigate(['/lobby']);
      },
      error: (error: any) => {
        console.error('Error leaving game:', error);
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

  // ✅ ================================
  // ✅     MÉTODOS DE REVANCHA
  // ✅ ================================

  private setupRematchListeners() {
    // Listener para cuando se propone revancha
    const rematchProposedSub = this.socketService.on('chisme:rematchProposed').subscribe({
      next: (data) => {
        console.log('🎮 Revancha propuesta recibida:', data);
        this.ngZone.run(() => {
          this.handleRematchProposed(data);
        });
      },
      error: (err) => console.error('Error en rematchProposed:', err),
    });

    // Listener para respuestas de revancha
    const rematchResponseSub = this.socketService.on('chisme:rematchResponse').subscribe({
      next: (data) => {
        console.log('💬 Respuesta de revancha recibida:', data);
        this.ngZone.run(() => {
          this.handleRematchResponse(data);
        });
      },
      error: (err) => console.error('Error en rematchResponse:', err),
    });

    // Listener adicional para cuando se crea un nuevo juego (revancha exitosa)
    const newGameFromRematchSub = this.socketService.on('chisme:newGameCreated').subscribe({
      next: (data) => {
        console.log('🎮 Nuevo juego creado desde revancha:', data);
        if (data?.newGame?.id && this.showWaitingModal) {
          // Solo procesar si estamos esperando una revancha
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

    this.subscriptions.push(rematchProposedSub, rematchResponseSub, newGameFromRematchSub);
  }

  private handleRematchProposed(data: any) {
    console.log('📄 [DEBUG] Datos de revancha propuesta:', JSON.stringify(data, null, 2));
    console.log('📄 [DEBUG] ¿Eres host?', this.isHost);
    
    if (this.isHost) {
      // Si eres el host, mostrar modal de espera
      this.showWaitingModal = true;
      this.rematchData = data.rematch;
      console.log('📄 [DEBUG] Host - rematchData:', JSON.stringify(this.rematchData, null, 2));
      this.initializeRematchResponses();
      console.log('📄 [DEBUG] Host - respuestas inicializadas:', this.rematchResponses);
    } else {
      // Si no eres el host, mostrar modal para responder
      this.showRematchModal = true;
      this.rematchData = data.rematch;
      console.log('📄 [DEBUG] No-Host - rematchData:', JSON.stringify(this.rematchData, null, 2));
      
      // Encontrar tu ID de jugador
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
    const { playerId, accepted, result } = data;
    console.log('📝 [DEBUG] playerId:', playerId, 'accepted:', accepted);
    console.log('📝 [DEBUG] result:', JSON.stringify(result, null, 2));
    console.log('📝 [DEBUG] rematchResponses antes:', this.rematchResponses);

    // Verificar si hay un newGameId en el resultado Y es MI respuesta
    if (accepted && result?.newGameId && playerId === this.currentPlayerId) {
      console.log('🎆 [DEBUG] ¡YO acepté y hay newGameId!', result.newGameId);
      console.log('🎆 [DEBUG] Mi playerId:', this.currentPlayerId, 'Respuesta de:', playerId);
      // Si no eres el host, redirigir inmediatamente
      if (!this.isHost) {
        console.log('🚀 [DEBUG] No-Host: Redirigiendo inmediatamente a:', result.newGameId);
        setTimeout(() => {
          this.navigateToNewGame(result.newGameId);
        }, 1000);
        return; // Salir temprano para no procesar lógica del host
      }
    } else if (accepted && result?.newGameId && playerId !== this.currentPlayerId) {
      console.log('📞 [DEBUG] Otro usuario aceptó:', playerId, '(yo soy:', this.currentPlayerId, ')');
    }

    // Actualizar la respuesta en la lista (solo para host)
    const responseIndex = this.rematchResponses.findIndex(
      (r) => r.playerId === playerId
    );
    console.log('📝 [DEBUG] responseIndex encontrado:', responseIndex);

    if (responseIndex !== -1) {
      this.rematchResponses[responseIndex] = {
        ...this.rematchResponses[responseIndex],
        accepted,
        responded: true,
      };
      console.log('📝 [DEBUG] rematchResponses después:', this.rematchResponses);
    }

    // Verificar si todos han respondido y aceptado (solo para host)
    this.checkAllRematchResponses();
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

  private checkAllRematchResponses() {
    if (this.rematchResponses.length === 0) {
      console.log('⚠️ No hay respuestas de revancha para verificar');
      return;
    }

    console.log('🔍 Verificando estado de respuestas:', {
      responses: this.rematchResponses,
      totalResponses: this.rematchResponses.length
    });

    const allResponded = this.rematchResponses.every((r) => r.responded);
    const allAccepted = this.rematchResponses.every((r) => r.accepted);
    const anyRejected = this.rematchResponses.some((r) => r.responded && !r.accepted);

    console.log('📊 Estado actual:', {
      allResponded,
      allAccepted, 
      anyRejected,
      newGameId: this.rematchData?.newGameId
    });

    if (anyRejected) {
      // Si alguien rechazó, cancelar inmediatamente
      console.log('❌ Revancha cancelada - alguien rechazó');
      this.rematchStatus = 'failed';
      setTimeout(() => {
        this.closeRematchModals();
      }, 3000);
    } else if (allResponded && allAccepted) {
      // ¡Todos aceptaron! Mostrar éxito y luego redirigir
      console.log('🎉 ¡Todos aceptaron la revancha! Redirigiendo a:', this.rematchData?.newGameId);
      this.rematchStatus = 'success';
      
      if (this.rematchData?.newGameId) {
        // Mostrar mensaje de éxito primero, luego navegar con mejor manejo
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
    
    // 1. Limpiar estado actual
    this.closeRematchModals();
    
    // 2. Salir de la sala actual
    console.log('🚪 Saliendo de sala actual:', this.gameId);
    this.socketService.leaveGameRoom(this.gameId);
    
    // 3. Navegar a la nueva partida
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
          // Cambiar a modo espera
          this.showRematchModal = false;
          this.showWaitingModal = true;
          this.initializeRematchResponses();
          // Marcar tu respuesta como aceptada
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
    // Solo permite cerrar si no es obligatorio responder
    this.showRematchModal = false;
  }

  closeRematchModals() {
    this.showRematchModal = false;
    this.showWaitingModal = false;
    this.rematchData = null;
    this.rematchResponses = [];
  }

  cancelRematch() {
    // Método para que el host cancele la revancha
    this.closeRematchModals();
    console.log('Revancha cancelada por el host');
  }
}
