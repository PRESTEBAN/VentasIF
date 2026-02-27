import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class VentasRutaService {

  private apiUrl = `${environment.apiUrl}/api/v1/ventas-ruta`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
  }

  getPendientes(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/pendientes`, { headers: this.getHeaders() });
  }

  create(venta: any): Observable<any> {
    return this.http.post(this.apiUrl, venta, { headers: this.getHeaders() });
  }

  marcarListo(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/listo`, {}, { headers: this.getHeaders() });
  }

  marcarEntregado(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/entregado`, {}, { headers: this.getHeaders() });
  }
}