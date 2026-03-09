import { Component, OnInit, OnDestroy } from '@angular/core';
import { VentasRutaService } from '../services/ventas-ruta';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { CarritoEstadoService } from '../services/carrito-estado';
import { SocketService } from '../services/socket';
import { AlertController } from '@ionic/angular';
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
    private socketService: SocketService,
    private alertCtrl: AlertController
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

  // ── POLLING ───────────────────────────────────────────────────────────────
  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarOrdenesSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  // ── SOCKET ────────────────────────────────────────────────────────────────
  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();

    const ventaSub = this.socketService.on('nueva_venta').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      this.cargarOrdenesSilencioso();
    });

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
        const idsNuevos   = new Set(data.map((o: any) => o.venta_id));
        data.forEach((orden: any) => {
          if (!idsActuales.has(orden.venta_id)) this.ordenes.unshift(orden);
        });
        this.ordenes = this.ordenes.filter(o => idsNuevos.has(o.venta_id) || this.actualizando[o.venta_id]);
      },
      error: () => {}
    });
  }

  // ── ACCIONES TOGGLE ───────────────────────────────────────────────────────

  toggleListo(orden: any) {
    if (orden.listo_conductor && orden.entregado_vendedor) return;
    if (this.actualizando[orden.venta_id]) return;

    this.actualizando[orden.venta_id] = true;

    if (!orden.listo_conductor) {
      this.ventasRutaService.marcarListo(orden.venta_id).subscribe({
        next: () => { orden.listo_conductor = 1; this.actualizando[orden.venta_id] = false; },
        error: () => { this.actualizando[orden.venta_id] = false; }
      });
    } else {
      this.ventasRutaService.desmarcarListo(orden.venta_id).subscribe({
        next: () => { orden.listo_conductor = 0; this.actualizando[orden.venta_id] = false; },
        error: () => { this.actualizando[orden.venta_id] = false; }
      });
    }
  }

  // Antes de marcar como entregado muestra confirmación para evitar accidentes
  async toggleEntregado(orden: any) {
    if (!orden.listo_conductor && !orden.entregado_vendedor) return;
    if (this.actualizando[orden.venta_id]) return;

    if (!orden.entregado_vendedor) {
      // Pedir confirmación antes de finalizar
      const alert = await this.alertCtrl.create({
        header: '¿Finalizar orden?',
        message: `La orden #${orden.venta_id?.toString().padStart(6, '0')} de ${orden.cliente} se marcará como entregada y desaparecerá de la lista.`,
        cssClass: 'alert-personalizado',
        buttons: [
           {
            text: 'Sí, entregar',
            role: 'destructive',
            handler: () => {
              this.ejecutarEntregado(orden);
            }
          },
          {
            text: 'Cancelar',
            role: 'cancel'
          }
        ]
      });
      await alert.present();

    } else {
      // Deshacer entregado — sin confirmación
      this.actualizando[orden.venta_id] = true;
      this.ventasRutaService.desmarcarEntregado(orden.venta_id).subscribe({
        next: () => { orden.entregado_vendedor = 0; this.actualizando[orden.venta_id] = false; },
        error: () => { this.actualizando[orden.venta_id] = false; }
      });
    }
  }

  private ejecutarEntregado(orden: any) {
    this.actualizando[orden.venta_id] = true;
    this.ventasRutaService.marcarEntregado(orden.venta_id).subscribe({
      next: () => {
        orden.entregado_vendedor = 1;
        this.actualizando[orden.venta_id] = false;
        this.verificarCompleta(orden);
      },
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

  // ── MENU ──────────────────────────────────────────────────────────────────
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAlCarrito() { this.carritoEstado.solicitarAbrirCarrito(); this.router.navigate(['/tabs/tab1']); }
  irACaja() { this.cerrarMenu(); this.router.navigate(['/caja']); }
}