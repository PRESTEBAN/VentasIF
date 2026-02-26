import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LoginResponse {
  token: string;
  usuario: {
    id: number;
    nombre: string;
    apellido: string;
    username: string;
    rol: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private apiUrl = `${environment.apiUrl}/api/v1/auth`;

  constructor(private http: HttpClient) {}

  // ── Login ────────────────────────────────────────────────────────────────
  login(username: string, pin: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { username, pin });
  }

  // ── Guardar sesión en localStorage ───────────────────────────────────────
  guardarSesion(data: LoginResponse): void {
    localStorage.setItem('token', data.token);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
  }

  // ── Obtener token ─────────────────────────────────────────────────────────
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // ── Obtener usuario logueado ──────────────────────────────────────────────
  getUsuario(): LoginResponse['usuario'] | null {
    const u = localStorage.getItem('usuario');
    return u ? JSON.parse(u) : null;
  }

  // ── Verificar si hay sesión activa ────────────────────────────────────────
  estaLogueado(): boolean {
    return !!this.getToken();
  }

  // ── Cerrar sesión ─────────────────────────────────────────────────────────
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  }
}