import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { io, Socket } from 'socket.io-client';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {

  private socket: Socket | null = null;
  private readonly URL = environment.apiUrl;

  connect() {
    // Si ya existe el socket (conectado o no), no crear otro
    if (this.socket) return;

    this.socket = io(this.URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10
    });

    this.socket.on('connect',    () => console.log('🔌 Socket conectado:', this.socket?.id));
    this.socket.on('disconnect', (reason) => console.log('❌ Socket desconectado:', reason));
    this.socket.on('connect_error', (err) => console.warn('⚠️ Socket error:', err.message));
  }

  disconnect() {
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
  }

  on<T = any>(evento: string): Observable<T> {
    return new Observable(observer => {
      // Esperar a que el socket exista
      const waitAndListen = () => {
        if (!this.socket) {
          setTimeout(waitAndListen, 100);
          return;
        }

        const handler = (data: T) => observer.next(data);
        this.socket.on(evento, handler);

        // Reactivar listener tras reconexión
        const onReconnect = () => {
          this.socket?.off(evento, handler);
          this.socket?.on(evento, handler);
        };
        this.socket.on('connect', onReconnect);

        // Cleanup al desuscribirse
        return () => {
          this.socket?.off(evento, handler);
          this.socket?.off('connect', onReconnect);
        };
      };

      const cleanup = waitAndListen();
      return cleanup;
    });
  }

  ngOnDestroy() { this.disconnect(); }
}