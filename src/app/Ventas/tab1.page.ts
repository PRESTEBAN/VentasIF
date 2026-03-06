import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ProductoService, Producto } from '../services/producto';
import { ClienteService, Cliente } from '../services/cliente';
import { AuthService } from '../services/auth';
import { InventarioService } from '../services/inventario';
import { VentasRutaService } from '../services/ventas-ruta';
import { CarritoEstadoService } from '../services/carrito-estado';
import { CarritoPendienteService } from '../services/carrito-pendiente';
import { PrinterService } from '../services/printer';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {

  menuAbierto = false;
  usuarioActual: string = '';
  vendedorNombreCompleto: string = '';

  busquedaCliente = '';
  errorCliente = '';
  clienteSeleccionado: Cliente | null = null;
  clientes: Cliente[] = [];
  clientesCoincidentes: Cliente[] = [];

  mostrarAgregarCliente = false;
  nuevoCliente = {
    cedula_ruc: '', nombre: '', apellido: '',
    negocio: '', email: '', direccion: '',
    sector: '', telefono: '', esParticular: false,
    esRuc: false   // ← nuevo flag RUC
  };
  erroresCliente: any = {};
  guardandoCliente = false;

  mostrarProducto = false;
  productoSeleccionado: Producto | null = null;
  itemProducto = { cantidad: 0, precio: 0, descuento: 0, subtotal: 0, tipoPrecio: 'menor' };

  mostrarCarrito = false;
  puedesCerrarCarrito: boolean | (() => Promise<boolean>) = true;
  carrito: any[] = [];
  formaPago = 'Efectivo';
  montoRecibido: number = 0;

  productos: Producto[] = [];
  cargandoProductos = false;
  ivaPercent: number = 0;
  guardandoCarrito = false;

  carritoGuardadoEnBD = false;
  mostrarConfirmarLimpiar = false;

  private carritoSub!: Subscription;
  private socketSubs: Subscription[] = [];
  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;

  mostrarModalImpresion = false;
  estadoImpresion: 'preguntar' | 'impreso' | 'error' = 'preguntar';
  errorImpresion  = '';
  imprimiendo     = false;
  ultimoRecibo:   any = null;
  serviciosDebug  = '';

  mostrarModalBT  = false;
  escaneandoBT    = false;
  conectandoBT    = '';
  dispositivosBT: any[] = [];

  constructor(
    public router: Router,
    private productoService: ProductoService,
    private clienteService: ClienteService,
    private authService: AuthService,
    private inventarioService: InventarioService,
    private ventasRutaService: VentasRutaService,
    private carritoEstado: CarritoEstadoService,
    private carritoPendiente: CarritoPendienteService,
    public printerService: PrinterService,
    private toastCtrl: ToastController,
    private socketService: SocketService
  ) { }

  ngOnInit() {
    this.cargarClientes();
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.vendedorNombreCompleto = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || this.usuarioActual;
    this.carritoSub = this.carritoEstado.abrirCarrito.subscribe(() => { this.mostrarCarrito = true; });
  }

  ionViewWillEnter() {
    this.cargarProductos();
    this.cargarClientes();
    this.iniciarPolling();
    this.iniciarSocket();
  }

  ionViewWillLeave() {
    this.detenerPolling();
    this.detenerSocket();
  }

  ngOnDestroy() {
    if (this.carritoSub) this.carritoSub.unsubscribe();
    this.detenerPolling();
    this.detenerSocket();
  }

  // ── POLLING ───────────────────────────────────────────────────────────────
  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.actualizarStockSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  // ── SOCKET ────────────────────────────────────────────────────────────────
  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();
    const invSub = this.socketService.on('inventario_actualizado').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (this.mostrarProducto) return;
      this.actualizarStockSilencioso();
    });
    const cliSub = this.socketService.on('clientes_actualizado').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      this.cargarClientes();
    });
    this.socketSubs = [invSub, cliSub];
  }

  detenerSocket() {
    this.socketSubs.forEach(s => s.unsubscribe());
    this.socketSubs = [];
  }

  // ── STOCK SILENCIOSO ──────────────────────────────────────────────────────
  actualizarStockSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    if (this.mostrarProducto) return;
    this.inventarioService.getBodega().subscribe({
      next: (inventario) => {
        this.productos = this.productos.map(p => {
          const inv = inventario.find((i: any) => i.producto_id === p.id);
          const stockBD = inv ? inv.stock_actual : 0;
          const enCarrito = this.carrito.filter(item => item.producto_id === p.id).reduce((acc, item) => acc + item.cantidad, 0);
          return { ...p, stock: stockBD - enCarrito };
        });
      },
      error: () => {}
    });
  }

  // ── CARGA ─────────────────────────────────────────────────────────────────
  cargarProductos() {
    this.cargandoProductos = true;
    this.productoService.getAll().subscribe({
      next: (data: Producto[]) => {
        const productosNormalizados = data.map(p => ({ ...p, precio_x_mayor: +p.precio_x_mayor, precio_x_menor: +p.precio_x_menor, stock: 0 }));
        this.inventarioService.getBodega().subscribe({
          next: (inventario) => {
            const productosConStock = productosNormalizados.map(p => {
              const inv = inventario.find(i => i.producto_id === p.id);
              return { ...p, stock: inv ? inv.stock_actual : 0 };
            });
            this.productos = productosConStock.map(p => {
              const enCarrito = this.carrito.filter(item => item.producto_id === p.id).reduce((acc, item) => acc + item.cantidad, 0);
              return { ...p, stock: (p.stock ?? 0) - enCarrito };
            });
            this.cargandoProductos = false;
          },
          error: () => { this.productos = productosNormalizados; this.cargandoProductos = false; }
        });
      },
      error: (err: any) => { console.error('Error cargando productos:', err); this.cargandoProductos = false; }
    });
  }

  cargarClientes() {
    this.clienteService.getAll().subscribe({
      next: (data: Cliente[]) => { this.clientes = data; },
      error: (err: any) => { console.error('Error cargando clientes:', err); }
    });
  }

  // ── MENU ──────────────────────────────────────────────────────────────────
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']); }

  // ── BUSCAR CLIENTE ────────────────────────────────────────────────────────
  buscarCliente() {
    const valor = this.busquedaCliente.trim();
    this.clientesCoincidentes = [];
    this.errorCliente = '';
    if (!valor || valor.length < 2) { this.errorCliente = 'Ingresa una cédula (10 dígitos) o apellido válido'; return; }

    const esCedula = /^\d{10}$/.test(valor);
    const esRuc    = /^\d{13}$/.test(valor);
    let coincidencias: Cliente[];

    if (esCedula || esRuc) {
      coincidencias = this.clientes.filter(c => c.cedula_ruc === valor);
    } else {
      const q = valor.toLowerCase();
      coincidencias = this.clientes.filter(c =>
        c.apellido.toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q) ||
        (c.nombre_negocio && c.nombre_negocio.toLowerCase().includes(q))
      );
    }

    if (coincidencias.length === 0) {
      this.clienteSeleccionado = null;
      this.errorCliente = 'Cliente no encontrado. Usa el botón + para registrarlo.';
    } else if (coincidencias.length === 1) {
      this.seleccionarCliente(coincidencias[0]);
    } else {
      this.clientesCoincidentes = coincidencias;
    }
  }

  seleccionarCliente(cliente: Cliente) {
    this.clienteSeleccionado = cliente;
    this.clientesCoincidentes = [];
    this.errorCliente = '';
    this.carritoGuardadoEnBD = false;
    this.cargarCarritoGuardado(cliente.id!);
  }

  // ── LIMPIAR CLIENTE ───────────────────────────────────────────────────────
  limpiarCliente() {
    if (this.carrito.length > 0 && !this.carritoGuardadoEnBD) {
      this.mostrarConfirmarLimpiar = true;
      return;
    }
    this._ejecutarLimpiarCliente();
  }

  confirmarLimpiarCliente() {
    this.mostrarConfirmarLimpiar = false;
    if (this.clienteSeleccionado) { this.carritoPendiente.eliminar(this.clienteSeleccionado.id!).subscribe(); }
    this._ejecutarLimpiarCliente();
  }

  cancelarLimpiarCliente() { this.mostrarConfirmarLimpiar = false; }

  private _ejecutarLimpiarCliente() {
    if (this.carritoGuardadoEnBD && this.carrito.length > 0 && this.clienteSeleccionado) {
      this.carritoPendiente.guardar({
        cliente_id: this.clienteSeleccionado.id!, items: this.carrito, iva_percent: this.ivaPercent,
        forma_pago: this.formaPago,
        monto_recibido: this.formaPago === 'Efectivo' ? this.montoRecibido : null,
        vuelto: this.formaPago === 'Efectivo' ? this.calcularVuelto() : null
      }).subscribe();
    }
    this.clienteSeleccionado = null;
    this.clientesCoincidentes = [];
    this.busquedaCliente = '';
    this.errorCliente = '';
    this.carrito = [];
    this.ivaPercent = 0;
    this.formaPago = 'Efectivo';
    this.montoRecibido = 0;
    this.carritoGuardadoEnBD = false;
    this.cargarProductos();
  }

  cargarCarritoGuardado(clienteId: number) {
    this.carritoPendiente.getByCliente(clienteId).subscribe({
      next: (data) => {
        if (data && data.items && data.items.length > 0) {
          this.carrito = data.items;
          this.ivaPercent = data.iva_percent ?? 0;
          this.formaPago = data.forma_pago ?? 'Efectivo';
          this.montoRecibido = data.monto_recibido ?? 0;
          this.carritoGuardadoEnBD = true;
          this.cargarProductos();
        } else {
          this.carrito = []; this.ivaPercent = 0; this.formaPago = 'Efectivo'; this.montoRecibido = 0;
          this.carritoGuardadoEnBD = false;
        }
      },
      error: () => { this.carrito = []; this.montoRecibido = 0; this.carritoGuardadoEnBD = false; }
    });
  }

  // ── AGREGAR CLIENTE ───────────────────────────────────────────────────────
  abrirAgregarCliente() { this.mostrarAgregarCliente = true; }

  cerrarAgregarCliente() {
    this.mostrarAgregarCliente = false;
    this.nuevoCliente = {
      cedula_ruc: '', nombre: '', apellido: '', negocio: '', email: '',
      direccion: '', sector: '', telefono: '', esParticular: false, esRuc: false
    };
    this.erroresCliente = {};
  }

  // ── CÉDULA / RUC ──────────────────────────────────────────────────────────
  // Solo permite números, máximo 10 dígitos (el 001 se agrega automáticamente al guardar)
  onCedulaChange(valor: string) {
    this.nuevoCliente.cedula_ruc = valor.replace(/\D/g, '').slice(0, 10);
  }

  toggleRuc() {
    this.nuevoCliente.esRuc = !this.nuevoCliente.esRuc;
    if (this.erroresCliente.cedula_ruc) this.erroresCliente.cedula_ruc = '';
  }

  // Devuelve el valor final a guardar: cédula sola o cédula + "001" si es RUC
  private getCedulaParaGuardar(): string {
    const cedula = this.nuevoCliente.cedula_ruc.trim();
    return this.nuevoCliente.esRuc ? `${cedula}001` : cedula;
  }

  guardarCliente() {
    this.erroresCliente = {};
    let valido = true;
    const cedula = this.nuevoCliente.cedula_ruc.trim();

    // La cédula base siempre debe ser exactamente 10 dígitos
    if (!cedula) { this.erroresCliente.cedula_ruc = 'La cédula es requerida'; valido = false; }
    else if (/[^0-9]/.test(cedula)) { this.erroresCliente.cedula_ruc = 'Solo números'; valido = false; }
    else if (cedula.length !== 10) { this.erroresCliente.cedula_ruc = 'Debe tener 10 dígitos'; valido = false; }

    if (!this.nuevoCliente.nombre.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.nombre))
      { this.erroresCliente.nombre = 'Nombre inválido'; valido = false; }
    if (!this.nuevoCliente.apellido.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.apellido))
      { this.erroresCliente.apellido = 'Apellido inválido'; valido = false; }
    if (!this.nuevoCliente.direccion.trim() || this.nuevoCliente.direccion.trim().length < 5)
      { this.erroresCliente.direccion = 'Dirección requerida (mín. 5 chars)'; valido = false; }
    const tel = this.nuevoCliente.telefono.trim();
    if (!tel) { this.erroresCliente.telefono = 'Requerido'; valido = false; }
    else if (/[^0-9]/.test(tel)) { this.erroresCliente.telefono = 'Solo números'; valido = false; }
    else if (tel.length !== 10 && tel.length !== 7) { this.erroresCliente.telefono = 'Celular (10) o fijo (7)'; valido = false; }
    if (this.nuevoCliente.email && !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(this.nuevoCliente.email))
      { this.erroresCliente.email = 'Email inválido'; valido = false; }
    if (!valido) return;

    const clientePayload: Cliente = {
      cedula_ruc: this.getCedulaParaGuardar(),  // ← cédula o RUC (13 dígitos)
      nombre: this.nuevoCliente.nombre.trim(),
      apellido: this.nuevoCliente.apellido.trim(),
      nombre_negocio: this.nuevoCliente.negocio.trim() || null,
      tipo_cliente: this.nuevoCliente.esParticular ? 'particular' : 'negocio',
      direccion: this.nuevoCliente.direccion.trim(),
      sector: this.nuevoCliente.sector.trim() || null,
      telefono: tel,
      email: this.nuevoCliente.email.trim() || null,
      limite_credito: 0,
      notas: null,
    };

    this.guardandoCliente = true;
    this.clienteService.create(clientePayload).subscribe({
      next: () => { this.guardandoCliente = false; this.cargarClientes(); this.cerrarAgregarCliente(); },
      error: (err: any) => { this.guardandoCliente = false; this.erroresCliente.general = err.status === 400 ? 'Datos inválidos' : 'Error al guardar'; }
    });
  }

  // ── PRODUCTO ──────────────────────────────────────────────────────────────
  async abrirProducto(producto: Producto) {
    if (!this.clienteSeleccionado) return;
    if ((producto.stock ?? 0) <= 0) {
      const toast = await this.toastCtrl.create({ message: 'Sin stock disponible', duration: 2000, position: 'bottom', color: 'danger' });
      await toast.present(); return;
    }
    this.productoSeleccionado = producto;
    this.itemProducto = { cantidad: 0, precio: +producto.precio_x_mayor, descuento: 0, subtotal: 0, tipoPrecio: 'mayor' };
    this.mostrarProducto = true;
  }

  seleccionarTipoPrecio(tipo: 'mayor' | 'menor') {
    this.itemProducto.tipoPrecio = tipo;
    this.itemProducto.precio = tipo === 'mayor' ? +this.productoSeleccionado!.precio_x_mayor : +this.productoSeleccionado!.precio_x_menor;
    this.calcularSubtotal();
  }

  onCantidadChange(valor: number) {
    const maxStock = this.productoSeleccionado?.stock ?? 0;
    this.itemProducto.cantidad = valor > maxStock ? maxStock : valor < 0 ? 0 : valor;
    this.calcularSubtotal();
  }

  incrementarCantidad() {
    if (this.itemProducto.cantidad < (this.productoSeleccionado?.stock ?? 0)) { this.itemProducto.cantidad++; this.calcularSubtotal(); }
  }
  decrementarCantidad() {
    if (this.itemProducto.cantidad > 0) { this.itemProducto.cantidad--; this.calcularSubtotal(); }
  }
  cerrarProducto() { this.mostrarProducto = false; }
  calcularSubtotal() {
    const base = this.itemProducto.cantidad * this.itemProducto.precio;
    this.itemProducto.subtotal = base - (base * this.itemProducto.descuento / 100);
  }

  agregarAlCarrito() {
    if (this.itemProducto.cantidad <= 0 || this.itemProducto.precio <= 0) return;
    this.carrito.push({
      producto_id: this.productoSeleccionado!.id, nombre: this.productoSeleccionado!.nombre,
      cantidad: this.itemProducto.cantidad, precio_unitario: this.itemProducto.precio,
      tipoPrecio: this.itemProducto.tipoPrecio, descuento: this.itemProducto.descuento, subtotal: this.itemProducto.subtotal
    });
    const idx = this.productos.findIndex(p => p.id === this.productoSeleccionado!.id);
    if (idx !== -1) this.productos[idx] = { ...this.productos[idx], stock: (this.productos[idx].stock ?? 0) - this.itemProducto.cantidad };
    this.carritoGuardadoEnBD = false;
    this.cerrarProducto();
  }

  // ── CARRITO ───────────────────────────────────────────────────────────────
  abrirCarrito() {
    this.puedesCerrarCarrito = () => new Promise(resolve => {
      const modalContent = document.querySelector('ion-modal .modal-content');
      if (!modalContent) { resolve(true); return; }
      (modalContent as any).getScrollElement().then((el: HTMLElement) => {
        resolve(el.scrollTop < 10);
      }).catch(() => resolve(true));
    });
    this.mostrarCarrito = true;
  }
  cerrarCarrito() { this.mostrarCarrito = false; this.montoRecibido = 0; }

  calcularTotal() {
    const subtotal = this.carrito.reduce((acc, i) => acc + i.subtotal, 0);
    const descuento = this.carrito.reduce((acc, i) => acc + (i.cantidad * i.precio_unitario * i.descuento / 100), 0);
    const iva = subtotal * (this.ivaPercent / 100);
    return { subtotal, descuento, iva, total: subtotal + iva };
  }

  calcularVuelto(): number { return Math.max(0, this.montoRecibido - this.calcularTotal().total); }

  async guardarPedido() {
    if (this.carrito.length === 0) return;
    if (!this.clienteSeleccionado) {
      const toast = await this.toastCtrl.create({ message: 'Selecciona un cliente primero', duration: 2000, position: 'bottom', color: 'warning' });
      await toast.present(); return;
    }
    this.guardandoCarrito = true;
    this.carritoPendiente.guardar({
      cliente_id: this.clienteSeleccionado.id!, items: this.carrito, iva_percent: this.ivaPercent,
      forma_pago: this.formaPago, monto_recibido: this.formaPago === 'Efectivo' ? this.montoRecibido : null,
      vuelto: this.formaPago === 'Efectivo' ? this.calcularVuelto() : null
    }).subscribe({
      next: async () => {
        this.guardandoCarrito = false; this.carritoGuardadoEnBD = true;
        const toast = await this.toastCtrl.create({ message: 'Carrito guardado ✓', duration: 2000, position: 'bottom', color: 'success' });
        await toast.present();
      },
      error: async () => {
        this.guardandoCarrito = false;
        const toast = await this.toastCtrl.create({ message: 'Error al guardar el carrito', duration: 2000, position: 'bottom', color: 'danger' });
        await toast.present();
      }
    });
  }

  eliminarDelCarrito(index: number) {
    const item = this.carrito[index];
    const idx = this.productos.findIndex(p => p.id === item.producto_id);
    if (idx !== -1) this.productos[idx] = { ...this.productos[idx], stock: (this.productos[idx].stock ?? 0) + item.cantidad };
    this.carrito.splice(index, 1);
    this.carritoGuardadoEnBD = false;
  }

  finalizarPedido() {
    if (this.carrito.length === 0) return;
    if (!this.clienteSeleccionado) {
      this.toastCtrl.create({ message: 'Selecciona un cliente primero', duration: 2000, position: 'bottom', color: 'warning' }).then(t => t.present());
      return;
    }
    const totales = this.calcularTotal();
    const tipoPagoMap: any = { 'Efectivo': 'efectivo', 'Transferencia': 'transferencia', 'Pendiente': 'credito', 'Cheques': 'cheques' };
    const payload = {
      cliente_id: this.clienteSeleccionado.id, subtotal: totales.subtotal, descuento: totales.descuento,
      total: totales.total, tipo_pago: tipoPagoMap[this.formaPago] || 'efectivo',
      monto_pagado: this.formaPago !== 'Pendiente' ? totales.total : 0,
      saldo_generado: this.formaPago === 'Pendiente' ? totales.total : 0,
      iva: totales.iva, notas: null,
      monto_recibido: this.formaPago === 'Efectivo' ? this.montoRecibido : null,
      vuelto: this.formaPago === 'Efectivo' ? this.calcularVuelto() : null,
      productos: this.carrito.map(item => ({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unitario: item.precio_unitario, descuento: item.descuento }))
    };
    this.ventasRutaService.create(payload).subscribe({
      next: (res: any) => {
        this.ultimoRecibo = {
          ventaId: res?.id,
          clienteNombre: `${this.clienteSeleccionado!.nombre} ${this.clienteSeleccionado!.apellido}`,
          clienteCedula: this.clienteSeleccionado!.cedula_ruc,
          clienteTelefono: this.clienteSeleccionado!.telefono || '-',
          clienteDireccion: this.clienteSeleccionado!.direccion || '-',
          vendedor: this.vendedorNombreCompleto,
          items: this.carrito.map(i => ({ nombre: i.nombre, cantidad: i.cantidad, precio_unitario: i.precio_unitario, descuento: i.descuento, subtotal: i.subtotal })),
          subtotal: totales.subtotal, descuento: totales.descuento, iva: totales.iva,
          ivaPercent: this.ivaPercent, total: totales.total, formaPago: this.formaPago,
          montoRecibido: this.montoRecibido || 0, vuelto: this.calcularVuelto()
        };
        this.carritoPendiente.eliminar(this.clienteSeleccionado!.id!).subscribe();
        this.carrito = []; this.clienteSeleccionado = null; this.busquedaCliente = '';
        this.montoRecibido = 0; this.carritoGuardadoEnBD = false;
        this.cerrarCarrito(); this.cargarProductos();
        this.estadoImpresion = 'preguntar'; this.errorImpresion = ''; this.mostrarModalImpresion = true;
      },
      error: (err) => { console.error('Error guardando pedido:', err); }
    });
  }

  // ── IMPRESIÓN ─────────────────────────────────────────────────────────────
  cerrarModalImpresion() { this.mostrarModalImpresion = false; this.serviciosDebug = ''; }
  async verServicios() { this.serviciosDebug = 'Cargando...'; this.serviciosDebug = await this.printerService.descubrirServicios(); }
  async imprimirRecibo() {
    if (!this.ultimoRecibo) return;
    this.imprimiendo = true;
    try { await this.printerService.imprimirRecibo(this.ultimoRecibo); this.estadoImpresion = 'impreso'; }
    catch (err: any) { this.estadoImpresion = 'error'; this.errorImpresion = err?.message || 'Error de conexión con la impresora'; }
    finally { this.imprimiendo = false; }
  }

  // ── BLUETOOTH ─────────────────────────────────────────────────────────────
  abrirConexionBT() { this.mostrarModalBT = true; this.escanearBT(); }
  cerrarConexionBT() { this.mostrarModalBT = false; }
  escanearBT() {
    this.escaneandoBT = true; this.dispositivosBT = [];
    this.printerService.escanearDispositivos()
      .then((devices: any[]) => { this.dispositivosBT = devices; })
      .catch(() => { this.dispositivosBT = []; })
      .finally(() => { this.escaneandoBT = false; });
  }
  conectarImpresora(dispositivo: any) {
    if (this.conectandoBT === dispositivo.address) return;
    this.conectandoBT = dispositivo.address;
    this.printerService.conectar(dispositivo.address, dispositivo.name)
      .then(() => {
        this.conectandoBT = ''; this.cerrarConexionBT();
        this.toastCtrl.create({ message: `✓ Conectado a ${dispositivo.name || dispositivo.address}`, duration: 2000, position: 'bottom', color: 'success' }).then(t => t.present());
      })
      .catch(() => {
        this.conectandoBT = '';
        this.toastCtrl.create({ message: 'Error al conectar. Verifica que la impresora esté encendida.', duration: 3000, position: 'bottom', color: 'danger' }).then(t => t.present());
      });
  }
}