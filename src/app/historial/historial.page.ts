import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AlertController } from '@ionic/angular';

export interface VentaHistorial {
  id: number;
  ordenId: number;
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
export class HistorialPage implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto = false;
  usuarioActual: string = '';

  fechaSeleccionada: Date = new Date();
  semanaBase: Date = new Date();   // ← primer día visible de la tira
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

  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private alertCtrl: AlertController,
  ) { }

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';

    // semanaBase = hoy - 3 para que hoy quede centrado visualmente
    const base = new Date(this.fechaSeleccionada);
    base.setDate(base.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
  }

  ionViewWillEnter() {
    this.cargarVentas();
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
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => {
      this.cargarVentasSilencioso();
    }, this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  cargarVentasSilencioso() {
    if (!this.authService.estaLogueado()) return;
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          const idsActuales = new Set(this.ventas.map(v => v.id));
          (data || []).forEach(v => {
            const venta = this.mapearVenta(v);
            if (!idsActuales.has(venta.id)) {
              this.ventas = [...this.ventas, venta];
            }
          });
        },
        error: () => {}
      });
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // Genera 7 días consecutivos desde `base` hacia adelante (sin centrar)
  generarSemana(base: Date) {
    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dias.push(d);
    }
    this.semanaActual = dias;
  }

  semanaAnterior() {
    const nueva = new Date(this.semanaBase);
    nueva.setDate(nueva.getDate() - 7);
    this.semanaBase = nueva;
    this.generarSemana(nueva);
    // selecciona el último día de la tira al retroceder
    this.fechaSeleccionada = new Date(this.semanaActual[6]);
    this.cargarVentas();
  }

  semanaSiguiente() {
    const nueva = new Date(this.semanaBase);
    nueva.setDate(nueva.getDate() + 7);
    this.semanaBase = nueva;
    this.generarSemana(nueva);
    // selecciona el primer día de la tira al avanzar
    this.fechaSeleccionada = new Date(this.semanaActual[0]);
    this.cargarVentas();
  }

  esSemanaActual(): boolean {
    // deshabilita la flecha si el último día de la tira ya llegó a hoy o futuro
    const ultimoDia = new Date(this.semanaActual[this.semanaActual.length - 1]);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    ultimoDia.setHours(0, 0, 0, 0);
    return ultimoDia >= hoy;
  }

  seleccionarDia(dia: Date) {
    // solo cambia el día seleccionado — semanaBase NO se mueve
    this.fechaSeleccionada = new Date(dia);
    this.cargarVentas();
  }

  esDiaSeleccionado(dia: Date): boolean {
    return dia.toDateString() === this.fechaSeleccionada.toDateString();
  }

  esHoy(dia: Date): boolean {
    return dia.toDateString() === new Date().toDateString();
  }

  abrirDatePicker() { this.mostrarDatePicker = true; }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value;
    if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    // date picker resetea el ancla centrada en la fecha elegida
    const base = new Date(nueva);
    base.setDate(nueva.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
    this.cargarVentas();
    this.cerrarDatePicker();
  }

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
    const ventaId = v.venta_id || v.id;

    return {
      id: ventaId,
      ordenId: ventaId,
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
      cssClass: 'alert-personalizado',
      buttons: [
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarSeleccionadas() },
        { text: 'Cancelar', role: 'cancel' }
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

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }

  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']);  }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']);   }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
}