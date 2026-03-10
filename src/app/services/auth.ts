import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { timeout } from 'rxjs/operators';

export interface LoginResponse {
  token: string;
  refreshToken: string;
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

  // ── Login ─────────────────────────────────────────────────────────────────
  login(username: string, pin: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { username, pin }).pipe(
      timeout(10000)
    );
  }

  // ── Guardar sesión ────────────────────────────────────────────────────────
  guardarSesion(data: LoginResponse): void {
    localStorage.setItem('token', data.token);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('usuario', JSON.stringify(data.usuario));
  }

  // ── Tokens ────────────────────────────────────────────────────────────────
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  guardarNuevoToken(token: string, refreshToken: string): void {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
  }

  // ── Usuario ───────────────────────────────────────────────────────────────
  getUsuario(): LoginResponse['usuario'] | null {
    const u = localStorage.getItem('usuario');
    return u ? JSON.parse(u) : null;
  }

  // ── Sesión activa ─────────────────────────────────────────────────────────
  estaLogueado(): boolean {
    return !!this.getToken();
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  logout(): void {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      this.http.post(`${this.apiUrl}/logout`, { refreshToken }).subscribe();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('usuario');
  }

  // ── Refresh ───────────────────────────────────────────────────────────────
  refreshToken(): Observable<LoginResponse> {
    const refreshToken = this.getRefreshToken();
    return this.http.post<LoginResponse>(`${this.apiUrl}/refresh`, { refreshToken }).pipe(
      timeout(10000)
    );
  }

  // ── Verificar token en servidor ───────────────────────────────────────────
  verificarToken(): Observable<any> {
    return this.http.get(`${this.apiUrl}/verificar`, {
      headers: { Authorization: `Bearer ${this.getToken()}` }
    }).pipe(timeout(5000));
  }
}