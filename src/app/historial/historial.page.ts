import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AlertController } from '@ionic/angular';
import { PrinterService, DatosRecibo } from '../services/printer';

export interface VentaHistorial {
  id: number;
  ordenId: number;
  clienteNombre: string;
  clienteApellido: string;
  clienteNegocio: string | null;
  clienteCedula: string;
  clienteTelefono: string; // ← nuevo
  clienteDireccion: string; // ← nuevo
  vendedor: string; // ← nuevo
  tipoCliente?: string;
  estado: 'Entregado' | 'Pendiente';
  total: number;
  subtotal: number;
  descuento: number;
  iva: number;
  fecha: string;
  formaPago: string;
  montoRecibido: number; // ← nuevo
  vuelto: number; // ← nuevo
  items: VentaItem[];
  saldoGenerado: number;
}

export interface VentaItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number; // ← nuevo
  descuento: number; // ← nuevo
  subtotal: number;
}

export interface AbonoHistorial {
  id: number;
  ventaId: number;
  clienteNombre: string;
  clienteNegocio: string | null;
  cedula: string;
  monto: number;
  formaPago: string;
  fecha: string;
  notas: string | null;
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
  semanaActual: Date[] = [];
  mostrarDatePicker = false;

  ventas: VentaHistorial[] = [];
  abonos: AbonoHistorial[] = [];
  cargando = false;

  mostrarDetalle = false;
  puedesCerrarDetalle: boolean | (() => Promise<boolean>) = true;
  ventaDetalle: VentaHistorial | null = null;
  cargandoDetalle = false;

  modoEliminacion = false;
  ventasSeleccionadas: Set<number> = new Set();
  eliminando = false;

  imprimiendo = false;

  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private alertCtrl: AlertController,
    private printerService: PrinterService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.generarSemana(this.fechaSeleccionada);
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

  // ── GETTERS RESUMEN ──
  get totalVentasPagadas(): number {
    return this.ventas
      .filter(v => v.saldoGenerado === 0)
      .reduce((acc, v) => acc + v.total, 0);
  }

  get totalAbonos(): number {
    return this.abonos.reduce((acc, a) => acc + a.monto, 0);
  }

  iniciarPolling() {
    this.detenerPolling();
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
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http
      .get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, {
        headers: this.getHeaders(),
      })
      .subscribe({
        next: (data) => {
          const idsActuales = new Set(this.ventas.map((v) => v.id));
          (data || []).forEach((v) => {
            const venta = this.mapearVenta(v);
            if (!idsActuales.has(venta.id))
              this.ventas = [venta, ...this.ventas];
          });
        },
        error: () => {},
      });

    this.http
      .get<any[]>(`${this.API}/abonos?fecha=${fechaStr}`, {
        headers: this.getHeaders(),
      })
      .subscribe({
        next: (data) => {
          this.abonos = (data || []).map((a) => ({
            id: a.id,
            ventaId: a.venta_id,
            clienteNombre: a.cliente_nombre || '',
            clienteNegocio: a.nombre_negocio || null,
            cedula: a.cedula || '',
            monto: parseFloat(a.monto) || 0,
            formaPago: a.forma_pago || '',
            fecha: a.fecha || '',
            notas: a.notas || null,
          }));
        },
        error: () => {},
      });
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

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

  abrirDatePicker() {
    this.mostrarDatePicker = true;
  }
  cerrarDatePicker() {
    this.mostrarDatePicker = false;
  }

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

  cargarVentas() {
    this.cargando = true;
    this.ventas = [];
    this.abonos = [];
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);

    this.http
      .get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, {
        headers: this.getHeaders(),
      })
      .subscribe({
        next: (data) => {
          this.ventas = (data || []).map((v) => this.mapearVenta(v)).reverse();
          this.cargando = false;
        },
        error: () => {
          this.ventas = [];
          this.cargando = false;
        },
      });

    this.http
      .get<any[]>(`${this.API}/abonos?fecha=${fechaStr}`, {
        headers: this.getHeaders(),
      })
      .subscribe({
        next: (data) => {
          this.abonos = (data || []).map((a) => ({
            id: a.id,
            ventaId: a.venta_id,
            clienteNombre: a.cliente_nombre || '',
            clienteNegocio: a.nombre_negocio || null,
            cedula: a.cedula || '',
            monto: parseFloat(a.monto) || 0,
            formaPago: a.forma_pago || '',
            fecha: a.fecha || '',
            notas: a.notas || null,
          }));
        },
        error: () => {
          this.abonos = [];
        },
      });
  }

  private mapearVenta(v: any): VentaHistorial {
    const nombreCompleto: string = v.cliente || v.clienteNombre || '';
    const partes = nombreCompleto.trim().split(' ');
    const nombre = partes[0] || '';
    const apellido = partes.slice(1).join(' ') || '';

    const estadoRaw = (v.estado || '').toLowerCase();
    const estado: 'Entregado' | 'Pendiente' =
      estadoRaw === 'entregado' ? 'Entregado' : 'Pendiente';

    const rawItems = v.items || v.detalle || v.detalles || [];
    const ventaId = v.venta_id || v.id;

    const tipoRaw = v.tipo_cliente || v.tipo || v.cliente_tipo || '';
    const tipoCliente =
      tipoRaw === 'particular'
        ? 'Particular'
        : tipoRaw === 'negocio'
        ? 'Negocio'
        : tipoRaw || '—';

    return {
      id: ventaId,
      ordenId: ventaId,
      clienteNombre: nombre,
      clienteApellido: apellido,
      clienteNegocio: v.nombre_negocio || null,
      clienteCedula: v.cedula || '',
      clienteTelefono: v.telefono || '', // ← nuevo
      clienteDireccion: v.direccion || '', // ← nuevo
      vendedor: v.vendedor || '', // ← nuevo
      tipoCliente,
      estado,
      saldoGenerado: parseFloat(v.saldo_generado) || 0,
      total: parseFloat(v.total) || 0,
      subtotal: parseFloat(v.subtotal) || 0,
      descuento: parseFloat(v.descuento) || 0,
      iva: parseFloat(v.iva) || 0,
      fecha: v.fecha || v.created_at || '',
      formaPago: v.tipo_pago || v.forma_pago || '',
      montoRecibido: parseFloat(v.monto_recibido) || 0, // ← nuevo
      vuelto: parseFloat(v.vuelto) || 0, // ← nuevo
      items: rawItems.map((item: any) => ({
        nombre: item.nombre || item.producto || item.producto_nombre || '',
        cantidad: item.cantidad || 0,
        precio_unitario: parseFloat(item.precio_unitario) || 0, // ← nuevo
        descuento: parseFloat(item.descuento) || 0, // ← nuevo
        subtotal: parseFloat(item.subtotal) || 0,
      })),
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
    this.puedesCerrarDetalle = () =>
      new Promise((resolve) => {
        const modalContent = document.querySelector(
          'ion-modal .detalle-modal-content'
        );
        if (!modalContent) {
          resolve(true);
          return;
        }
        (modalContent as any)
          .getScrollElement()
          .then((el: HTMLElement) => {
            resolve(el.scrollTop < 10);
          })
          .catch(() => resolve(true));
      });
    this.mostrarDetalle = true;

    this.http
      .get<any>(`${this.API}/ventas-ruta/${venta.id}`, {
        headers: this.getHeaders(),
      })
      .subscribe({
        next: (data) => {
          this.ventaDetalle = this.mapearVenta(data);
          this.cargandoDetalle = false;
        },
        error: () => {
          this.cargandoDetalle = false;
        },
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
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => this.eliminarSeleccionadas(),
        },
        { text: 'Cancelar', role: 'cancel' },
      ],
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
      this.http
        .delete(`${this.API}/ventas-ruta/${ids[index]}`, {
          headers: this.getHeaders(),
        })
        .subscribe({
          next: () => eliminarUno(index + 1),
          error: () => eliminarUno(index + 1),
        });
    };

    eliminarUno(0);
  }

  async reimprimirOrden() {
    if (!this.ventaDetalle || this.imprimiendo) return;

    this.imprimiendo = true;
    try {
      const datos: DatosRecibo = {
        ventaId: this.ventaDetalle.id,
        clienteNombre:
          `${this.ventaDetalle.clienteNombre} ${this.ventaDetalle.clienteApellido}`.trim(),
        clienteCedula: this.ventaDetalle.clienteCedula,
        clienteTelefono: this.ventaDetalle.clienteTelefono,
        clienteDireccion: this.ventaDetalle.clienteDireccion,
        vendedor: this.ventaDetalle.vendedor,
        items: this.ventaDetalle.items.map((item) => ({
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento: item.descuento,
          subtotal: item.subtotal,
        })),
        subtotal: this.ventaDetalle.subtotal,
        descuento: this.ventaDetalle.descuento,
        iva: this.ventaDetalle.iva,
        ivaPercent: this.ventaDetalle.iva > 0 ? 15 : 0,
        total: this.ventaDetalle.total,
        formaPago: this.ventaDetalle.formaPago,
        montoRecibido: this.ventaDetalle.montoRecibido,
        vuelto: this.ventaDetalle.vuelto,
      };

      await this.printerService.imprimirRecibo(datos);
    } catch (err: any) {
      const alert = await this.alertCtrl.create({
        header: 'Error de impresión',
        message:
          err?.message ||
          'No se pudo imprimir. Verifica que la impresora esté conectada.',
        buttons: ['OK'],
      });
      await alert.present();
    } finally {
      this.imprimiendo = false;
    }
  }
  abrirMenu() {
    this.menuAbierto = true;
  }
  cerrarMenu() {
    this.menuAbierto = false;
  }

  cerrarSesion() {
    this.authService.logout();
    this.menuAbierto = false;
    this.router.navigate(['/login']);
  }
}
