import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { GameService } from '../../services/game.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../services/auth.service';
import { Game, Player, GameInfo } from '../../models/game.model';
import { User } from '../../models/user.model';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="game-container">
      <div class="game-header">
        <h1>{{ gameInfo?.hostName || 'Partida de Blackjack' }}</h1>
        <div class="game-actions">
          <div *ngIf="isHost && getPendingCardRequests() > 0" class="pending-requests">
            <span class="requests-badge">{{ getPendingCardRequests() }} solicitud(es) pendiente(s)</span>
          </div>
          <button (click)="leaveGame()" class="leave-btn">Salir del Juego</button>
        </div>
      </div>

      <div class="game-content" *ngIf="gameInfo">        
        <!-- Estado del juego -->
        <div class="game-status">
          <h2>Estado: {{ getGameStatusText() }}</h2>
          <div *ngIf="gameInfo.status === 'waiting'" class="waiting-message">
            <p>Esperando jugadores... ({{ getNonHostPlayersCount() }}/{{ gameInfo.maxPlayers }})</p>
            
            <div class="players-list">
              <h4>Jugadores en sala:</h4>
              <ul>
                <li *ngFor="let player of gameInfo.players">
                  {{ player.user?.fullName || player.user?.email || 'Usuario' }}
                  <span *ngIf="player.isHost" class="host-badge">HOST</span>
                  <span *ngIf="player.userId === currentUser?.id" class="you-badge">TÚ</span>
                </li>
              </ul>
            </div>
            <button 
              *ngIf="isHost && (gameInfo.players?.length || 0) >= 2" 
              (click)="startGame()" 
              class="start-btn"
              [disabled]="isLoading"
            >
              {{ isLoading ? 'Iniciando...' : 'Iniciar Juego' }}
            </button>
            <p *ngIf="isHost && (gameInfo.players?.length || 0) < 2" class="need-players">
              Se necesitan al menos 2 jugadores para iniciar
            </p>
            <p *ngIf="!isHost" class="waiting-host">
              Esperando a que el host inicie el juego...
            </p>
          </div>
        </div>

        <!-- Mesa de juego -->
        <div class="game-table" *ngIf="gameInfo.status !== 'waiting'">
          
          <!-- Área de jugadores -->
              <div class="players-area">
            <div 
              *ngFor="let player of gameInfo.players" 
              class="player-slot"
              [class.current-player]="isCurrentPlayer(player)"
              [class.current-user]="isCurrentUser(player)"
              [class.finished]="player.isFinished"
              [class.standing]="player.isStand || player.isStanding"
            >
              <div class="player-info">
                <h3>
                  {{ player.user?.fullName || player.user?.email || player.name || 'Usuario' }}
                  <span *ngIf="player.isHost" class="host-badge">DEALER</span>
                  <span *ngIf="isCurrentUser(player)" class="you-badge">TÚ</span>
                </h3>
                <div class="player-stats">
                  <span class="points" *ngIf="isHost || isCurrentUser(player)">
                    Puntos: {{ player.totalPoints || player.points || 0 }}
                  </span>
                  <span class="points" *ngIf="!isHost && !isCurrentUser(player) && !player.isHost">
                    Puntos: ???
                  </span>
                  <!-- Para el dealer, mostrar puntos solo al final del juego o si eres el dealer -->
                  <span class="points" *ngIf="!isHost && !isCurrentUser(player) && player.isHost && gameInfo.status === 'finished'">
                    Puntos: {{ player.totalPoints || player.points || 0 }}
                  </span>
                  <span class="points" *ngIf="!isHost && !isCurrentUser(player) && player.isHost && gameInfo.status !== 'finished'">
                    Puntos: ???
                  </span>
                  <span class="status" 
                        [class.busted]="isHost && (player.totalPoints || player.points || 0) > 21"
                        [class.blackjack]="isHost && (player.totalPoints || player.points || 0) === 21 && player.cards?.length === 2">
                    {{ getPlayerStatus(player) }}
                  </span>
                </div>
              </div>              <!-- Cartas del jugador -->
              <div class="player-cards">
                <!-- Mostrar cartas formateadas del backend -->
                <div 
                  *ngFor="let card of getPlayerCards(player)" 
                  class="card"
                  [class]="getCardImageClass(card)"
                  [class.hidden]="shouldHideCard(player, card)"
                >
                  <div class="card-content" *ngIf="!shouldHideCard(player, card)">
                    <div class="card-value">{{ getCardDisplay(card) }}</div>
                  </div>
                  <div class="card-content card-back-content" *ngIf="shouldHideCard(player, card)">
                    <div class="card-back-pattern">🂠</div>
                  </div>
                </div>
                
                <!-- Mazo visual para el dealer -->
                <div *ngIf="player.isHost" class="dealer-deck">
                  <div class="deck-card">
                    <div class="deck-content">
                      <div class="deck-pattern">🃏</div>
                      <div class="deck-label">MAZO</div>
                    </div>
                  </div>
                </div>
                
                <div *ngIf="!getPlayerCards(player) || getPlayerCards(player).length === 0" class="no-cards">
                  Sin cartas
                </div>
              </div>

              <!-- Acciones del jugador -->
              <div class="player-actions" *ngIf="gameInfo.status === 'playing'">
                <!-- Botones para el jugador actual en su turno (SOLO para jugadores NO-HOST) -->
                <div *ngIf="isCurrentUser(player) && isCurrentPlayer(player) && !player.isHost" class="current-player-actions">
                  <button 
                    (click)="requestCard()" 
                    class="action-btn hit-btn"
                    [disabled]="isLoading || (player.isStand || player.isStanding) || player.isFinished || player.hasCardRequest"
                  >
                    {{ player.hasCardRequest ? 'Esperando al anfitrión...' : (isLoading ? 'Solicitando...' : 'Pedir Carta') }}
                  </button>
                  <button 
                    (click)="stand()" 
                    class="action-btn stand-btn"
                    [disabled]="isLoading || (player.isStand || player.isStanding) || player.isFinished"
                  >
                    {{ isLoading ? 'Plantándose...' : 'Plantarse' }}
                  </button>
                </div>
                
                <!-- Alertas de solicitud de carta para el host -->
                <div *ngIf="isHost && player.hasCardRequest" class="card-request-alert">
                  <p class="request-message">🃏 {{ player.user?.fullName || player.user?.email || player.name }} está pidiendo una carta</p>
                  <button 
                    (click)="dealCardToPlayer(player.id)" 
                    class="action-btn approve-btn"
                    [disabled]="isLoading"
                  >
                    {{ isLoading ? 'Dando carta...' : 'Dar Carta' }}
                  </button>
                </div>
                
                <!-- Solo mensaje informativo cuando es el turno de otro jugador -->
                <div *ngIf="isHost && !isCurrentUser(player) && isCurrentPlayer(player) && !player.hasCardRequest" class="host-actions">
                  <p class="turn-indicator">Es el turno de {{ player.user?.fullName || player.user?.email || player.name }}</p>
                  <p class="host-instruction">⏳ Esperando que {{ player.user?.fullName || player.name }} solicite una carta o se plante</p>
                </div>
                
                <!-- Indicador de espera para otros jugadores -->
                <div *ngIf="!isCurrentUser(player) && !isHost && isCurrentPlayer(player)" class="waiting-indicator">
                  <p>Esperando que {{ player.user?.fullName || player.user?.email || player.name }} tome su turno...</p>
                </div>
                
                <!-- Indicación especial para el dealer -->
                <div *ngIf="player.isHost && isCurrentPlayer(player)" class="dealer-turn-indicator">
                  <p>🎲 Es el turno del dealer - revelando cartas...</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Información del turno -->
          <div class="turn-info" *ngIf="gameInfo.status === 'playing'">
            <p *ngIf="gameInfo.currentPlayerTurn">
              Turno de: <strong>{{ getCurrentPlayerName() }}</strong>
            </p>
            <p *ngIf="isHost" class="host-privilege">
              <i>Como dealer, puedes ver todas las cartas y puntos de los jugadores. Tu objetivo es repartir cartas y competir al final del juego.</i>
            </p>
          </div>

          <!-- Resultado del juego -->
          <div class="game-result" *ngIf="gameInfo.status === 'finished'">
            <h2>🎉 Juego Terminado</h2>
            <div *ngIf="gameInfo.winner" class="winner-announcement">
              <h3>¡Ganador: {{ gameInfo.winner.user?.fullName || gameInfo.winner.user?.email || gameInfo.winner.name }}!</h3>
              <p>Puntos: {{ gameInfo.winner.totalPoints || gameInfo.winner.points }}</p>
              <p *ngIf="gameInfo.winner.isHost" class="dealer-win">🎲 ¡El dealer ganó esta ronda!</p>
              <p *ngIf="!gameInfo.winner.isHost" class="player-win">🎉 ¡Un jugador le ganó al dealer!</p>
            </div>
            <div *ngIf="!gameInfo.winner" class="no-winner">
              <h3>Empate - No hay ganador</h3>
            </div>

            <!-- Botones de revancha -->
            <div class="rematch-section" *ngIf="isHost">
              <button 
                (click)="proposeRematch()" 
                class="rematch-btn"
                [disabled]="isLoading"
              >
                {{ isLoading ? 'Proponiendo...' : 'Proponer Revancha' }}
              </button>
            </div>
          </div>
        </div>

        <div class="error-message" *ngIf="errorMessage">
          {{ errorMessage }}
        </div>
      </div>

      <!-- Loading state -->
      <div class="loading" *ngIf="!gameInfo">
        Cargando juego...
      </div>
    </div>
  `,
  styles: [`
    .game-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #0f4c75 0%, #3282b8 50%, #bbe1fa 100%);
      padding: 1rem;
    }

    .game-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 1rem 2rem;
      border-radius: 10px;
      margin-bottom: 2rem;
      backdrop-filter: blur(10px);
    }

    .game-header h1 {
      color: white;
      margin: 0;
      font-size: 1.8rem;
    }

    .game-actions {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .pending-requests {
      display: flex;
      align-items: center;
    }

    .requests-badge {
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      font-size: 0.9rem;
      font-weight: bold;
      animation: badgePulse 1.5s infinite;
    }

    @keyframes badgePulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }

    .leave-btn {
      padding: 0.5rem 1rem;
      background: rgba(231, 76, 60, 0.8);
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.3s;
    }

    .leave-btn:hover {
      background: rgba(231, 76, 60, 1);
    }

    .leave-btn:hover {
      background: rgba(231, 76, 60, 1);
    }

    .game-content {
      max-width: 1400px;
      margin: 0 auto;
    }

    .game-status {
      text-align: center;
      background: rgba(255, 255, 255, 0.95);
      padding: 1.5rem;
      border-radius: 15px;
      margin-bottom: 2rem;
    }

    .game-status h2 {
      margin: 0 0 1rem 0;
      color: #2c3e50;
    }

    .waiting-message p {
      font-size: 1.1rem;
      color: #7f8c8d;
      margin-bottom: 1rem;
    }

    .start-btn {
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #27ae60 0%, #2ecc71 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1.1rem;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .start-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .start-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .players-list {
      margin: 1rem 0;
      text-align: left;
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
      padding: 0.5rem;
      margin: 0.25rem 0;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }

    .need-players {
      color: #e67e22;
      font-weight: bold;
      margin-top: 1rem;
      font-size: 1rem;
    }

    .game-table {
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      padding: 2rem;
      min-height: 400px;
    }

    .players-area {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .player-slot {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-radius: 15px;
      padding: 1.5rem;
      border: 3px solid transparent;
      transition: all 0.3s ease;
    }

    .player-slot.current-player {
      border-color: #f39c12;
      box-shadow: 0 0 20px rgba(243, 156, 18, 0.4);
      animation: pulse 1.5s infinite;
    }

    .player-slot.current-user {
      background: linear-gradient(135deg, #e8f5e8 0%, #d4edda 100%);
      border-color: #28a745;
    }

    .player-slot.finished {
      opacity: 0.7;
    }

    .player-slot.standing {
      background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 20px rgba(243, 156, 18, 0.4); }
      50% { box-shadow: 0 0 30px rgba(243, 156, 18, 0.6); }
      100% { box-shadow: 0 0 20px rgba(243, 156, 18, 0.4); }
    }

    .player-info {
      margin-bottom: 1rem;
    }

    .player-info h3 {
      margin: 0 0 0.5rem 0;
      color: #2c3e50;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .host-badge, .you-badge {
      padding: 0.125rem 0.5rem;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: bold;
    }

    .host-badge {
      background: #f39c12;
      color: white;
    }

    .you-badge {
      background: #28a745;
      color: white;
    }

    .player-stats {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    .points {
      font-weight: bold;
      color: #2c3e50;
    }

    .status {
      padding: 0.25rem 0.5rem;
      border-radius: 10px;
      font-size: 0.875rem;
      background: #e9ecef;
      color: #6c757d;
    }

    .status.busted {
      background: #dc3545;
      color: white;
    }

    .status.blackjack {
      background: #ffc107;
      color: #212529;
    }

    .player-cards {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }

        .card {
      width: 100px;
      height: 140px;
      background: white;
      border: 2px solid #333;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: bold;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      transition: transform 0.2s, box-shadow 0.2s;
      margin: 4px;
      position: relative;
      background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
      cursor: pointer;
    }

    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.3);
    }

    .card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      position: relative;
    }

    .card-value {
      font-size: 2rem;
      font-weight: bold;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.1);
      display: flex;
      align-items: center;
      gap: 2px;
    }

    /* Estilos para los palos - colores más vibrantes */
    .card.card-hearts .card-value,
    .card.card-diamonds .card-value {
      color: #e74c3c;
    }

    .card.card-spades .card-value,
    .card.card-clubs .card-value {
      color: #2c3e50;
    }

    /* Cartas especiales */
    .card.card-a-hearts,
    .card.card-a-diamonds,
    .card.card-a-spades,
    .card.card-a-clubs {
      background: linear-gradient(145deg, #fff3cd 0%, #ffeaa7 100%);
      border: 2px solid #f39c12;
    }

    /* Estilos especiales para cartas figuras */
    .card.card-k-hearts,
    .card.card-k-diamonds,
    .card.card-k-spades,
    .card.card-k-clubs,
    .card.card-q-hearts,
    .card.card-q-diamonds,
    .card.card-q-spades,
    .card.card-q-clubs,
    .card.card-j-hearts,
    .card.card-j-diamonds,
    .card.card-j-spades,
    .card.card-j-clubs {
      background: linear-gradient(145deg, #fff3e0 0%, #ffe0b2 100%);
      border: 2px solid #ff9800;
    }

    /* Estilos especiales para ases */
    .card.card-a-hearts,
    .card.card-a-diamonds,
    .card.card-a-spades,
    .card.card-a-clubs {
      background: linear-gradient(145deg, #f3e5f5 0%, #e1bee7 100%);
      border: 2px solid #9c27b0;
      box-shadow: 0 4px 12px rgba(156, 39, 176, 0.3);
    }

    /* Animación para cartas especiales */
    .card.card-a-hearts,
    .card.card-a-diamonds,
    .card.card-a-spades,
    .card.card-a-clubs {
      animation: subtle-glow 2s ease-in-out infinite alternate;
    }

    @keyframes subtle-glow {
      from {
        box-shadow: 0 4px 12px rgba(156, 39, 176, 0.3);
      }
      to {
        box-shadow: 0 4px 16px rgba(156, 39, 176, 0.5);
      }
    }

    .no-cards {
      color: #666;
      font-style: italic;
      padding: 1rem;
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      border: 2px dashed #ccc;
    }

    .card.hidden {
      background: linear-gradient(145deg, #2c3e50 0%, #34495e 100%);
      color: white;
      border: 2px solid #1a252f;
    }

    .card-back-content {
      color: #ecf0f1;
    }

    .card-back-pattern {
      font-size: 2rem;
      color: #95a5a6;
    }

    .dealer-deck {
      display: flex;
      align-items: center;
      margin-left: 1rem;
    }

    .deck-card {
      width: 80px;
      height: 112px;
      background: linear-gradient(145deg, #2c3e50 0%, #34495e 100%);
      border: 2px solid #1a252f;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
      position: relative;
      transform: rotate(5deg);
      animation: deckFloat 3s ease-in-out infinite;
    }

    .deck-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ecf0f1;
    }

    .deck-pattern {
      font-size: 1.5rem;
      margin-bottom: 0.25rem;
    }

    .deck-label {
      font-size: 0.6rem;
      font-weight: bold;
      letter-spacing: 1px;
    }

    @keyframes deckFloat {
      0%, 100% { transform: rotate(5deg) translateY(0px); }
      50% { transform: rotate(5deg) translateY(-3px); }
    }

    .no-cards {
      color: #6c757d;
      font-style: italic;
    }

    .player-actions {
      margin-top: 1rem;
    }

    .current-player-actions,
    .host-actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .action-btn {
      flex: 1;
      min-width: 120px;
      padding: 0.75rem;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s;
      font-size: 0.9rem;
    }

    .hit-btn {
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
      color: white;
    }

    .stand-btn {
      background: linear-gradient(135deg, #e67e22 0%, #d35400 100%);
      color: white;
    }

    .host-deal-btn {
      background: linear-gradient(135deg, #27ae60 0%, #229954 100%);
      color: white;
    }

    .host-stand-btn {
      background: linear-gradient(135deg, #8e44ad 0%, #7d3c98 100%);
      color: white;
    }

    .action-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .action-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .turn-indicator {
      width: 100%;
      margin: 0 0 0.5rem 0;
      padding: 0.5rem;
      background: rgba(52, 152, 219, 0.1);
      border-radius: 6px;
      text-align: center;
      font-weight: bold;
      color: #2c3e50;
    }

    .waiting-indicator {
      padding: 0.75rem;
      background: rgba(149, 165, 166, 0.1);
      border-radius: 8px;
      text-align: center;
      margin-top: 1rem;
    }

    .waiting-indicator p {
      margin: 0;
      color: #7f8c8d;
      font-style: italic;
    }

    .card-request-alert {
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
      color: white;
      padding: 1rem;
      border-radius: 10px;
      margin-top: 1rem;
      border: 2px solid #e65100;
      animation: requestPulse 1.5s infinite;
    }

    .request-message {
      margin: 0 0 0.75rem 0;
      font-weight: bold;
      text-align: center;
      font-size: 1rem;
    }

    .approve-btn {
      background: linear-gradient(135deg, #4caf50 0%, #388e3c 100%);
      color: white;
      width: 100%;
      padding: 0.75rem;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .approve-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .approve-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    @keyframes requestPulse {
      0% { box-shadow: 0 0 20px rgba(255, 152, 0, 0.5); }
      50% { box-shadow: 0 0 30px rgba(255, 152, 0, 0.8); }
      100% { box-shadow: 0 0 20px rgba(255, 152, 0, 0.5); }
    }

    .turn-info {
      text-align: center;
      padding: 1rem;
      background: rgba(52, 152, 219, 0.1);
      border-radius: 10px;
      margin-bottom: 1rem;
    }

    .turn-info p {
      margin: 0;
      font-size: 1.1rem;
      color: #2c3e50;
    }

    .host-privilege {
      font-size: 0.9rem !important;
      color: #f39c12 !important;
      margin-top: 0.5rem !important;
      font-style: italic;
    }

    .game-result {
      text-align: center;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      padding: 2rem;
      border-radius: 15px;
      margin-bottom: 1rem;
    }

    .game-result h2 {
      margin: 0 0 1rem 0;
      color: #2c3e50;
    }

    .winner-announcement h3 {
      color: #27ae60;
      margin: 0 0 0.5rem 0;
    }

    .no-winner h3 {
      color: #f39c12;
      margin: 0;
    }

    .rematch-section {
      margin-top: 1.5rem;
    }

    .rematch-btn {
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1.1rem;
      cursor: pointer;
      transition: transform 0.2s;
    }

    .rematch-btn:hover:not(:disabled) {
      transform: translateY(-2px);
    }

    .rematch-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .error-message {
      background: #dc3545;
      color: white;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
      margin-top: 1rem;
    }

    .waiting-host {
      color: #3498db;
      font-weight: bold;
      margin-top: 1rem;
      font-size: 1rem;
    }

    .loading {
      text-align: center;
      color: white;
      font-size: 1.2rem;
      padding: 3rem;
    }
  `]
})
export class GameComponent implements OnInit, OnDestroy {
  gameId!: number;
  gameInfo: any | null = null;
  currentUser: User | null = null;
  isLoading = false;
  errorMessage = '';
  private subscriptions: Subscription[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private gameService: GameService,
    private socketService: SocketService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.gameId = +this.route.snapshot.params['id'];
    this.currentUser = this.authService.getCurrentUser();
    
    this.loadGameInfo();
    this.setupSocketListeners();
    
    // Unirse a la sala del juego
    this.socketService.joinGameRoom(this.gameId);

    // Actualizar el estado del juego cada 5 segundos
    const intervalSub = interval(5000).subscribe(() => {
      this.loadGameInfo();
    });
    this.subscriptions.push(intervalSub);
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.socketService.leaveGameRoom(this.gameId);
  }

  setupSocketListeners() {
    const gameUpdateSub = this.socketService.onGameUpdate().subscribe(() => {
      this.loadGameInfo();
    });

    const playerJoinedSub = this.socketService.onPlayerJoined().subscribe(() => {
      this.loadGameInfo();
    });

    const playerLeftSub = this.socketService.onPlayerLeft().subscribe(() => {
      this.loadGameInfo();
    });

    const gameStartedSub = this.socketService.onGameStarted().subscribe(() => {
      this.loadGameInfo();
    });

    const cardDealtSub = this.socketService.onCardDealt().subscribe(() => {
      this.loadGameInfo();
    });

    const playerStoodSub = this.socketService.onPlayerStood().subscribe(() => {
      this.loadGameInfo();
    });

    const gameFinishedSub = this.socketService.onGameFinished().subscribe(() => {
      this.loadGameInfo();
    });

    this.subscriptions.push(
      gameUpdateSub, 
      playerJoinedSub, 
      playerLeftSub, 
      gameStartedSub, 
      cardDealtSub, 
      playerStoodSub, 
      gameFinishedSub
    );
  }

  loadGameInfo() {
    console.log('Loading game info for game ID:', this.gameId);
    this.gameService.getGameInfo(this.gameId).subscribe({
      next: (gameInfo: any) => {
        console.log('Game info loaded:', gameInfo);
        this.gameInfo = gameInfo;
        this.errorMessage = '';
        
        // Debug adicional
        if (gameInfo && gameInfo.players) {
          console.log('Players in game:', gameInfo.players);
          console.log('Current user:', this.currentUser);
          console.log('Is host?', this.isHost);
          
          // Debug de cartas específicamente
          gameInfo.players.forEach((player: any, index: number) => {
            console.log(`Player ${index} (${player.name}):`, {
              cards: player.cards,
              formattedCards: player.formattedCards,
              cardsLength: player.cards?.length,
              formattedCardsLength: player.formattedCards?.length
            });
          });
        }
      },
      error: (error: any) => {
        console.error('Error loading game info:', error);
        this.errorMessage = 'Error al cargar la información del juego';
      }
    });
  }

  get isHost(): boolean {
    if (!this.gameInfo?.players || !this.currentUser) return false;
    return this.gameInfo.players.some((p: any) => p.userId === this.currentUser!.id && Boolean(p.isHost));
  }

  isCurrentPlayer(player: Player): boolean {
    if (!this.gameInfo) return false;
    return this.gameInfo.currentPlayerTurn === player.id;
  }

  isCurrentUser(player: Player): boolean {
    return player.userId === this.currentUser?.id;
  }

  shouldHideCard(player: Player, card: any): boolean {
    // El host puede ver todas las cartas
    if (this.isHost) {
      return false;
    }
    
    // Los jugadores pueden ver sus propias cartas
    if (this.isCurrentUser(player)) {
      return false;
    }
    
    // Para las cartas del dealer (host):
    // - Durante el juego: ocultar las cartas del dealer
    // - Al final del juego: mostrar todas las cartas del dealer
    if (player.isHost) {
      return this.gameInfo?.status !== 'finished';
    }
    
    // Ocultar cartas de otros jugadores para los no-host
    return true;
  }

  getPlayerCards(player: any): any[] {
    // Usar formattedCards del backend si está disponible
    if (player.formattedCards && player.formattedCards.length > 0) {
      // formattedCards es un array de strings formateados
      return player.formattedCards.map((cardString: string) => ({ display: cardString }));
    }
    
    // Fallback a cards originales 
    if (player.cards && player.cards.length > 0) {
      return player.cards.map((card: any) => {
        // Si la carta ya tiene formato formatted, usarlo
        if (card.formatted) {
          return { display: card.formatted };
        }
        // Sino, usar el formato original
        return { display: card.card || card };
      });
    }
    
    return [];
  }

  getCardDisplay(card: any): string {
    // Si la carta tiene la propiedad formatted del backend (que ahora es directamente el emoji)
    if (typeof card === 'object' && card.formatted) {
      return card.formatted;
    }
    
    // Si el card es un objeto con display
    if (typeof card === 'object' && card.display) {
      return card.display;
    }
    
    // Si es un string directo (ya formateado con emoji)
    if (typeof card === 'string') {
      return card;
    }
    
    // Fallback - mostrar la carta tal como viene
    return card?.card || card || '?';
  }

  getCardImageClass(card: any): string {
    // Extraer el valor y el palo para generar clases CSS
    let cardString = '';
    
    if (typeof card === 'object' && card.display) {
      cardString = card.display;
    } else if (typeof card === 'string') {
      cardString = card;
    } else {
      return 'card-back';
    }
    
    if (!cardString) return 'card-back';
    
    const value = cardString.slice(0, -2); // Remover emoji del palo
    const suitEmoji = cardString.slice(-2); // Último carácter es el emoji del palo
    
    let suit = '';
    switch(suitEmoji) {
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
    
    // Si no eres el host y no es tu jugador, mostrar estado genérico
    if (!this.isHost && !this.isCurrentUser(player)) {
      if (player.isStand || player.isStanding) return 'Plantado';
      if (player.isFinished) return 'Terminado';
      return 'Jugando';
    }
    
    // Para el host o el propio jugador, mostrar información completa
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
    if (!this.gameInfo?.currentPlayerTurn || !this.gameInfo?.players) return 'Desconocido';
    const currentPlayer = this.gameInfo.players.find((p: any) => p.id === this.gameInfo!.currentPlayerTurn);
    return currentPlayer?.user?.fullName || currentPlayer?.user?.email || 'Desconocido';
  }

  startGame() {
    if (!this.gameInfo?.players) return;
    
    console.log('Starting game...', this.gameInfo);
    this.isLoading = true;
    this.errorMessage = '';
    
    const hostPlayer = this.gameInfo.players.find((p: any) => Boolean(p.isHost));
    if (!hostPlayer) {
      this.errorMessage = 'No se pudo encontrar el host del juego';
      this.isLoading = false;
      console.error('Host player not found', this.gameInfo.players);
      return;
    }

    console.log('Host player found:', hostPlayer);

    this.gameService.startGame(this.gameId, hostPlayer.id).subscribe({
      next: (response) => {
        console.log('Game start response:', response);
        this.isLoading = false;
        this.loadGameInfo();
      },
      error: (error: any) => {
        console.error('Error starting game:', error);
        this.errorMessage = error.error?.message || 'Error al iniciar el juego';
        this.isLoading = false;
      }
    });
  }

  requestCard() {
    if (!this.gameInfo) return;
    
    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.requestCard().subscribe({
      next: (response) => {
        this.isLoading = false;
        this.loadGameInfo();
        // Mostrar mensaje de confirmación
        console.log('Solicitud de carta enviada:', response.message);
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al solicitar carta';
        this.isLoading = false;
      }
    });
  }

  stand() {
    if (!this.gameInfo) return;
    
    this.isLoading = true;
    this.errorMessage = '';

    // Usar el método stand() sin parámetros para que el jugador se plante a sí mismo
    this.gameService.stand().subscribe({
      next: () => {
        this.isLoading = false;
        this.loadGameInfo();
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al plantarse';
        this.isLoading = false;
      }
    });
  }

  dealCardToPlayer(playerId: number) {
    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.dealCardToPlayer(playerId).subscribe({
      next: () => {
        this.isLoading = false;
        this.loadGameInfo();
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al dar carta';
        this.isLoading = false;
      }
    });
  }

  standPlayerAsHost(playerId: number) {
    this.isLoading = true;
    this.errorMessage = '';

    this.gameService.standPlayer(playerId).subscribe({
      next: () => {
        this.isLoading = false;
        this.loadGameInfo();
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al plantar jugador';
        this.isLoading = false;
      }
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
        // Aquí podrías mostrar un mensaje de éxito
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Error al proponer revancha';
        this.isLoading = false;
      }
    });
  }

  leaveGame() {
    this.gameService.leaveGame().subscribe({
      next: () => {
        this.router.navigate(['/lobby']);
      },
      error: (error: any) => {
        console.error('Error leaving game:', error);
        // Incluso si hay error, redirigir al lobby
        this.router.navigate(['/lobby']);
      }
    });
  }

  getNonHostPlayersCount(): number {
    if (!this.gameInfo?.players) return 0;
    return this.gameInfo.players.filter((player: any) => !Boolean(player.isHost)).length;
  }

  getPendingCardRequests(): number {
    if (!this.gameInfo?.players) return 0;
    return this.gameInfo.players.filter((player: any) => Boolean(player.hasCardRequest)).length;
  }
}
