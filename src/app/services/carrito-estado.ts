import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CarritoEstadoService {

  // Tab2 emite una señal, Tab1 la escucha
  private abrirCarrito$ = new Subject<void>();

  abrirCarrito = this.abrirCarrito$.asObservable();

  solicitarAbrirCarrito() {
    this.abrirCarrito$.next();
  }
}