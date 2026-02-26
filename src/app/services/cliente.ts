import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface Cliente {
  id?: number;
  cedula: string;
  nombre: string;
  apellido: string;
  nombre_negocio?: string | null;
  tipo_cliente: string;
  direccion: string;
  sector?: string | null;
  telefono: string;
  email?: string | null;
  saldo_pendiente?: number;
  activo?: number;
  limite_credito?: number | null;
  notas?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ClienteService {

  private apiUrl = `${environment.apiUrl}/api/v1/clientes`;

  constructor(private http: HttpClient, private authService: AuthService) { }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authService.getToken()}`
    });
  }

  // ── Obtener todos los clientes ────────────────────────────────────────────
  getAll(): Observable<Cliente[]> {
    return this.http.get<Cliente[]>(this.apiUrl, { headers: this.getHeaders() });
  }

  // ── Buscar cliente por cédula ─────────────────────────────────────────────
  buscarPorCedula(cedula: string): Observable<Cliente[]> {
    return this.http.get<Cliente[]>(`${this.apiUrl}?cedula=${cedula}`, { headers: this.getHeaders() });
  }

  // ── Crear nuevo cliente ───────────────────────────────────────────────────
  create(cliente: Cliente): Observable<{ mensaje: string; id: number }> {
    return this.http.post<{ mensaje: string; id: number }>(
      this.apiUrl,
      cliente,
      { headers: this.getHeaders() }
    );
  }
}