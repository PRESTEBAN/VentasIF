import { Component, OnInit, OnDestroy } from '@angular/core';
import { VentasRutaService } from '../services/ventas-ruta';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { CarritoEstadoService } from '../services/carrito-estado';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit, OnDestroy {

  ordenes: any[] = [];
  cargando = false;
  actualizando: { [id: number]: boolean } = {};

  menuAbierto = false;
  usuarioActual = '';

  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;
  private socketSubs: Subscription[] = [];

  constructor(
    private ventasRutaService: VentasRutaService,
    public router: Router,
    private authService: AuthService,
    private carritoEstado: CarritoEstadoService,
    private socketService: SocketService
  ) { }

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
  }

  ionViewWillEnter() {
    this.cargarOrdenes();
    this.iniciarPolling();
    this.iniciarSocket();
  }

  ionViewWillLeave() {
    this.detenerPolling();
    this.detenerSocket();
  }

  ngOnDestroy() {
    this.detenerPolling();
    this.detenerSocket();
  }

  // ── POLLING (respaldo) ────────────────────────────────────────────────────
  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarOrdenesSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  // ── SOCKET (tiempo real) ──────────────────────────────────────────────────
  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();

    // Nueva venta creada → agregar a la lista
    const ventaSub = this.socketService.on('nueva_venta').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      this.cargarOrdenesSilencioso();
    });

    // Orden actualizada (listo/entregado/eliminado) → refrescar
    const ordenSub = this.socketService.on('orden_actualizada').subscribe((data: any) => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (data?.estado === 'eliminado') {
        this.ordenes = this.ordenes.filter(o => o.venta_id !== +data.venta_id);
      } else {
        this.cargarOrdenesSilencioso();
      }
    });

    this.socketSubs = [ventaSub, ordenSub];
  }

  detenerSocket() {
    this.socketSubs.forEach(s => s.unsubscribe());
    this.socketSubs = [];
  }

  // ── CARGA ─────────────────────────────────────────────────────────────────
  cargarOrdenes() {
    this.cargando = true;
    this.ventasRutaService.getPendientes().subscribe({
      next: (data) => { this.ordenes = data; this.cargando = false; },
      error: () => { this.cargando = false; }
    });
  }

  cargarOrdenesSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    this.ventasRutaService.getPendientes().subscribe({
      next: (data: any[]) => {
        const idsActuales = new Set(this.ordenes.map(o => o.venta_id));
        const idsNuevos = new Set(data.map((o: any) => o.venta_id));
        data.forEach((orden: any) => {
          if (!idsActuales.has(orden.venta_id)) this.ordenes.unshift(orden);
        });
        this.ordenes = this.ordenes.filter(o => idsNuevos.has(o.venta_id) || this.actualizando[o.venta_id]);
      },
      error: () => { }
    });
  }

  // ── ACCIONES ──────────────────────────────────────────────────────────────
  marcarListo(orden: any) {
    if (orden.listo_conductor) return;
    this.actualizando[orden.venta_id] = true;
    this.ventasRutaService.marcarListo(orden.venta_id).subscribe({
      next: () => { orden.listo_conductor = 1; this.actualizando[orden.venta_id] = false; this.verificarCompleta(orden); },
      error: () => { this.actualizando[orden.venta_id] = false; }
    });
  }

  marcarEntregado(orden: any) {
    if (orden.entregado_vendedor) return;
    if (!orden.listo_conductor) return;
    this.actualizando[orden.venta_id] = true;
    this.ventasRutaService.marcarEntregado(orden.venta_id).subscribe({
      next: () => { orden.entregado_vendedor = 1; this.actualizando[orden.venta_id] = false; this.verificarCompleta(orden); },
      error: () => { this.actualizando[orden.venta_id] = false; }
    });
  }

  verificarCompleta(orden: any) {
    if (orden.listo_conductor && orden.entregado_vendedor) {
      setTimeout(() => {
        this.ordenes = this.ordenes.filter(o => o.venta_id !== orden.venta_id);
      }, 800);
    }
  }

  toggleListo(orden: any) {
    if (orden.listo_conductor) {
      this.desmarcarListo(orden);
    } else {
      this.marcarListo(orden);
    }
  }

  desmarcarListo(orden: any) {
    this.actualizando[orden.venta_id] = true;
    this.ventasRutaService.desmarcarListo(orden.venta_id).subscribe({
      next: () => {
        orden.listo_conductor = 0;
        this.actualizando[orden.venta_id] = false;
      },
      error: () => { this.actualizando[orden.venta_id] = false; }
    });
  }

  // ── MENU ──────────────────────────────────────────────────────────────────
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAClientes() { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial() { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAlCarrito() { this.carritoEstado.solicitarAbrirCarrito(); this.router.navigate(['/tabs/tab1']); }
  irACaja() { this.cerrarMenu(); this.router.navigate(['/caja']); }
}