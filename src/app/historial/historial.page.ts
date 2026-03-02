import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
// TODO: importar tu servicio de ventas cuando lo tengas
// import { VentasService } from '../services/ventas';

export interface VentaHistorial {
  id: number;
  clienteNombre: string;
  clienteApellido: string;
  clienteNegocio: string | null;
  clienteCedula: string;
  tipoCliente?: string;
  estado: 'Entregado' | 'Pendiente';
  total: number;
  subtotal: number;
  descuento: number;
  iva: number;
  fecha: string;
  formaPago: string;
  items: VentaItem[];
}

export interface VentaItem {
  nombre: string;
  cantidad: number;
  subtotal: number;
}

@Component({
  selector: 'app-historial',
  templateUrl: 'historial.page.html',
  styleUrls: ['historial.page.scss'],
  standalone: false,
})
export class HistorialPage implements OnInit {

  menuAbierto = false;
  usuarioActual: string = '';

  // Fecha seleccionada (hoy por defecto)
  fechaSeleccionada: Date = new Date();

  // Semana visible (7 días centrados en la fecha seleccionada)
  semanaActual: Date[] = [];

  // Date picker
  mostrarDatePicker = false;

  // Ventas del día seleccionado
  ventas: VentaHistorial[] = [];
  cargando = false;

  // Modal detalle
  mostrarDetalle = false;
  ventaDetalle: VentaHistorial | null = null;

  constructor(
    public router: Router,
    private authService: AuthService,
    // private ventasService: VentasService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.generarSemana(this.fechaSeleccionada);
    this.cargarVentas();
  }

  // ---- GENERACIÓN DE SEMANA ----
  generarSemana(fecha: Date) {
    // Muestra 7 días: los 3 anteriores, el seleccionado y los 3 siguientes
    const dias: Date[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(fecha);
      d.setDate(fecha.getDate() + i);
      dias.push(d);
    }
    this.semanaActual = dias;
  }

  semanaAnterior() {
    const nueva = new Date(this.fechaSeleccionada);
    nueva.setDate(nueva.getDate() - 7);
    this.fechaSeleccionada = nueva;
    this.generarSemana(nueva);
    this.cargarVentas();
  }

  semanaSiguiente() {
    const nueva = new Date(this.fechaSeleccionada);
    nueva.setDate(nueva.getDate() + 7);
    this.fechaSeleccionada = nueva;
    this.generarSemana(nueva);
    this.cargarVentas();
  }

  esSemanaActual(): boolean {
    const hoy = new Date();
    // Deshabilitar flecha derecha si ya estamos en la semana actual o futura
    return this.fechaSeleccionada >= hoy;
  }

  seleccionarDia(dia: Date) {
    this.fechaSeleccionada = new Date(dia);
    this.cargarVentas();
  }

  esDiaSeleccionado(dia: Date): boolean {
    return dia.toDateString() === this.fechaSeleccionada.toDateString();
  }

  esHoy(dia: Date): boolean {
    return dia.toDateString() === new Date().toDateString();
  }

  // ---- DATE PICKER ----
  abrirDatePicker() { this.mostrarDatePicker = true; }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value; // "yyyy-MM-dd"
    if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    this.generarSemana(nueva);
    this.cargarVentas();
    this.cerrarDatePicker();
  }

  // ---- CARGA DE VENTAS ----
  cargarVentas() {
    this.cargando = true;
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);

    // ── Reemplaza esto con tu servicio real ──
    // this.ventasService.getPorFecha(fechaStr).subscribe({
    //   next: (data) => { this.ventas = data; this.cargando = false; },
    //   error: () => { this.ventas = []; this.cargando = false; }
    // });

    // Datos de ejemplo mientras conectas la API:
    setTimeout(() => {
      this.ventas = [
        { id: 1, clienteNombre: 'Nombre del Cliente', clienteApellido: '', clienteNegocio: 'Nombre del Local', clienteCedula: 'cedula', estado: 'Entregado', total: 125.00, subtotal: 108.70, descuento: 0, iva: 16.30, fecha: fechaStr, formaPago: 'Efectivo',       items: [] },
        { id: 2, clienteNombre: 'Nombre del Cliente', clienteApellido: '', clienteNegocio: 'Nombre del Local', clienteCedula: 'cedula', estado: 'Pendiente', total: 80.50,  subtotal: 70.00,  descuento: 0, iva: 10.50, fecha: fechaStr, formaPago: 'Transferencia', items: [] },
        { id: 3, clienteNombre: 'Nombre del Cliente', clienteApellido: '', clienteNegocio: 'Nombre del Local', clienteCedula: 'cedula', estado: 'Entregado', total: 200.00, subtotal: 173.91, descuento: 0, iva: 26.09, fecha: fechaStr, formaPago: 'Efectivo',       items: [] },
        { id: 4, clienteNombre: 'Nombre del Cliente', clienteApellido: '', clienteNegocio: 'Nombre del Local', clienteCedula: 'cedula', estado: 'Entregado', total: 45.00,  subtotal: 39.13,  descuento: 0, iva: 5.87,  fecha: fechaStr, formaPago: 'Efectivo',       items: [] },
        { id: 5, clienteNombre: 'Nombre del Cliente', clienteApellido: '', clienteNegocio: 'Nombre del Local', clienteCedula: 'cedula', estado: 'Entregado', total: 310.00, subtotal: 269.57, descuento: 0, iva: 40.43, fecha: fechaStr, formaPago: 'Transferencia', items: [] },
      ];
      this.cargando = false;
    }, 400);
    // ─────────────────────────────────────────
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const a = fecha.getFullYear();
    return `${a}-${m}-${d}`;
  }

  // ---- VER DETALLE VENTA ----
  verVenta(venta: VentaHistorial) {
    // Si ya tienes los items en el objeto, ábrelo directo
    // Si necesitas cargarlos desde la API:
    // this.ventasService.getDetalle(venta.id).subscribe(detalle => {
    //   this.ventaDetalle = detalle;
    //   this.mostrarDetalle = true;
    // });

    // Por ahora abre con los datos que ya tiene + items de ejemplo:
    this.ventaDetalle = {
      ...venta,
      tipoCliente: 'Negocio',
      subtotal: venta.total / 1.15,
      descuento: 0,
      iva: venta.total - (venta.total / 1.15),
      items: [
        { nombre: 'B460gr', cantidad: 10, subtotal: 80.00 },
        { nombre: 'B460gr', cantidad: 10, subtotal: 80.00 },
        { nombre: 'B460gr', cantidad: 10, subtotal: 80.00 },
        { nombre: 'B460gr', cantidad: 10, subtotal: 80.00 },
        { nombre: 'B460gr', cantidad: 10, subtotal: 80.00 },
      ]
    };
    this.mostrarDetalle = true;
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
    this.ventaDetalle = null;
  }

  // ---- MENU ----
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }

  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
}