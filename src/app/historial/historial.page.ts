import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AlertController } from '@ionic/angular';

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

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto = false;
  usuarioActual: string = '';

  fechaSeleccionada: Date = new Date();
  semanaActual: Date[] = [];
  mostrarDatePicker = false;

  ventas: VentaHistorial[] = [];
  cargando = false;

  mostrarDetalle = false;
  ventaDetalle: VentaHistorial | null = null;
  cargandoDetalle = false;

  modoEliminacion = false;
  ventasSeleccionadas: Set<number> = new Set();
  eliminando = false;

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private alertCtrl: AlertController,
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.generarSemana(this.fechaSeleccionada);
    this.cargarVentas();
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ---- SEMANA ----
  generarSemana(fecha: Date) {
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
    const hoyStr = this.formatearFecha(hoy);
    const selStr = this.formatearFecha(this.fechaSeleccionada);
    return selStr >= hoyStr;
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
    const valor = event.target.value;
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
    this.ventas = [];
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);

    this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.ventas = (data || []).map(v => this.mapearVenta(v));
          this.cargando = false;
        },
        error: () => {
          this.ventas = [];
          this.cargando = false;
        }
      });
  }

  private mapearVenta(v: any): VentaHistorial {
    const nombreCompleto: string = v.cliente || v.clienteNombre || '';
    const partes = nombreCompleto.trim().split(' ');
    const nombre = partes[0] || '';
    const apellido = partes.slice(1).join(' ') || '';

    const estadoRaw = (v.estado || '').toLowerCase();
    const estado: 'Entregado' | 'Pendiente' = estadoRaw === 'entregado' ? 'Entregado' : 'Pendiente';

    const rawItems = v.items || v.detalle || v.detalles || [];

    return {
      id: v.venta_id || v.id,
      clienteNombre: nombre,
      clienteApellido: apellido,
      clienteNegocio: v.nombre_negocio || null,
      clienteCedula: v.cedula || '',
      tipoCliente: v.tipo_cliente || 'Negocio',
      estado,
      total: parseFloat(v.total) || 0,
      subtotal: parseFloat(v.subtotal) || 0,
      descuento: parseFloat(v.descuento) || 0,
      iva: parseFloat(v.iva) || 0,
      fecha: v.fecha || v.created_at || '',
      formaPago: v.tipo_pago || v.forma_pago || '',
      items: rawItems.map((item: any) => ({
        nombre: item.nombre || item.producto || item.producto_nombre || '',
        cantidad: item.cantidad || 0,
        subtotal: parseFloat(item.subtotal) || 0,
      }))
    };
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const a = fecha.getFullYear();
    return `${a}-${m}-${d}`;
  }

  // ---- VER DETALLE ----
  verVenta(venta: VentaHistorial) {
    if (this.modoEliminacion) {
      this.toggleSeleccion(venta.id);
      return;
    }

    this.cargandoDetalle = true;
    this.ventaDetalle = venta;
    this.mostrarDetalle = true;

    this.http.get<any>(`${this.API}/ventas-ruta/${venta.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.ventaDetalle = this.mapearVenta(data);
          this.cargandoDetalle = false;
        },
        error: () => {
          this.cargandoDetalle = false;
        }
      });
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
    this.ventaDetalle = null;
  }

  // ---- MODO ELIMINACIÓN ----
  toggleModoEliminacion() {
    this.modoEliminacion = !this.modoEliminacion;
    if (!this.modoEliminacion) {
      this.ventasSeleccionadas.clear();
    }
  }

  toggleSeleccion(id: number) {
    if (this.ventasSeleccionadas.has(id)) {
      this.ventasSeleccionadas.delete(id);
    } else {
      this.ventasSeleccionadas.add(id);
    }
  }

  estaSeleccionada(id: number): boolean {
    return this.ventasSeleccionadas.has(id);
  }

  async confirmarEliminacion() {
    if (this.ventasSeleccionadas.size === 0) return;

    const alert = await this.alertCtrl.create({
      header: 'Eliminar ventas',
      message: `¿Estás seguro de eliminar ${this.ventasSeleccionadas.size} venta(s)? Esta acción no se puede deshacer.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarSeleccionadas() }
      ]
    });
    await alert.present();
  }

  eliminarSeleccionadas() {
    this.eliminando = true;
    const ids = Array.from(this.ventasSeleccionadas);

    const eliminarUno = (index: number) => {
      if (index >= ids.length) {
        this.eliminando = false;
        this.modoEliminacion = false;
        this.ventasSeleccionadas.clear();
        this.cargarVentas();
        return;
      }
      this.http.delete(`${this.API}/ventas-ruta/${ids[index]}`, { headers: this.getHeaders() })
        .subscribe({
          next: () => eliminarUno(index + 1),
          error: () => eliminarUno(index + 1)
        });
    };

    eliminarUno(0);
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