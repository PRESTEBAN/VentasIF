import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { SocketService } from '../services/socket';

@Component({
  selector: 'app-tab3',
  templateUrl: 'tab3.page.html',
  styleUrls: ['tab3.page.scss'],
  standalone: false,
})
export class Tab3Page implements OnInit, OnDestroy {
  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto = false;
  usuarioActual = '';
  cargando = false;
  fondoInicial: number = 0;
  ingresosAdicionales: number = 0;

  // ── Estado caja cerrada ──
  cajaCerrada = false;
  abriendo = false;
  errorAbrir = '';

  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;
  private socketSubs: Subscription[] = [];

  diaSemana = '';
  fechaHoy = '';

  cierreActivoId: number = 0;
  ventasRealizadas: number = 0;
  totalEfectivo: number = 0;
  totalTransferencias: number = 0;
  totalCheques: number = 0;
  totalPendientes: number = 0;
  totalIngresosVentas: number = 0;
  totalAbonos: number = 0;
  totalEgresos: number = 0;

  get totalGeneral(): number {
    return Math.max(0, this.totalIngresosVentas + this.totalAbonos + this.ingresosAdicionales - this.totalEgresos);
  }

  get egresosExceden(): boolean {
    return this.totalEgresos > this.fondoInicial + this.totalIngresosVentas + this.totalAbonos + this.ingresosAdicionales;
  }

  get totalSinFondo(): number {
    return Math.max(0, this.totalIngresosVentas + this.totalAbonos + this.ingresosAdicionales - this.totalEgresos);
  }

  billetes: number | null = null;
  monedas: number | null = null;
  transferenciasDesglose: number | null = null;
  chequesDesglose: number | null = null;
  totalDesglose: number = 0;

  mostrarResultado = false;
  estadoCierre: 'cuadrado' | 'sobra' | 'falta' = 'cuadrado';
  diferencia: number = 0;
  guardandoCierre = false;
  errorGuardar = '';

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private socketService: SocketService
  ) { }

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.setFecha();
  }

  ionViewWillEnter() { this.cargarDatos(); this.iniciarPolling(); this.iniciarSocket(); }
  ionViewWillLeave() { this.detenerPolling(); this.detenerSocket(); }
  ngOnDestroy() { this.detenerPolling(); this.detenerSocket(); }

  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarDatosSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();
    const ventaSub = this.socketService.on('nueva_venta').subscribe(() => { if (!this.authService.estaLogueado()) { this.detenerSocket(); return; } this.cargarDatosSilencioso(); });
    const egresoSub = this.socketService.on('egresos_actualizado').subscribe(() => { if (!this.authService.estaLogueado()) { this.detenerSocket(); return; } this.cargarDatosSilencioso(); });
    const abonoSub = this.socketService.on('clientes_actualizado').subscribe((data: any) => { if (!this.authService.estaLogueado()) { this.detenerSocket(); return; } if (data?.accion === 'abono') this.cargarDatosSilencioso(); });
    const cierreSub = this.socketService.on('cierre_registrado').subscribe(() => { if (!this.authService.estaLogueado()) { this.detenerSocket(); return; } this.resetearConteo(); this.cargarDatos(); });
    this.socketSubs = [ventaSub, egresoSub, abonoSub, cierreSub];
  }

  detenerSocket() { this.socketSubs.forEach(s => s.unsubscribe()); this.socketSubs = []; }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  cargarDatos() {
    this.cargando = true;
    this.http.get<any>(`${this.API}/cierres/activo`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.cargando = false;
        if (data.activo === false) {
          this.cajaCerrada = true;
          return;
        }
        this.cajaCerrada = false;
        this.procesarCierreActivo(data);
      },
      error: () => { this.cargando = false; },
    });
  }

  cargarDatosSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    if (this.cajaCerrada) return;
    this.http.get<any>(`${this.API}/cierres/activo`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        if (data.activo === false) { this.cajaCerrada = true; return; }
        this.cajaCerrada = false;
        this.procesarCierreActivo(data);
      },
      error: () => { },
    });
  }

  private procesarCierreActivo(data: any) {
    this.cierreActivoId = data.id;
    this.ventasRealizadas = data.total_ordenes || 0;
    this.totalEfectivo = parseFloat(data.efectivo_ventas) || 0;
    this.totalTransferencias = parseFloat(data.transferencia_ventas) || 0;
    this.totalCheques = parseFloat(data.cheques_ventas) || 0;
    this.totalPendientes = parseFloat(data.creditos_ventas) || 0;
    this.totalEgresos = parseFloat(data.egresos_total) || 0;
    this.totalAbonos = parseFloat(data.abonos_total) || 0;
    this.fondoInicial = parseFloat(data.fondo_inicial) || 30;
    this.ingresosAdicionales = parseFloat(data.ingresos_adicionales) || 0;
    this.totalIngresosVentas = this.totalEfectivo + this.totalTransferencias + this.totalCheques;
  }

  // ── Abrir caja manualmente ────────────────────────────────────────────────
  abrirCaja() {
    this.abriendo = true;
    this.errorAbrir = '';
    this.http.post<any>(`${this.API}/cierres/abrir`, {}, { headers: this.getHeaders() }).subscribe({
      next: () => { this.abriendo = false; this.cajaCerrada = false; this.cargarDatos(); },
      error: (err) => { this.abriendo = false; this.errorAbrir = err.error?.error || 'Error al abrir caja'; }
    });
  }

  setFecha() {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const hoy = new Date();
    this.diaSemana = dias[hoy.getDay()];
    this.fechaHoy = `${hoy.getDate().toString().padStart(2, '0')}/${(hoy.getMonth() + 1).toString().padStart(2, '0')}/${hoy.getFullYear()}`;
  }

  recalcularTotal() {
    this.totalDesglose = (this.billetes || 0) + (this.monedas || 0) + (this.transferenciasDesglose || 0) + (this.chequesDesglose || 0);
  }

  revisar() {
    this.errorGuardar = '';
    if (this.egresosExceden) {
      this.estadoCierre = 'falta';
      this.diferencia = this.totalEgresos - (this.totalIngresosVentas + this.totalAbonos);
      this.errorGuardar = `⚠️ Los egresos ($${this.totalEgresos.toFixed(2)}) superan los ingresos del período ($${(this.totalIngresosVentas + this.totalAbonos).toFixed(2)}). Corrige los egresos antes de cerrar.`;
      this.mostrarResultado = true;
      return;
    }
    const TOLERANCIA = 0.01;
    const diff = this.totalDesglose - this.totalGeneral;
    if (Math.abs(diff) <= TOLERANCIA) { this.estadoCierre = 'cuadrado'; this.diferencia = 0; }
    else if (diff > 0) { this.estadoCierre = 'sobra'; this.diferencia = Math.abs(diff); }
    else { this.estadoCierre = 'falta'; this.diferencia = Math.abs(diff); }
    this.mostrarResultado = true;
  }

  cerrarResultado() { this.mostrarResultado = false; this.errorGuardar = ''; }

  finalizarDia() {
    if (this.estadoCierre !== 'cuadrado') return;
    this.guardandoCierre = true;
    this.errorGuardar = '';
    this.http.get<any[]>(`${this.API}/ventas-ruta?cierre_id=${this.cierreActivoId}`, { headers: this.getHeaders() }).subscribe({
      next: (ordenes) => {
        const pendientes = (ordenes || []).filter(o => !o.entregado_vendedor && o.estado !== 'entregado' && o.estado !== 'anulado');
        if (pendientes.length > 0) {
          this.guardandoCierre = false;
          this.errorGuardar = `⚠️ Hay ${pendientes.length} orden${pendientes.length > 1 ? 'es' : ''} sin entregar. Finalízalas en Órdenes antes de cerrar.`;
          return;
        }
        this.guardarCierre();
      },
      error: () => { this.guardandoCierre = false; this.errorGuardar = 'Error al verificar datos.'; },
    });
  }

  private guardarCierre() {
    const payload = {
      efectivo_billetes: this.billetes || 0,
      efectivo_monedas: this.monedas || 0,
      total_transferencias: this.transferenciasDesglose || 0,
      total_cheques: this.chequesDesglose || 0,
      total_creditos: this.totalPendientes,
      notas: null,
    };
    this.http.post(`${this.API}/cierres`, payload, { headers: this.getHeaders() }).subscribe({
      next: () => {
        this.guardandoCierre = false;
        this.mostrarResultado = false;
        this.errorGuardar = '';
        this.resetearConteo();
        // NO llamar cargarDatos aquí — ahora la caja queda cerrada hasta que el usuario la abra
        this.cajaCerrada = true;
      },
      error: () => { this.guardandoCierre = false; this.errorGuardar = 'Error al guardar el cierre. Intenta de nuevo.'; },
    });
  }

  private resetearConteo() {
    this.billetes = null; this.monedas = null;
    this.transferenciasDesglose = null; this.chequesDesglose = null;
    this.totalDesglose = 0; this.mostrarResultado = false; this.errorGuardar = '';
  }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
}