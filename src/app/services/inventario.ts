import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface StockBodega {
  producto_id: number;
  stock_actual: number;
  nombre: string;
  codigo: string;
  categoria: string;
}

@Injectable({
  providedIn: 'root'
})
export class InventarioService {

  private apiUrl = `${environment.apiUrl}/api/v1/inventario`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getBodega(): Observable<StockBodega[]> {
    return this.http.get<StockBodega[]>(`${this.apiUrl}/bodega`, { headers: this.getHeaders() });
  }
}