import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto   = false;
  usuarioActual = '';
  cargando      = false;

  private pollingInterval: any = null;
  private readonly POLLING_MS  = 15000;

  // ── Fecha ──
  diaSemana = '';
  fechaHoy  = '';

  // ── Card 1: Resumen de ventas ──
  ventasRealizadas:    number = 0;
  totalEfectivo:       number = 0;
  totalTransferencias: number = 0;
  totalCheques:        number = 0;
  totalPendientes:     number = 0;
  totalIngresosVentas: number = 0;   // efectivo + transferencias + cheques

  // ── Card 2: Egresos ──
  totalEgresos: number = 0;

  // ── Total general: ingresos ventas - egresos ──
  get totalGeneral(): number {
    return this.totalIngresosVentas - this.totalEgresos;
  }

  // ── Card 3: Desglose (ingresa el usuario) ──
  billetes:              number | null = null;
  monedas:               number | null = null;
  transferenciasDesglose: number | null = null;
  totalDesglose:         number = 0;

  // ── Modal resultado ──
  mostrarResultado = false;
  estadoCierre: 'cuadrado' | 'sobra' | 'falta' = 'cuadrado';
  diferencia: number = 0;

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.setFecha();
  }

  ionViewWillEnter() {
    this.cargarDatos();
    this.iniciarPolling();
  }

  ionViewWillLeave() {
    this.detenerPolling();
  }

  ngOnDestroy() {
    this.detenerPolling();
  }

  iniciarPolling() {
    this.detenerPolling();
    this.pollingInterval = setInterval(() => {
      this.cargarDatosSilencioso();
    }, this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  // Recarga silenciosa sin spinner — no interrumpe al usuario
  cargarDatosSilencioso() {
    const fecha = this.formatearFechaHoy();
    forkJoin({
      ventas:  this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fecha}`, { headers: this.getHeaders() }),
      egresos: this.http.get<any[]>(`${this.API}/egresos?fecha=${fecha}`,     { headers: this.getHeaders() })
    }).subscribe({
      next: ({ ventas, egresos }) => {
        this.procesarVentas(ventas || []);
        this.procesarEgresos(egresos || []);
      },
      error: () => {}
    });
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private formatearFechaHoy(): string {
    const hoy = new Date();
    const d = hoy.getDate().toString().padStart(2, '0');
    const m = (hoy.getMonth() + 1).toString().padStart(2, '0');
    return `${hoy.getFullYear()}-${m}-${d}`;
  }

  cargarDatos() {
    this.cargando = true;
    const fecha = this.formatearFechaHoy();

    // Cargar ventas y egresos del día en paralelo
    forkJoin({
      ventas:  this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fecha}`,  { headers: this.getHeaders() }),
      egresos: this.http.get<any[]>(`${this.API}/egresos?fecha=${fecha}`,      { headers: this.getHeaders() })
    }).subscribe({
      next: ({ ventas, egresos }) => {
        this.procesarVentas(ventas || []);
        this.procesarEgresos(egresos || []);
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  private procesarVentas(ventas: any[]) {
    this.ventasRealizadas    = ventas.length;
    this.totalEfectivo       = 0;
    this.totalTransferencias = 0;
    this.totalCheques        = 0;
    this.totalPendientes     = 0;

    ventas.forEach(v => {
      const total = parseFloat(v.total) || 0;
      const tipo  = (v.tipo_pago || v.forma_pago || '').toLowerCase();

      if (tipo === 'efectivo')       this.totalEfectivo       += total;
      else if (tipo === 'transferencia') this.totalTransferencias += total;
      else if (tipo === 'cheques')   this.totalCheques        += total;
      else if (tipo === 'credito' || tipo === 'pendiente') this.totalPendientes += total;
    });

    // Total ingresos = lo cobrado (excluye pendientes)
    this.totalIngresosVentas = this.totalEfectivo + this.totalTransferencias + this.totalCheques;
  }

  private procesarEgresos(egresos: any[]) {
    this.totalEgresos = egresos.reduce((acc, e) => acc + (parseFloat(e.valor) || 0), 0);
  }

  setFecha() {
    const dias   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const hoy    = new Date();
    this.diaSemana = dias[hoy.getDay()];
    this.fechaHoy  = `${hoy.getDate().toString().padStart(2,'0')}/${(hoy.getMonth()+1).toString().padStart(2,'0')}/${hoy.getFullYear()}`;
  }

  recalcularTotal() {
    this.totalDesglose = (this.billetes || 0) + (this.monedas || 0) + (this.transferenciasDesglose || 0);
  }

  revisar() {
    const TOLERANCIA = 0.01;
    const diff = this.totalDesglose - this.totalGeneral;

    if (Math.abs(diff) <= TOLERANCIA) {
      this.estadoCierre = 'cuadrado';
      this.diferencia   = 0;
    } else if (diff > 0) {
      this.estadoCierre = 'sobra';
      this.diferencia   = Math.abs(diff);
    } else {
      this.estadoCierre = 'falta';
      this.diferencia   = Math.abs(diff);
    }

    this.mostrarResultado = true;
  }

  cerrarResultado() { this.mostrarResultado = false; }

  finalizarDia() {
    this.mostrarResultado = false;
  }

  // ---- MENU ----
  abrirMenu()  { this.menuAbierto = true;  }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }

  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']);   }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']);  }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']);    }
}