import { Injectable, OnDestroy } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { io, Socket } from 'socket.io-client';

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {

  private socket: Socket | null = null;
  private readonly URL = environment.apiUrl; 

  connect() {
    if (this.socket?.connected) return;
    this.socket = io(this.URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10
    });
    this.socket.on('connect',    () => console.log('🔌 Socket conectado'));
    this.socket.on('disconnect', () => console.log('❌ Socket desconectado'));
  }

  disconnect() {
    if (this.socket) { this.socket.disconnect(); this.socket = null; }
  }

  // Escuchar un evento — devuelve Observable para usar en Angular
  on<T = any>(evento: string): Observable<T> {
    return new Observable(observer => {
      if (!this.socket) return;
      this.socket.on(evento, (data: T) => observer.next(data));
      // cleanup al desuscribirse
      return () => this.socket?.off(evento);
    });
  }

  ngOnDestroy() { this.disconnect(); }
}