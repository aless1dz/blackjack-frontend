import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { 
  Game, 
  GameStatus, 
  CreateGameRequest, 
  Player, 
  RematchResponse, 
  GameInfo 
} from '../models/game.model';

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private apiUrl = 'http://localhost:3334/api';

  constructor(private http: HttpClient) {}

  // Crear un nuevo juego
  createGame(data: CreateGameRequest): Observable<Game> {
    return this.http.post<any>(`${this.apiUrl}/games`, data).pipe(
      tap(response => console.log('Create game response:', response)),
      map(response => {
        // Si la respuesta tiene un wrapper, extraer el juego
        if (response.game) {
          return response.game;
        }
        // Si la respuesta es directamente el juego
        return response;
      })
    );
  }

  // Unirse a un juego existente
  joinGame(gameId: number): Observable<Player> {
    return this.http.post<Player>(`${this.apiUrl}/games/${gameId}/join`, {});
  }

  // Iniciar un juego
  startGame(gameId: number, hostPlayerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/start`, { hostPlayerId });
  }

  // Solicitar una carta (solicitar al host)
  requestCard(): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/request-card`, {});
  }

  // Plantarse (no pedir más cartas)
  stand(): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/stand`, {});
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

  // Salir del juego
  leaveGame(): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/leave`, {});
  }

  // Revelar cartas y finalizar
  revealAndFinish(gameId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/reveal-and-finish`, {});
  }

  // Proponer revancha
  proposeRematch(gameId: number, hostPlayerId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/propose-rematch`, { hostPlayerId });
  }

  // Responder a revancha
  respondToRematch(gameId: number, playerId: number, accepted: boolean): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${gameId}/respond-rematch`, { 
      playerId, 
      accepted 
    });
  }

  // Crear revancha
  createRematch(originalGameId: number, acceptedPlayers: number[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/games/${originalGameId}/create-rematch`, { 
      acceptedPlayers 
    });
  }

  // Listar juegos disponibles
  listAvailableGames(): Observable<Game[]> {
    return this.http.get<Game[]>(`${this.apiUrl}/games/available`);
  }
}
