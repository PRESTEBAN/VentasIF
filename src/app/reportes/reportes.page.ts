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
  abonos_efectivo: number;
  abonos_transferencia: number;
  abonos_cheques: number;
  ingresos_adicionales: number;
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
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  cargarCierres() {
    this.cargando = true;
    this.http.get<CierreResumen[]>(`${this.API}/cierres`, { headers: this.getHeaders() })
      .subscribe({
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
    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mapa = new Map<string, CierreResumen[]>();
    cierres.forEach(c => {
      // fecha_cierre viene como "YYYY-MM-DD" — parsear directamente sin Date()
      const fechaStr = (c.fecha_cierre || '').split('T')[0];
      const partes = fechaStr.split('-');
      if (partes.length !== 3) return;
      const anio = parseInt(partes[0], 10);
      const mes  = parseInt(partes[1], 10) - 1; // 0-indexed
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
    this.http.get<CierreDetalle>(`${this.API}/cierres/${cierre.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => { this.cierreDetalle = data; this.cargandoDetalle = false; },
        error: () => { this.cargandoDetalle = false; }
      });
  }

  cerrarDetalle() { this.mostrarDetalle = false; this.cierreDetalle = null; }

  // ── Fecha sin zona horaria (viene como YYYY-MM-DD del backend) ──
  formatearFecha(fecha: string): string {
    if (!fecha) return '—';
    // Parsear directamente para evitar conversión UTC→local
    const partes = fecha.split('T')[0].split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fecha;
  }

  // ── Hora en zona horaria Ecuador (UTC-5) ──
  formatearHora(fecha: string): string {
    if (!fecha) return '—';
    try {
      const f = new Date(fecha);
      return f.toLocaleTimeString('es-EC', {
        timeZone: 'America/Guayaquil',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return '—';
    }
  }

  // ── Total ventas en efectivo (ventas + abonos + ingresos adicionales) ──
  getTotalIngresosEfectivo(c: CierreDetalle): number {
    return (parseFloat(c.efectivo_ventas as any) || 0)
         + (parseFloat(c.abonos_efectivo as any) || 0)
         + (parseFloat(c.ingresos_adicionales as any) || 0);
  }

  getTotalIngresosTransferencia(c: CierreDetalle): number {
    return (parseFloat(c.transferencia_ventas as any) || 0)
         + (parseFloat(c.abonos_transferencia as any) || 0);
  }

  getTotalIngresosCheques(c: CierreDetalle): number {
    return (parseFloat(c.cheques_ventas as any) || 0)
         + (parseFloat(c.abonos_cheques as any) || 0);
  }

  getTotalIngresos(c: CierreDetalle): number {
    return (parseFloat(c.efectivo_ventas as any) || 0)
         + (parseFloat(c.transferencia_ventas as any) || 0)
         + (parseFloat(c.cheques_ventas as any) || 0)
         + (parseFloat(c.abonos_total as any) || 0);
  }

  tieneIngresosVarios(c: CierreDetalle): boolean {
    return (parseFloat(c.ingresos_adicionales as any) || 0) > 0;
  }

  tieneAbonos(c: CierreDetalle): boolean {
    return (parseFloat(c.abonos_total as any) || 0) > 0;
  }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
}
