import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private connectionStatus = new BehaviorSubject<boolean>(false);
  public isConnected$ = this.connectionStatus.asObservable();

  constructor(private authService: AuthService) {}

  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      console.warn('No token available for socket connection');
      return;
    }

    this.socket = io('http://localhost:3334', {
      auth: {
        token: token
      },
      transports: ['websocket']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.connectionStatus.next(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.connectionStatus.next(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.connectionStatus.next(false);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionStatus.next(false);
    }
  }

  // Unirse a una sala de juego
  joinGameRoom(gameId: number): void {
    if (this.socket) {
      this.socket.emit('joinGame', { gameId });
    }
  }

  // Salir de una sala de juego
  leaveGameRoom(gameId: number): void {
    if (this.socket) {
      this.socket.emit('leaveGame', { gameId });
    }
  }

  // Escuchar eventos del juego
  onGameUpdate(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('gameUpdate', (data) => observer.next(data));
      }
    });
  }

  onPlayerJoined(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('playerJoined', (data) => observer.next(data));
      }
    });
  }

  onPlayerLeft(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('playerLeft', (data) => observer.next(data));
      }
    });
  }

  onGameStarted(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('gameStarted', (data) => observer.next(data));
      }
    });
  }

  onCardDealt(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('cardDealt', (data) => observer.next(data));
      }
    });
  }

  onPlayerStood(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('playerStood', (data) => observer.next(data));
      }
    });
  }

  onGameFinished(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('gameFinished', (data) => observer.next(data));
      }
    });
  }

  onRematchProposed(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('rematchProposed', (data) => observer.next(data));
      }
    });
  }

  onRematchResponse(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('rematchResponse', (data) => observer.next(data));
      }
    });
  }

  onNewGameCreated(): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on('newGameCreated', (data) => observer.next(data));
      }
    });
  }

  // Emitir eventos
  emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  // Método genérico para escuchar cualquier evento
  on(event: string): Observable<any> {
    return new Observable(observer => {
      if (this.socket) {
        this.socket.on(event, (data) => observer.next(data));
      }
    });
  }
}
