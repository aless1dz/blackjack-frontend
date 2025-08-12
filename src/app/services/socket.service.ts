import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, share, takeUntil } from 'rxjs';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

const socketUrl = environment.apiUrlSockets;

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: Socket | null = null;
  private connectionStatus = new BehaviorSubject<boolean>(false);
  public isConnected$ = this.connectionStatus.asObservable();
  
  private eventObservables = new Map<string, Observable<any>>();
  private destroy$ = new Subject<void>();
  
  constructor(private authService: AuthService) {}

  connect(): void {
    if (this.socket?.connected) {
      console.log('[SOCKET] ✅ Ya conectado');
      return;
    }

    const token = this.authService.getToken();
    if (!token) {
      return;
    }

    
    this.cleanup();

    this.socket = io(socketUrl, {
      auth: { token: token },
      transports: ['websocket', 'polling'], 
      forceNew: false, 
      timeout: 5000, 
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000, 
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log('[SOCKET] ✅ Socket connected successfully');
      console.log(`[SOCKET] 🆔 Socket ID: ${this.socket?.id}`);
      this.connectionStatus.next(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[SOCKET] ❌ Desconectando socket...`);
      console.log(`[SOCKET] 📊 Razón: ${reason}`);
      this.connectionStatus.next(false);
      this.eventObservables.clear(); 
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SOCKET] ❌ Error de conexión:', error?.message || error);
      this.connectionStatus.next(false);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`[SOCKET] 🔄 Reconectado después de ${attemptNumber} intentos`);
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[SOCKET] 🔄 Intento de reconexión #${attemptNumber}`);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('[SOCKET] ❌ Error en reconexión:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[SOCKET] 💥 Falló la reconexión después de todos los intentos');
    });
  }

  disconnect(): void {
    console.log('[SOCKET] 🔌 Desconectando...');
    this.cleanup();
    this.destroy$.next();
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionStatus.next(false);
    this.eventObservables.clear();
  }

  joinGameRoom(gameId: number): void {
    if (this.socket?.connected) {
      this.socket.emit('join:game', gameId);
    }
  }

  leaveGameRoom(gameId: number): void {
    if (this.socket?.connected) {
      this.socket.emit('leaveGame', { gameId });
    }
  }

  on(event: string): Observable<any> {
    if (this.eventObservables.has(event)) {
      return this.eventObservables.get(event)!;
    }

    const observable = new Observable((observer) => {
      let handler: ((data: any) => void) | null = null;
      let cleanupFunction: (() => void) | null = null;
      
      const setupListener = () => {
        try {
          if (!this.socket) {
            observer.error(new Error('Socket not connected'));
            return;
          }

          handler = (data: any) => {
            const timestamp = new Date().toLocaleTimeString();
            observer.next(data);
          };

          this.socket.on(event, handler);
          
        } catch (error) {
          observer.error(error);
        }
      };

      cleanupFunction = () => {
        if (handler && this.socket) {
          this.socket.off(event, handler);
          handler = null;
        }
      };

      if (this.socket?.connected) {
        setupListener();
      } else {
        const connectionSub = this.isConnected$.subscribe((connected) => {
          if (connected) {
            setupListener();
            connectionSub.unsubscribe();
          }
        });
        
        const originalCleanup = cleanupFunction;
        cleanupFunction = () => {
          connectionSub.unsubscribe();
          if (originalCleanup) originalCleanup();
        };
      }

      return cleanupFunction;
    }).pipe(
      share(), 
      takeUntil(this.destroy$) 
    );

    this.eventObservables.set(event, observable);
    return observable;
  }

  emit(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
      console.log(`[SOCKET] 📤 Emitting ${event}:`, data);
    } else {
      console.warn(`[SOCKET] ⚠️ Cannot emit ${event}: not connected`);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getStatus(): any {
    return {
      connected: this.isConnected(),
      activeObservables: Array.from(this.eventObservables.keys()),
      socketId: this.socket?.id
    };
  }
}
