import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  peso_gramos: number;
  unidad_medida: string;
  precio_x_mayor: number;
  precio_x_menor: number;
  activo: number;
  imagen?: string | null;
  stock?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProductoService {

  private apiUrl = `${environment.apiUrl}/api/v1/productos`;

  constructor(private http: HttpClient, private authService: AuthService) { }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getAll(): Observable<Producto[]> {
    return this.http.get<Producto[]>(this.apiUrl, { headers: this.getHeaders() });
  }
}