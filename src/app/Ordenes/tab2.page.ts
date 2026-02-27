import { Component, OnInit } from '@angular/core';
import { VentasRutaService } from '../services/ventas-ruta';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { CarritoEstadoService } from '../services/carrito-estado';

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page implements OnInit {

  ordenes: any[] = [];
  cargando = false;
  actualizando: { [id: number]: boolean } = {};

  menuAbierto = false;
  usuarioActual = '';

  constructor(
    private ventasRutaService: VentasRutaService,
    public router: Router,
    private authService: AuthService,
    private carritoEstado: CarritoEstadoService
  ) { }

  ngOnInit() {
    this.cargarOrdenes();
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
  }

  ionViewWillEnter() {
    this.cargarOrdenes();
  }

  cargarOrdenes() {
    this.cargando = true;
    this.ventasRutaService.getPendientes().subscribe({
      next: (data) => {
        this.ordenes = data;
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  marcarListo(orden: any) {
    if (orden.listo_conductor) return;
    this.actualizando[orden.venta_id] = true;
    this.ventasRutaService.marcarListo(orden.venta_id).subscribe({
      next: () => {
        orden.listo_conductor = 1;
        this.actualizando[orden.venta_id] = false;
        this.verificarCompleta(orden);
      },
      error: () => { this.actualizando[orden.venta_id] = false; }
    });
  }

  marcarEntregado(orden: any) {
    if (orden.entregado_vendedor) return;
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

  // ---- MENU ----
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }

  irAClientes() { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial() { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }

  // ---- CARRITO ----
  irAlCarrito() {
    // Le dice al tab1 que abra el carrito cuando llegue
    this.carritoEstado.solicitarAbrirCarrito();
    this.router.navigate(['/tabs/tab1']);
  }
}