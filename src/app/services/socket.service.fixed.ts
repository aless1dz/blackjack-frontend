// services/socket.service.fixed.ts - NUEVA VERSIÓN COMPLETAMENTE CORREGIDA
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable, share, takeUntil } from 'rxjs';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket: Socket | null = null;
  private connectionStatus = new BehaviorSubject<boolean>(false);
  public isConnected$ = this.connectionStatus.asObservable();
  
  // ✅ Map para mantener track de observables activos
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
      console.warn('[SOCKET] ❌ No token disponible');
      return;
    }

    console.log('[SOCKET] 🔄 Conectando...');
    
    // Limpiar socket anterior
    this.cleanup();

    this.socket = io('http://localhost:3333', {
      auth: { token: token },
      transports: ['websocket'],
      forceNew: true,
      timeout: 10000,
    });

    // Eventos básicos de conexión
    this.socket.on('connect', () => {
      console.log('[SOCKET] ✅ Conectado exitosamente');
      this.connectionStatus.next(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SOCKET] ❌ Desconectado:', reason);
      this.connectionStatus.next(false);
      this.eventObservables.clear(); // Limpiar observables
    });

    this.socket.on('connect_error', (error) => {
      console.error('[SOCKET] ❌ Error de conexión:', error);
      this.connectionStatus.next(false);
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
      this.socket.emit('join:game', { gameId });
      console.log(`[SOCKET] 🚪 Joined game room: ${gameId}`);
    }
  }

  leaveGameRoom(gameId: number): void {
    if (this.socket?.connected) {
      this.socket.emit('leaveGame', { gameId });
      console.log(`[SOCKET] 🚪 Left game room: ${gameId}`);
    }
  }

  // ✅ MÉTODO PRINCIPAL - crea observables SINGLETON para cada evento
  on(event: string): Observable<any> {
    // Si ya existe un observable para este evento, devuelve el mismo
    if (this.eventObservables.has(event)) {
      console.log(`[SOCKET] 🔄 Reutilizando observable para ${event}`);
      return this.eventObservables.get(event)!;
    }

    console.log(`[SOCKET] 🆕 Creando nuevo observable para ${event}`);

    const observable = new Observable((observer) => {
      if (!this.socket?.connected) {
        console.warn(`[SOCKET] ⚠️ Socket no disponible para ${event}`);
        observer.error('Socket not connected');
        return;
      }

      const handler = (data: any) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[SOCKET] 📡 [${timestamp}] ${event}:`, data);
        observer.next(data);
      };

      this.socket.on(event, handler);

      // Cleanup
      return () => {
        if (this.socket) {
          console.log(`[SOCKET] 🧹 Limpiando listener para ${event}`);
          this.socket.off(event, handler);
        }
      };
    }).pipe(
      share(), // ✅ COMPARTIR el observable entre múltiples suscriptores
      takeUntil(this.destroy$) // ✅ Auto-cleanup cuando se destruye el servicio
    );

    // Guardar el observable para reutilizar
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

  // ✅ Método de utilidad para debug
  getStatus(): any {
    return {
      connected: this.isConnected(),
      activeObservables: Array.from(this.eventObservables.keys()),
      socketId: this.socket?.id
    };
  }
}
