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
  total_ventas: number;
  total_egresos: number;
  total_abonos: number;
  total_ingresos_varios: number;
  fondo_inicial: number;
}

export interface CierreDetalle extends CierreResumen {
  efectivo_billetes: number;
  efectivo_monedas: number;
  total_efectivo: number;
  total_transferencias: number;
  total_cheques: number;
  total_creditos: number;
  notas: string | null;
  total_ordenes: number;
  efectivo_ventas: number;
  transferencia_ventas: number;
  cheques_ventas: number;
  creditos_ventas: number;
  egresos_total: number;
  abonos_total: number;
  ingresos_adicionales: number;
}

export interface GrupoCierres {
  etiqueta: string;     // "Marzo 2026"
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

  constructor(
    public router: Router,
    private http: HttpClient,
    private authService: AuthService,
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
  }

  ionViewWillEnter() { this.cargarCierres(); }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  cargarCierres() {
    this.cargando = true;
    this.http.get<CierreResumen[]>(`${this.API}/cierres`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          // Ordenar del más antiguo al más reciente
          const ordenados = (data || [])
            .filter(c => c.estado === 'cerrado')
            .sort((a, b) => new Date(a.fecha_cierre).getTime() - new Date(b.fecha_cierre).getTime());
          this.grupos = this.agruparPorMes(ordenados);
          this.cargando = false;
        },
        error: () => { this.cargando = false; }
      });
  }

  private agruparPorMes(cierres: CierreResumen[]): GrupoCierres[] {
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mapa = new Map<string, CierreResumen[]>();

    cierres.forEach(c => {
      const fecha = new Date(c.fecha_cierre);
      const clave = `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(c);
    });

    return Array.from(mapa.entries()).map(([etiqueta, cs]) => ({ etiqueta, cierres: cs }));
  }

  verDetalle(cierre: CierreResumen) {
    this.cargandoDetalle = true;
    this.mostrarDetalle = true;
    this.cierreDetalle = null;

    this.http.get<CierreDetalle>(`${this.API}/cierres/${cierre.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => { this.cierreDetalle = data; this.cargandoDetalle = false; },
        error: () => { this.cargandoDetalle = false; }
      });
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
    this.cierreDetalle = null;
  }

  formatearFecha(fecha: string): string {
    if (!fecha) return '—';
    const f = new Date(fecha);
    return `${f.getDate().toString().padStart(2,'0')}/${(f.getMonth()+1).toString().padStart(2,'0')}/${f.getFullYear()}`;
  }

  formatearHora(fecha: string): string {
    if (!fecha) return '—';
    const f = new Date(fecha);
    return `${f.getHours().toString().padStart(2,'0')}:${f.getMinutes().toString().padStart(2,'0')}`;
  }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
}