import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { AuthService } from './auth';

export interface Cliente {
  id?: number;
  cedula_ruc: string;
  nombre: string;
  apellido: string;
  nombre_negocio?: string | null;
  tipo_cliente: string;
  direccion: string;
  sector?: string | null;
  telefono: string;
  email?: string | null;
  saldo?: number;
  saldo_pendiente?: number;
  credito_disponible?: number;
  ultima_compra?: string | null;
  activo?: number;
  limite_credito?: number | null;
  notas?: string | null;
  fecha_creacion?: string;
  fecha_modificacion?: string;
}

export interface Movimiento {
  venta_id: number;
  detalle: string;
  fecha: string;
  valor: number;
  estado: string;
  saldo_acumulado: number;
}

export interface SaldoCliente {
  id: number;
  cedula: string;
  cliente: string;
  nombre_negocio: string | null;
  tipo_cliente: string;
  telefono: string;
  saldo_pendiente: number;
  limite_credito: number;
  credito_disponible: number;
  ultima_compra: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClienteService {

  private apiUrl = `${environment.apiUrl}/api/v1/clientes`;
  private abonosUrl = `${environment.apiUrl}/api/v1/abonos`;

  constructor(private http: HttpClient, private authService: AuthService) { }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.authService.getToken()}` });
  }

  getAll(): Observable<Cliente[]> {
    return this.http.get<Cliente[]>(this.apiUrl, { headers: this.getHeaders() });
  }

  getSaldos(): Observable<SaldoCliente[]> {
    return this.http.get<SaldoCliente[]>(`${this.apiUrl}/saldos`, { headers: this.getHeaders() });
  }

  getAllConSaldos(): Observable<Cliente[]> {
    return forkJoin({ clientes: this.getAll(), saldos: this.getSaldos() }).pipe(
      map(({ clientes, saldos }) =>
        clientes.map(c => {
          const s = saldos.find(x => x.id === c.id);
          return {
            ...c,
            saldo: s ? +s.saldo_pendiente : 0,
            limite_credito: s ? +s.limite_credito : 0,
            credito_disponible: s ? +s.credito_disponible : 0,
            ultima_compra: s?.ultima_compra ?? null,
          };
        })
      )
    );
  }

  getById(id: number): Observable<Cliente> {
    return this.http.get<Cliente>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  create(cliente: Cliente): Observable<{ mensaje: string; id: number }> {
    return this.http.post<{ mensaje: string; id: number }>(this.apiUrl, cliente, { headers: this.getHeaders() });
  }

  update(id: number, cliente: Partial<Cliente>): Observable<{ mensaje: string }> {
    return this.http.put<{ mensaje: string }>(`${this.apiUrl}/${id}`, cliente, { headers: this.getHeaders() });
  }

  remove(id: number): Observable<{ mensaje: string }> {
    return this.http.delete<{ mensaje: string }>(`${this.apiUrl}/${id}`, { headers: this.getHeaders() });
  }

  getMovimientos(clienteId: number): Observable<Movimiento[]> {
    return this.http.get<Movimiento[]>(`${this.abonosUrl}/cliente/${clienteId}`, { headers: this.getHeaders() });
  }

  registrarAbono(ventaId: number, clienteId: number, monto: number): Observable<any> {
    return this.http.post(`${this.abonosUrl}`, { venta_id: ventaId, cliente_id: clienteId, monto }, { headers: this.getHeaders() });
  }
}