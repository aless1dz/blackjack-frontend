import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import {
  Game,
  GameStatus,
  CreateGameRequest,
  Player,
  RematchResponse,
  GameInfo,
} from '../models/game.model';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class GameService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private authService: AuthService) {}

  // Crear un nuevo juego
  createGame(data: CreateGameRequest): Observable<Game> {
    return this.http.post<any>(`${this.apiUrl}/games`, data).pipe(
      tap((response) => console.log('Create game response:', response)),
      map((response) => {
        if (response.game) {
          return response.game;
        }
        return response;
      })
    );
  }

  joinGame(gameId: number): Observable<Player> {
    return this.http.post<Player>(`${this.apiUrl}/games/${gameId}/join`, {});
  }

  startGame(gameId: number, hostPlayerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/start`, {
      hostPlayerId,
    });
  }

  // Solicitar una carta (solicitar al host) - REQUIERE gameId específico
  requestCard(gameId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/request-card`, { gameId });
  }

  // Plantarse (no pedir más cartas) - REQUIERE gameId específico
  stand(gameId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/stand`, { gameId });
  }

  // Dar carta a un jugador específico (para el host)
  dealCardToPlayer(playerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/deal-card`, { playerId });
  }

  // Plantar a un jugador específico (para el host)
  standPlayer(playerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/stand-player`, { playerId });
  }

  // Obtener estado del juego
  getGameStatus(gameId: number): Observable<GameStatus> {
    return this.http.get<GameStatus>(`${this.apiUrl}/games/${gameId}/status`);
  }

  // Obtener información del juego
  getGameInfo(gameId: number): Observable<GameInfo> {
    return this.http.get<GameInfo>(`${this.apiUrl}/games/${gameId}/info`);
  }

  // Finalizar juego
  finishGame(gameId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/finish`, {});
  }

  // Salir del juego - REQUIERE gameId específico
  leaveGame(gameId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/leave`, { gameId });
  }

  // Revelar cartas y finalizar
  revealAndFinish(gameId: number): Observable<any> {
    return this.http.post(
      `${this.apiUrl}/games/${gameId}/reveal-and-finish`,
      {}
    );
  }

  // Proponer revancha
  proposeRematch(gameId: number, hostPlayerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/propose-rematch`, {
      hostPlayerId,
    });
  }

  // Responder a revancha
  respondToRematch(
    gameId: number,
    playerId: number,
    accepted: boolean
  ): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/respond-rematch`, {
      playerId,
      accepted,
    });
  }


  // Obtener jugadores para revancha
  getPlayersForRematch(gameId: number): Observable<any> {
    return this.http.get<any>(
      `${this.apiUrl}/games/${gameId}/players-for-rematch`
    );
  }

  // Listar juegos disponibles
  listAvailableGames(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.apiUrl}/games/available`);
  }

  getCurrentUserId(): number {
    const user = this.authService.getCurrentUser();
    if (!user) return 0;
    return user.id;
  }


  getRematchInfo(gameId: string): Observable<any> {
    console.log('ℹ️ Obteniendo información de revancha para:', gameId);

    // Usando la ruta existente que ya tienes
    return this.http
      .get<any>(`${this.apiUrl}/games/${gameId}/players-for-rematch`)
      .pipe(
        map((response) => ({
          players: response.players || response.playersToNotify || [],
          ...response,
        })),
        catchError((error) => {
          console.error('❌ Error al obtener información de revancha:', error);
          return throwError(() => error);
        })
      );
  }

  
}
