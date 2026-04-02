import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../services/auth';

export interface CierreResumen {
  id: number;
  estado: string;
  fecha_cierre: string;
  abierto_en: string;
  cerrado_en: string | null;
  saldo_neto: number;
  fondo_inicial: number;
}

export interface CierreDetalle extends CierreResumen {
  // Ventas por método
  efectivo_ventas: number;
  transferencia_ventas: number;
  cheques_ventas: number;
  creditos_ventas: number;
  total_ordenes: number;

  // Abonos (cobros) por método
  abonos_total: number;
  abonos_efectivo: number;
  abonos_transferencia: number;
  abonos_cheques: number;

  // Ingresos varios por método
  ingresos_adicionales: number;
  ingresos_adicionales_efectivo: number;
  ingresos_adicionales_transferencia: number;
  ingresos_adicionales_cheques: number;

  // Egresos por método
  egresos_total: number;
  egresos_efectivo: number;
  egresos_transferencia: number;
  egresos_cheques: number;

  // Conteo físico
  efectivo_billetes: number;
  efectivo_monedas: number;
  total_efectivo: number;
  total_transferencias: number;
  total_cheques: number;

  notas: string | null;
}

export interface GrupoCierres {
  etiqueta: string;
  cierres: CierreResumen[];
}

@Component({
  selector: 'app-reportes',
  templateUrl: 'reportes.page.html',
  styleUrls: ['reportes.page.scss'],
  standalone: false,
})
export class ReportesPage implements OnInit {
  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto = false;
  usuarioActual = '';
  cargando = false;
  grupos: GrupoCierres[] = [];
  mostrarDetalle = false;
  cierreDetalle: CierreDetalle | null = null;
  cargandoDetalle = false;

  // Colapsables
  mostrarSubVentas = false;
  mostrarSubCobros = false;

  constructor(public router: Router, private http: HttpClient, private authService: AuthService) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
  }

  ionViewWillEnter() { this.cargarCierres(); }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  cargarCierres() {
    this.cargando = true;
    this.http.get<CierreResumen[]>(`${this.API}/cierres`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        const ordenados = (data || [])
          .filter(c => c.estado === 'cerrado')
          .sort((a, b) => new Date(b.fecha_cierre).getTime() - new Date(a.fecha_cierre).getTime());
        this.grupos = this.agruparPorMes(ordenados);
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  private agruparPorMes(cierres: CierreResumen[]): GrupoCierres[] {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mapa = new Map<string, CierreResumen[]>();
    cierres.forEach(c => {
      const fechaStr = (c.fecha_cierre || '').split('T')[0];
      const partes = fechaStr.split('-');
      if (partes.length !== 3) return;
      const anio = parseInt(partes[0], 10);
      const mes  = parseInt(partes[1], 10) - 1;
      if (isNaN(anio) || isNaN(mes) || mes < 0 || mes > 11) return;
      const clave = `${meses[mes]} ${anio}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(c);
    });
    return Array.from(mapa.entries()).map(([etiqueta, cs]) => ({ etiqueta, cierres: cs }));
  }

  verDetalle(cierre: CierreResumen) {
    this.cargandoDetalle = true;
    this.mostrarDetalle = true;
    this.cierreDetalle = null;
    this.mostrarSubVentas = false;
    this.mostrarSubCobros = false;
    this.http.get<CierreDetalle>(`${this.API}/cierres/${cierre.id}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.cierreDetalle = data; this.cargandoDetalle = false; },
      error: () => { this.cargandoDetalle = false; }
    });
  }

  cerrarDetalle() { this.mostrarDetalle = false; this.cierreDetalle = null; }

  // ── Helpers parseFloat seguros ──────────────────────────────────
  n(v: any): number { return parseFloat(v) || 0; }

  // ── Cuadre efectivo ──────────────────────────────────────────────
  totalIngresosEfectivo(c: CierreDetalle): number {
    return this.n(c.efectivo_ventas) + this.n(c.cheques_ventas)
         + this.n(c.abonos_efectivo) + this.n(c.abonos_cheques)
         + this.n(c.ingresos_adicionales_efectivo) + this.n(c.ingresos_adicionales_cheques);
  }

  diferenciasEfectivo(c: CierreDetalle): number {
    return (this.n(c.efectivo_billetes) + this.n(c.efectivo_monedas))
         - this.totalIngresosEfectivo(c)
         + this.n(c.egresos_efectivo) + this.n(c.egresos_cheques);
  }

  // ── Cuadre transferencia ────────────────────────────────────────
  totalIngresosTransferencia(c: CierreDetalle): number {
    return this.n(c.transferencia_ventas)
         + this.n(c.abonos_transferencia)
         + this.n(c.ingresos_adicionales_transferencia);
  }

  diferenciaTransferencia(c: CierreDetalle): number {
    return this.n(c.total_transferencias)
         - this.totalIngresosTransferencia(c)
         + this.n(c.egresos_transferencia);
  }

  // ── Total general ───────────────────────────────────────────────
  totalGeneral(c: CierreDetalle): number {
    return (this.n(c.efectivo_billetes) + this.n(c.efectivo_monedas))
         + this.n(c.total_transferencias);
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return '—';
    const partes = fecha.split('T')[0].split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return fecha;
  }

  formatearHora(fecha: string): string {
    if (!fecha) return '—';
    try {
      return new Date(fecha).toLocaleTimeString('es-EC', { timeZone: 'America/Guayaquil', hour: '2-digit', minute: '2-digit', hour12: false });
    } catch { return '—'; }
  }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
}