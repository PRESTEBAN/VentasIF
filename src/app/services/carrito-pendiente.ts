import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class CarritoPendienteService {

  private url = `${environment.apiUrl}/api/v1/carritos`;

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  getByCliente(clienteId: number): Observable<any> {
    return this.http.get(`${this.url}/cliente/${clienteId}`, { headers: this.getHeaders() });
  }

  guardar(payload: {
    cliente_id: number;
    items: any[];
    iva_percent: number;
    forma_pago: string;
  }): Observable<any> {
    return this.http.post(this.url, payload, { headers: this.getHeaders() });
  }

  eliminar(clienteId: number): Observable<any> {
    return this.http.delete(`${this.url}/cliente/${clienteId}`, { headers: this.getHeaders() });
  }
}