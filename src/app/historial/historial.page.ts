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
  clienteTelefono: string;
  clienteDireccion: string;
  vendedor: string;
  tipoCliente?: string;
  estado: 'Entregado' | 'Pendiente';
  total: number;
  subtotal: number;
  descuento: number;
  iva: number;
  fecha: string;
  formaPago: string;
  montoRecibido: number;
  vuelto: number;
  items: VentaItem[];
  saldoGenerado: number;
}

export interface VentaItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
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

const FORMAS_CONTADO = ['efectivo', 'cheques', 'cheque'];

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

  // ── Calendario (igual que caja) ──────────────────────────────────
  fechaSeleccionada: Date = new Date();
  semanaBase: Date = new Date();
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

  // ── Búsqueda por orden ───────────────────────────────────────────
  mostrarBusqueda = false;
  inputBusquedaOrden = '';
  buscandoOrden = false;
  errorBusqueda = '';

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
    const base = new Date(this.fechaSeleccionada);
    base.setDate(base.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
  }

  ionViewWillEnter() { this.cargarVentas(); this.iniciarPolling(); }
  ionViewWillLeave() { this.detenerPolling(); }
  ngOnDestroy() { this.detenerPolling(); }

  private esContado(formaPago: string): boolean {
    return FORMAS_CONTADO.includes((formaPago || '').toLowerCase().trim());
  }

  private esTransferencia(formaPago: string): boolean {
    return (formaPago || '').toLowerCase().trim() === 'transferencia';
  }

  get totalVentasContado(): number {
    return this.ventas.filter(v => v.saldoGenerado === 0 && this.esContado(v.formaPago)).reduce((acc, v) => acc + v.total, 0);
  }

  get totalVentasTransferencia(): number {
    return this.ventas.filter(v => v.saldoGenerado === 0 && this.esTransferencia(v.formaPago)).reduce((acc, v) => acc + v.total, 0);
  }

  get totalAbonosContado(): number {
    return this.abonos.filter(a => this.esContado(a.formaPago)).reduce((acc, a) => acc + a.monto, 0);
  }

  get totalAbonosTransferencia(): number {
    return this.abonos.filter(a => this.esTransferencia(a.formaPago)).reduce((acc, a) => acc + a.monto, 0);
  }

  get totalCobradoDia(): number {
    return this.totalVentasContado + this.totalVentasTransferencia + this.totalAbonosContado + this.totalAbonosTransferencia;
  }

  // ── Polling ──────────────────────────────────────────────────────
  iniciarPolling() {
    this.detenerPolling();
    this.pollingInterval = setInterval(() => this.cargarVentasSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  cargarVentasSilencioso() {
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        const idsActuales = new Set(this.ventas.map(v => v.id));
        (data || []).forEach(v => { const venta = this.mapearVenta(v); if (!idsActuales.has(venta.id)) this.ventas = [venta, ...this.ventas]; });
      },
      error: () => {}
    });
    this.http.get<any[]>(`${this.API}/abonos?fecha=${fechaStr}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.abonos = (data || []).map(a => this.mapearAbono(a)); },
      error: () => {}
    });
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.authService.getToken()}` });
  }

  // ── Calendario igual que caja ────────────────────────────────────
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
    const n = new Date(this.semanaBase);
    n.setDate(n.getDate() - 7);
    this.semanaBase = n;
    this.generarSemana(n);
    this.fechaSeleccionada = new Date(this.semanaActual[6]);
    this.cargarVentas();
  }

  semanaSiguiente() {
    const n = new Date(this.semanaBase);
    n.setDate(n.getDate() + 7);
    this.semanaBase = n;
    this.generarSemana(n);
    this.fechaSeleccionada = new Date(this.semanaActual[0]);
    this.cargarVentas();
  }

  esSemanaActual(): boolean {
    const u = new Date(this.semanaActual[this.semanaActual.length - 1]);
    const h = new Date();
    h.setHours(0, 0, 0, 0); u.setHours(0, 0, 0, 0);
    return u >= h;
  }

  seleccionarDia(dia: Date) { this.fechaSeleccionada = new Date(dia); this.cargarVentas(); }
  esDiaSeleccionado(dia: Date): boolean { return dia.toDateString() === this.fechaSeleccionada.toDateString(); }
  esHoy(dia: Date): boolean { return dia.toDateString() === new Date().toDateString(); }
  abrirDatePicker() { this.mostrarDatePicker = true; }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value;
    if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    const base = new Date(nueva);
    base.setDate(nueva.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
    this.cargarVentas();
    this.cerrarDatePicker();
  }

  // ── Carga ────────────────────────────────────────────────────────
  cargarVentas() {
    this.cargando = true;
    this.ventas = [];
    this.abonos = [];
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.ventas = (data || []).map(v => this.mapearVenta(v)).reverse(); this.cargando = false; },
      error: () => { this.ventas = []; this.cargando = false; }
    });
    this.http.get<any[]>(`${this.API}/abonos?fecha=${fechaStr}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.abonos = (data || []).map(a => this.mapearAbono(a)); },
      error: () => { this.abonos = []; }
    });
  }

  private mapearAbono(a: any): AbonoHistorial {
    return {
      id: a.id, ventaId: a.venta_id,
      clienteNombre: a.cliente_nombre || '',
      clienteNegocio: a.nombre_negocio || null,
      cedula: a.cedula || '',
      monto: parseFloat(a.monto) || 0,
      formaPago: a.forma_pago || '',
      fecha: a.fecha || '',
      notas: a.notas || null,
    };
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
    const tipoRaw = v.tipo_cliente || v.tipo || v.cliente_tipo || '';
    const tipoCliente = tipoRaw === 'particular' ? 'Particular' : tipoRaw === 'negocio' ? 'Negocio' : tipoRaw || '—';
    return {
      id: ventaId, ordenId: ventaId,
      clienteNombre: nombre, clienteApellido: apellido,
      clienteNegocio: v.nombre_negocio || null,
      clienteCedula: v.cedula || '',
      clienteTelefono: v.telefono || '',
      clienteDireccion: v.direccion || '',
      vendedor: v.vendedor || '',
      tipoCliente, estado,
      saldoGenerado: parseFloat(v.saldo_generado) || 0,
      total: parseFloat(v.total) || 0,
      subtotal: parseFloat(v.subtotal) || 0,
      descuento: parseFloat(v.descuento) || 0,
      iva: parseFloat(v.iva) || 0,
      fecha: v.fecha || v.created_at || '',
      formaPago: v.tipo_pago || v.forma_pago || '',
      montoRecibido: parseFloat(v.monto_recibido) || 0,
      vuelto: parseFloat(v.vuelto) || 0,
      items: rawItems.map((item: any) => ({
        nombre: item.nombre || item.producto || item.producto_nombre || '',
        cantidad: item.cantidad || 0,
        precio_unitario: parseFloat(item.precio_unitario) || 0,
        descuento: parseFloat(item.descuento) || 0,
        subtotal: parseFloat(item.subtotal) || 0,
      })),
    };
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  // ── Búsqueda por número de orden ─────────────────────────────────
  abrirBusqueda() { this.mostrarBusqueda = true; this.inputBusquedaOrden = ''; this.errorBusqueda = ''; }
  cerrarBusqueda() { this.mostrarBusqueda = false; this.inputBusquedaOrden = ''; this.errorBusqueda = ''; }

  buscarPorOrden() {
    const num = parseInt(this.inputBusquedaOrden, 10);
    if (!num || num <= 0) { this.errorBusqueda = 'Ingresa un número de orden válido'; return; }
    this.buscandoOrden = true;
    this.errorBusqueda = '';
    this.http.get<any>(`${this.API}/ventas-ruta/${num}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.buscandoOrden = false;
        this.cerrarBusqueda();
        const venta = this.mapearVenta(data);
        this.cargandoDetalle = false;
        this.ventaDetalle = venta;
        this.mostrarDetalle = true;
        this.puedesCerrarDetalle = true;
      },
      error: (err) => {
        this.buscandoOrden = false;
        this.errorBusqueda = err.status === 404 ? 'Orden no encontrada' : 'Error al buscar';
      }
    });
  }

  // ── Detalle abono ────────────────────────────────────────────────
  mostrarDetalleAbono = false;
  abonoDetalle: AbonoHistorial | null = null;

  verAbono(abono: AbonoHistorial) {
    this.abonoDetalle = abono;
    this.mostrarDetalleAbono = true;
  }

  cerrarDetalleAbono() { this.mostrarDetalleAbono = false; this.abonoDetalle = null; }

  async reimprimirAbono() {
    if (!this.abonoDetalle || this.imprimiendo) return;
    this.imprimiendo = true;
    try {
      await this.printerService.imprimirRecibo({
        ventaId: this.abonoDetalle.ventaId,
        clienteNombre: this.abonoDetalle.clienteNombre,
        clienteCedula: this.abonoDetalle.cedula,
        clienteTelefono: '',
        clienteDireccion: '',
        vendedor: '',
        items: [{ nombre: `Abono → Orden #${this.abonoDetalle.ventaId}`, cantidad: 1, precio_unitario: this.abonoDetalle.monto, descuento: 0, subtotal: this.abonoDetalle.monto }],
        subtotal: this.abonoDetalle.monto, descuento: 0, iva: 0, ivaPercent: 0,
        total: this.abonoDetalle.monto,
        formaPago: this.abonoDetalle.formaPago,
        montoRecibido: this.abonoDetalle.monto, vuelto: 0,
      });
    } catch (err: any) {
      const alert = await this.alertCtrl.create({ header: 'Error de impresión', message: err?.message || 'No se pudo imprimir.', buttons: ['OK'] });
      await alert.present();
    } finally { this.imprimiendo = false; }
  }

  // ── Detalle venta ────────────────────────────────────────────────
  verVenta(venta: VentaHistorial) {
    if (this.modoEliminacion) { this.toggleSeleccion(venta.id); return; }
    this.cargandoDetalle = true;
    this.ventaDetalle = venta;
    this.puedesCerrarDetalle = true;
    this.mostrarDetalle = true;
    this.http.get<any>(`${this.API}/ventas-ruta/${venta.id}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.ventaDetalle = this.mapearVenta(data); this.cargandoDetalle = false; },
      error: () => { this.cargandoDetalle = false; }
    });
  }

  cerrarDetalle() { this.mostrarDetalle = false; this.ventaDetalle = null; }

  // ── Modo eliminación ─────────────────────────────────────────────
  toggleModoEliminacion() { this.modoEliminacion = !this.modoEliminacion; if (!this.modoEliminacion) this.ventasSeleccionadas.clear(); }
  toggleSeleccion(id: number) { if (this.ventasSeleccionadas.has(id)) this.ventasSeleccionadas.delete(id); else this.ventasSeleccionadas.add(id); }
  estaSeleccionada(id: number): boolean { return this.ventasSeleccionadas.has(id); }

  async confirmarEliminacion() {
    if (this.ventasSeleccionadas.size === 0) return;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar ventas',
      message: `¿Estás seguro de eliminar ${this.ventasSeleccionadas.size} venta(s)? Esta acción no se puede deshacer.`,
      cssClass: 'alert-personalizado',
      buttons: [
        { text: 'Eliminar', role: 'destructive', handler: () => this.eliminarSeleccionadas() },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  eliminarSeleccionadas() {
    this.eliminando = true;
    const ids = Array.from(this.ventasSeleccionadas);
    const eliminarUno = (index: number) => {
      if (index >= ids.length) { this.eliminando = false; this.modoEliminacion = false; this.ventasSeleccionadas.clear(); this.cargarVentas(); return; }
      this.http.delete(`${this.API}/ventas-ruta/${ids[index]}`, { headers: this.getHeaders() }).subscribe({
        next: () => eliminarUno(index + 1),
        error: () => eliminarUno(index + 1),
      });
    };
    eliminarUno(0);
  }

  // ── Reimprimir ───────────────────────────────────────────────────
  async reimprimirOrden() {
    if (!this.ventaDetalle || this.imprimiendo) return;
    this.imprimiendo = true;
    try {
      const datos: DatosRecibo = {
        ventaId: this.ventaDetalle.id,
        clienteNombre: `${this.ventaDetalle.clienteNombre} ${this.ventaDetalle.clienteApellido}`.trim(),
        clienteCedula: this.ventaDetalle.clienteCedula,
        clienteTelefono: this.ventaDetalle.clienteTelefono,
        clienteDireccion: this.ventaDetalle.clienteDireccion,
        vendedor: this.ventaDetalle.vendedor,
        items: this.ventaDetalle.items.map(item => ({ nombre: item.nombre, cantidad: item.cantidad, precio_unitario: item.precio_unitario, descuento: item.descuento, subtotal: item.subtotal })),
        subtotal: this.ventaDetalle.subtotal, descuento: this.ventaDetalle.descuento,
        iva: this.ventaDetalle.iva, ivaPercent: this.ventaDetalle.iva > 0 ? 15 : 0,
        total: this.ventaDetalle.total, formaPago: this.ventaDetalle.formaPago,
        montoRecibido: this.ventaDetalle.montoRecibido, vuelto: this.ventaDetalle.vuelto,
      };
      await this.printerService.imprimirRecibo(datos);
    } catch (err: any) {
      const alert = await this.alertCtrl.create({ header: 'Error de impresión', message: err?.message || 'No se pudo imprimir.', buttons: ['OK'] });
      await alert.present();
    } finally { this.imprimiendo = false; }
  }

  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
}