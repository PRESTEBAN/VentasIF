import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface ItemInventario {
  id: number;
  producto_id: number;
  stock_actual: number;
  stock_minimo: number;
  ubicacion: string | null;
  updated_at: string;
  codigo: string;
  nombre: string;
  categoria: string | null;
  precio_x_mayor: number;
  precio_x_menor: number;
  // campo local temporal
  ingreso?: number | null;
}

@Injectable({ providedIn: 'root' })
export class InventarioService {

  private invUrl = `${environment.apiUrl}/api/v1/inventario`;
  private prodUrl = `${environment.apiUrl}/api/v1/productos`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
  }

  getBodega(): Observable<ItemInventario[]> {
    return this.http.get<ItemInventario[]>(`${this.invUrl}/bodega`, { headers: this.getHeaders() });
  }

  registrarIngreso(producto_id: number, cantidad: number): Observable<any> {
    return this.http.post(
      `${this.invUrl}/bodega/movimiento`,
      { producto_id, cantidad, tipo: 'entrada', motivo: 'Ingreso manual' },
      { headers: this.getHeaders() }
    );
  }

  actualizarPrecios(id: number, precio_x_mayor: number, precio_x_menor: number): Observable<any> {
    return this.http.put(
      `${this.prodUrl}/${id}/precios`,
      { precio_x_mayor, precio_x_menor },
      { headers: this.getHeaders() }
    );
  }

  crearProducto(data: any): Observable<any> {
    return this.http.post(this.prodUrl, data, { headers: this.getHeaders() });
  }
}