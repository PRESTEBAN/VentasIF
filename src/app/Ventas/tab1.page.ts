import { Component, OnInit, OnDestroy, ViewChild, NgZone } from '@angular/core';
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
import { ToastController, IonModal } from '@ionic/angular';

const LS_PROD_ORDEN   = 'tab1_productos_orden';
const LS_PROD_OCULTOS = 'tab1_productos_ocultos';

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
    cedula_ruc: '', nombre: '', apellido: '', negocio: '',
    email: '', direccion: '', sector: '', telefono: '',
    esParticular: false, esRuc: false,
  };
  erroresCliente: any = {};
  guardandoCliente = false;

  mostrarProducto = false;
  productoSeleccionado: Producto | null = null;
  editandoCarritoIndex = -1;
  itemProducto = { cantidad: 0, precio: 0, descuento: 0, subtotal: 0, tipoPrecio: 'menor' };

  mostrarCarrito = false;
  puedesCerrarCarrito: boolean | (() => Promise<boolean>) = true;
  @ViewChild('modalCarrito') modalCarritoRef!: IonModal;
  carrito: any[] = [];
  formaPago = 'Efectivo';
  montoRecibido: number = 0;

  productos: Producto[] = [];
  productosVisibles: Producto[] = [];
  productosOcultosList: Producto[] = [];

  cargandoProductos = false;
  ivaPercent: number = 0;
  guardandoCarrito = false;
  carritoGuardadoEnBD = false;
  mostrarConfirmarLimpiar = false;

  // ── Modo gestión productos ────────────────────────────────────────────────
  modoGestionProductos = false;
  mostrarPanelOcultosProductos = false;
  productosOcultosSet  = new Set<number>();
  productosOrden: number[] = [];

  // ── Selección para intercambio (reemplaza drag & drop) ───────────────────
  seleccionadoProdIndex: number | null = null;

  private carritoSub!: Subscription;
  private socketSubs: Subscription[] = [];
  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;

  mostrarModalImpresion = false;
  estadoImpresion: 'preguntar' | 'impreso' | 'error' = 'preguntar';
  errorImpresion = '';
  imprimiendo = false;
  ultimoRecibo: any = null;
  serviciosDebug = '';

  mostrarModalBT = false;
  escaneandoBT = false;
  conectandoBT = '';
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
    private socketService: SocketService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.cargarClientes();
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.vendedorNombreCompleto = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || this.usuarioActual;
    this.carritoSub = this.carritoEstado.abrirCarrito.subscribe(() => { this.mostrarCarrito = true; });
    this.cargarPreferenciasProductos();
  }

  ionViewWillEnter() { this.cargarProductos(); this.cargarClientes(); this.iniciarPolling(); this.iniciarSocket(); }
  ionViewWillLeave() { this.detenerPolling(); this.detenerSocket(); }
  ngOnDestroy()      { if (this.carritoSub) this.carritoSub.unsubscribe(); this.detenerPolling(); this.detenerSocket(); }

  // ── LocalStorage preferencias productos ──────────────────────────────────
  cargarPreferenciasProductos() {
    try { const o = localStorage.getItem(LS_PROD_ORDEN);   if (o) this.productosOrden = JSON.parse(o); } catch {}
    try { const h = localStorage.getItem(LS_PROD_OCULTOS); if (h) this.productosOcultosSet = new Set(JSON.parse(h)); } catch {}
  }

  guardarPreferenciasProductos() {
    localStorage.setItem(LS_PROD_ORDEN,   JSON.stringify(this.productosOrden));
    localStorage.setItem(LS_PROD_OCULTOS, JSON.stringify([...this.productosOcultosSet]));
  }

  aplicarOrdenYVisibilidadProductos() {
    let ordenados: Producto[];
    if (this.productosOrden.length > 0) {
      const mapa = new Map(this.productos.map(p => [p.id!, p]));
      ordenados = [];
      this.productosOrden.forEach(id => { if (mapa.has(id)) { ordenados.push(mapa.get(id)!); mapa.delete(id); } });
      mapa.forEach(p => ordenados.push(p));
    } else {
      ordenados = [...this.productos];
    }
    this.productosVisibles    = ordenados.filter(p => !this.productosOcultosSet.has(p.id!));
    this.productosOcultosList = this.productos.filter(p => this.productosOcultosSet.has(p.id!));
  }

  // ── Modo gestión ──────────────────────────────────────────────────────────
  toggleModoGestionProductos() {
    this.modoGestionProductos = !this.modoGestionProductos;
    this.mostrarPanelOcultosProductos = false;
    this.seleccionadoProdIndex = null;
    if (!this.modoGestionProductos) this.guardarPreferenciasProductos();
  }

  ocultarProductoGestion(productoId: number) {
    this.productosOcultosSet.add(productoId);
    this.productosOcultosSet = new Set(this.productosOcultosSet);
    this.seleccionadoProdIndex = null;
    this.aplicarOrdenYVisibilidadProductos();
    this.guardarPreferenciasProductos();
  }

  restaurarProductoGestion(productoId: number) {
    this.productosOcultosSet.delete(productoId);
    this.productosOcultosSet = new Set(this.productosOcultosSet);
    this.aplicarOrdenYVisibilidadProductos();
    this.guardarPreferenciasProductos();
    if (this.productosOcultosSet.size === 0) this.mostrarPanelOcultosProductos = false;
  }

  get totalProductosOcultos(): number { return this.productosOcultosSet.size; }

  // ── Intercambio por tap ───────────────────────────────────────────────────
  onTapProductoGestion(index: number) {
    if (!this.modoGestionProductos) return;

    // Ninguno seleccionado → seleccionar
    if (this.seleccionadoProdIndex === null) {
      this.seleccionadoProdIndex = index;
      return;
    }

    // Mismo → deseleccionar
    if (this.seleccionadoProdIndex === index) {
      this.seleccionadoProdIndex = null;
      return;
    }

    // Otro → intercambiar
    const from = this.seleccionadoProdIndex;
    const to   = index;
    const arr  = [...this.productosVisibles];
    const temp = arr[from];
    arr[from]  = arr[to];
    arr[to]    = temp;

    this.productosVisibles = arr;
    this.productosOrden = [
      ...arr.map(p => p.id!),
      ...this.productosOcultosList.map(p => p.id!),
    ];
    this.guardarPreferenciasProductos();
    this.seleccionadoProdIndex = null;
  }

  cancelarSeleccionProd() { this.seleccionadoProdIndex = null; }

  // ── Polling / Socket ──────────────────────────────────────────────────────
  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.actualizarStockSilencioso(), this.POLLING_MS);
  }
  detenerPolling() { if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; } }

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
  detenerSocket() { this.socketSubs.forEach(s => s.unsubscribe()); this.socketSubs = []; }

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
        this.aplicarOrdenYVisibilidadProductos();
      },
      error: () => {},
    });
  }

  // ── Carga ─────────────────────────────────────────────────────────────────
  cargarProductos() {
    this.cargandoProductos = true;
    this.productoService.getAll().subscribe({
      next: (data: Producto[]) => {
        const norm = data.map(p => ({ ...p, precio_x_mayor: +p.precio_x_mayor, precio_x_menor: +p.precio_x_menor, stock: 0 }));
        this.inventarioService.getBodega().subscribe({
          next: (inventario) => {
            const conStock = norm.map(p => {
              const inv = inventario.find(i => i.producto_id === p.id);
              return { ...p, stock: inv ? inv.stock_actual : 0 };
            });
            this.productos = conStock.map(p => {
              const enCarrito = this.carrito.filter(item => item.producto_id === p.id).reduce((acc, item) => acc + item.cantidad, 0);
              return { ...p, stock: (p.stock ?? 0) - enCarrito };
            });
            this.aplicarOrdenYVisibilidadProductos();
            this.cargandoProductos = false;
          },
          error: () => { this.productos = norm; this.aplicarOrdenYVisibilidadProductos(); this.cargandoProductos = false; },
        });
      },
      error: () => { this.cargandoProductos = false; },
    });
  }

  cargarClientes() {
    this.clienteService.getAll().subscribe({
      next: (data: Cliente[]) => { this.clientes = data; },
      error: () => {},
    });
  }

  // ── Menu ──────────────────────────────────────────────────────────────────
  abrirMenu()     { this.menuAbierto = true; }
  cerrarMenu()    { this.menuAbierto = false; }
  cerrarSesion()  { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irACaja()       { this.cerrarMenu(); this.router.navigate(['/caja']); }
  irANotas()      { this.cerrarMenu(); this.router.navigate(['/notas']); }

  // ── Buscar cliente ────────────────────────────────────────────────────────
  buscarCliente() {
    const valor = this.busquedaCliente.trim();
    this.clientesCoincidentes = []; this.errorCliente = '';
    if (!valor || valor.length < 2) { this.errorCliente = 'Ingresa una cédula (10 dígitos) o apellido válido'; return; }
    const esCedula = /^\d{10}$/.test(valor);
    const esRuc    = /^\d{13}$/.test(valor);
    let coincidencias: Cliente[];
    if (esCedula || esRuc) {
      coincidencias = this.clientes.filter(c => c.cedula_ruc === valor);
    } else {
      const q = valor.toLowerCase();
      const iniciaPalabra = (t: string) => t.toLowerCase().split(/\s+/).some(p => p.startsWith(q));
      coincidencias = this.clientes.filter(c => iniciaPalabra(c.apellido) || iniciaPalabra(c.nombre) || (c.nombre_negocio && iniciaPalabra(c.nombre_negocio)));
    }
    if (coincidencias.length === 0) { this.clienteSeleccionado = null; this.errorCliente = 'Cliente no encontrado. Usa el botón + para registrarlo.'; }
    else if (coincidencias.length === 1) { this.seleccionarCliente(coincidencias[0]); }
    else { this.clientesCoincidentes = coincidencias; }
  }

  buscarClienteEnVivo(valor: string) {
    this.clientesCoincidentes = []; this.errorCliente = '';
    const v = (valor || '').trim();
    if (v.length < 1) return;
    const esCedula = /^\d{10}$/.test(v);
    const esRuc    = /^\d{13}$/.test(v);
    if (esCedula || esRuc) {
      const found = this.clientes.filter(c => c.cedula_ruc === v);
      if (found.length === 1) { this.seleccionarCliente(found[0]); return; }
      this.clientesCoincidentes = found; return;
    }
    const q = v.toLowerCase();
    const iniciaPalabra = (t: string) => t.toLowerCase().split(/\s+/).some(p => p.startsWith(q));
    this.clientesCoincidentes = this.clientes.filter(c => iniciaPalabra(c.apellido) || iniciaPalabra(c.nombre) || (c.nombre_negocio && iniciaPalabra(c.nombre_negocio)));
  }

  seleccionarCliente(cliente: Cliente) {
    this.clienteSeleccionado = cliente;
    this.clientesCoincidentes = []; this.errorCliente = '';
    this.carritoGuardadoEnBD = false;
    this.cargarCarritoGuardado(cliente.id!);
  }

  limpiarCliente() {
    if (this.carrito.length > 0 && !this.carritoGuardadoEnBD) { this.mostrarConfirmarLimpiar = true; return; }
    this._ejecutarLimpiarCliente();
  }
  confirmarLimpiarCliente() {
    this.mostrarConfirmarLimpiar = false;
    if (this.clienteSeleccionado) this.carritoPendiente.eliminar(this.clienteSeleccionado.id!).subscribe();
    this._ejecutarLimpiarCliente();
  }
  cancelarLimpiarCliente() { this.mostrarConfirmarLimpiar = false; }

  private _ejecutarLimpiarCliente() {
    if (this.carritoGuardadoEnBD && this.carrito.length > 0 && this.clienteSeleccionado) {
      this.carritoPendiente.guardar({ cliente_id: this.clienteSeleccionado.id!, items: this.carrito, iva_percent: this.ivaPercent, forma_pago: this.formaPago, monto_recibido: this.formaPago === 'Efectivo' ? this.montoRecibido : null, vuelto: this.formaPago === 'Efectivo' ? this.calcularVuelto() : null }).subscribe();
    }
    this.clienteSeleccionado = null; this.clientesCoincidentes = [];
    this.busquedaCliente = ''; this.errorCliente = '';
    this.carrito = []; this.ivaPercent = 0; this.formaPago = 'Efectivo';
    this.montoRecibido = 0; this.carritoGuardadoEnBD = false;
    this.cargarProductos();
  }

  cargarCarritoGuardado(clienteId: number) {
    this.carritoPendiente.getByCliente(clienteId).subscribe({
      next: (data) => {
        if (data?.items?.length > 0) {
          this.carrito = data.items; this.ivaPercent = data.iva_percent ?? 0;
          this.formaPago = data.forma_pago ?? 'Efectivo'; this.montoRecibido = data.monto_recibido ?? 0;
          this.carritoGuardadoEnBD = true; this.cargarProductos();
        } else {
          this.carrito = []; this.ivaPercent = 0; this.formaPago = 'Efectivo';
          this.montoRecibido = 0; this.carritoGuardadoEnBD = false;
        }
      },
      error: () => { this.carrito = []; this.montoRecibido = 0; this.carritoGuardadoEnBD = false; },
    });
  }

  // ── Agregar cliente ───────────────────────────────────────────────────────
  abrirAgregarCliente() { this.mostrarAgregarCliente = true; }
  cerrarAgregarCliente() {
    this.mostrarAgregarCliente = false;
    this.nuevoCliente = { cedula_ruc:'', nombre:'', apellido:'', negocio:'', email:'', direccion:'', sector:'', telefono:'', esParticular:false, esRuc:false };
    this.erroresCliente = {};
  }

  validarCedulaExistente() {
    const base = this.nuevoCliente.cedula_ruc.trim();
    if (base.length !== 10 || /[^0-9]/.test(base)) return;
    const cedula = this.nuevoCliente.esRuc ? `${base}001` : base;
    this.clienteService.verificarCedula(cedula).subscribe({
      next: (res: any) => { this.erroresCliente.cedula_ruc = res.existe ? 'Ya existe un cliente con esta cédula/RUC' : ''; },
      error: () => {},
    });
  }

  onCedulaChange(valor: string) {
    this.nuevoCliente.cedula_ruc = valor.replace(/\D/g, '').slice(0, 10);
    if (this.nuevoCliente.cedula_ruc.length < 10) this.erroresCliente.cedula_ruc = '';
  }

  toggleRuc() {
    this.nuevoCliente.esRuc = !this.nuevoCliente.esRuc;
    this.erroresCliente.cedula_ruc = '';
    if (this.nuevoCliente.cedula_ruc.length === 10) this.validarCedulaExistente();
  }

  private getCedulaParaGuardar(): string {
    const cedula = this.nuevoCliente.cedula_ruc.trim();
    return this.nuevoCliente.esRuc ? `${cedula}001` : cedula;
  }

  guardarCliente() {
    const errorPre = this.erroresCliente.cedula_ruc;
    this.erroresCliente = {};
    if (errorPre) this.erroresCliente.cedula_ruc = errorPre;
    let valido = true;
    const cedula = this.nuevoCliente.cedula_ruc.trim();
    if (!cedula) { this.erroresCliente.cedula_ruc = 'La cédula es requerida'; valido = false; }
    else if (/[^0-9]/.test(cedula)) { this.erroresCliente.cedula_ruc = 'Solo números'; valido = false; }
    else if (cedula.length !== 10) { this.erroresCliente.cedula_ruc = 'Debe tener 10 dígitos'; valido = false; }
    if (!this.nuevoCliente.nombre.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.nombre)) { this.erroresCliente.nombre = 'Nombre inválido'; valido = false; }
    if (!this.nuevoCliente.apellido.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.apellido)) { this.erroresCliente.apellido = 'Apellido inválido'; valido = false; }
    if (!this.nuevoCliente.direccion.trim() || this.nuevoCliente.direccion.trim().length < 5) { this.erroresCliente.direccion = 'Dirección requerida (mín. 5 chars)'; valido = false; }
    const tel = this.nuevoCliente.telefono.trim();
    if (!tel) { this.erroresCliente.telefono = 'Requerido'; valido = false; }
    else if (/[^0-9]/.test(tel)) { this.erroresCliente.telefono = 'Solo números'; valido = false; }
    else if (tel.length !== 10 && tel.length !== 7) { this.erroresCliente.telefono = 'Celular (10) o fijo (7)'; valido = false; }
    if (this.nuevoCliente.email && !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(this.nuevoCliente.email)) { this.erroresCliente.email = 'Email inválido'; valido = false; }
    if (!valido || this.erroresCliente.cedula_ruc) return;
    const payload: Cliente = {
      cedula_ruc: this.getCedulaParaGuardar(), nombre: this.nuevoCliente.nombre.trim(),
      apellido: this.nuevoCliente.apellido.trim(), nombre_negocio: this.nuevoCliente.negocio.trim() || null,
      tipo_cliente: this.nuevoCliente.esParticular ? 'particular' : 'negocio',
      direccion: this.nuevoCliente.direccion.trim(), sector: this.nuevoCliente.sector.trim() || null,
      telefono: tel, email: this.nuevoCliente.email.trim() || null, limite_credito: 0, notas: null,
    };
    this.guardandoCliente = true;
    this.clienteService.create(payload).subscribe({
      next: () => { this.guardandoCliente = false; this.cargarClientes(); this.cerrarAgregarCliente(); },
      error: (err: any) => { this.guardandoCliente = false; this.erroresCliente.general = err.error?.error || 'Error al guardar'; },
    });
  }

  // ── Producto tap en grid ──────────────────────────────────────────────────
  async abrirProducto(producto: Producto) {
    if (this.modoGestionProductos) return;
    if (!this.clienteSeleccionado) return;
    if ((producto.stock ?? 0) <= 0) {
      const toast = await this.toastCtrl.create({ message: 'Sin stock disponible', duration: 2000, position: 'bottom', color: 'danger' });
      await toast.present(); return;
    }
    const idx = this.carrito.findIndex(i => i.producto_id === producto.id);
    if (idx !== -1) { this.eliminarDelCarrito(idx); return; }
    const precio = +producto.precio_x_mayor;
    this.carrito.push({ producto_id: producto.id, nombre: producto.nombre, cantidad: 1, precio_unitario: precio, tipoPrecio: 'mayor', descuento: 0, subtotal: precio });
    const gridIdx = this.productosVisibles.findIndex(p => p.id === producto.id);
    if (gridIdx !== -1) this.productosVisibles[gridIdx] = { ...this.productosVisibles[gridIdx], stock: (this.productosVisibles[gridIdx].stock ?? 0) - 1 };
    const allIdx = this.productos.findIndex(p => p.id === producto.id);
    if (allIdx !== -1) this.productos[allIdx] = { ...this.productos[allIdx], stock: (this.productos[allIdx].stock ?? 0) - 1 };
    this.carritoGuardadoEnBD = false;
  }

  editarItemCarrito(item: any, index: number) {
    const producto = this.productosVisibles.find(p => p.id === item.producto_id)
                  || this.productos.find(p => p.id === item.producto_id);
    this.productoSeleccionado = producto
      ? { ...producto, stock: (producto.stock ?? 0) + item.cantidad }
      : { id: item.producto_id, nombre: item.nombre, precio_x_mayor: item.precio_unitario, precio_x_menor: item.precio_unitario, stock: item.cantidad, descripcion: '', categoria: '', activo: true } as any;
    this.itemProducto = { cantidad: item.cantidad, precio: item.precio_unitario, descuento: item.descuento, subtotal: item.subtotal, tipoPrecio: item.tipoPrecio || 'mayor' };
    this.editandoCarritoIndex = index;
    this.mostrarProducto = true;
  }

  estaEnCarrito(productoId: number): boolean { return this.carrito.some(i => i.producto_id === productoId); }

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

  cerrarProducto() { this.mostrarProducto = false; this.editandoCarritoIndex = -1; }
  calcularSubtotal() { const base = this.itemProducto.cantidad * this.itemProducto.precio; this.itemProducto.subtotal = base - (base * this.itemProducto.descuento) / 100; }

  agregarAlCarrito() {
    if (this.itemProducto.cantidad <= 0 || this.itemProducto.precio <= 0) return;
    if (this.editandoCarritoIndex >= 0) {
      const itemAnterior = this.carrito[this.editandoCarritoIndex];
      const gridIdx = this.productosVisibles.findIndex(p => p.id === itemAnterior.producto_id);
      if (gridIdx !== -1) this.productosVisibles[gridIdx] = { ...this.productosVisibles[gridIdx], stock: (this.productosVisibles[gridIdx].stock ?? 0) + itemAnterior.cantidad - this.itemProducto.cantidad };
      const allIdx = this.productos.findIndex(p => p.id === itemAnterior.producto_id);
      if (allIdx !== -1) this.productos[allIdx] = { ...this.productos[allIdx], stock: (this.productos[allIdx].stock ?? 0) + itemAnterior.cantidad - this.itemProducto.cantidad };
      this.carrito[this.editandoCarritoIndex] = { ...itemAnterior, cantidad: this.itemProducto.cantidad, precio_unitario: this.itemProducto.precio, tipoPrecio: this.itemProducto.tipoPrecio, descuento: this.itemProducto.descuento, subtotal: this.itemProducto.subtotal };
      this.editandoCarritoIndex = -1;
    } else {
      this.carrito.push({ producto_id: this.productoSeleccionado!.id, nombre: this.productoSeleccionado!.nombre, cantidad: this.itemProducto.cantidad, precio_unitario: this.itemProducto.precio, tipoPrecio: this.itemProducto.tipoPrecio, descuento: this.itemProducto.descuento, subtotal: this.itemProducto.subtotal });
      const idx = this.productosVisibles.findIndex(p => p.id === this.productoSeleccionado!.id);
      if (idx !== -1) this.productosVisibles[idx] = { ...this.productosVisibles[idx], stock: (this.productosVisibles[idx].stock ?? 0) - this.itemProducto.cantidad };
      const allIdx = this.productos.findIndex(p => p.id === this.productoSeleccionado!.id);
      if (allIdx !== -1) this.productos[allIdx] = { ...this.productos[allIdx], stock: (this.productos[allIdx].stock ?? 0) - this.itemProducto.cantidad };
    }
    this.carritoGuardadoEnBD = false;
    this.cerrarProducto();
  }

  // ── Carrito ───────────────────────────────────────────────────────────────
  abrirCarrito() {
    this.puedesCerrarCarrito = () => new Promise(resolve => {
      const mc = document.querySelector('ion-modal .modal-content');
      if (!mc) { resolve(true); return; }
      (mc as any).getScrollElement().then((el: HTMLElement) => resolve(el.scrollTop < 10)).catch(() => resolve(true));
    });
    this.mostrarCarrito = true;
  }

  cerrarCarrito() { this.mostrarCarrito = false; this.montoRecibido = 0; }

  forzarCerrarCarrito() {
    this.puedesCerrarCarrito = true;
    if (this.modalCarritoRef) {
      this.modalCarritoRef.dismiss().then(() => { this.mostrarCarrito = false; this.montoRecibido = 0; }).catch(() => { this.mostrarCarrito = false; this.montoRecibido = 0; });
    } else { this.mostrarCarrito = false; this.montoRecibido = 0; }
  }

  calcularTotal() {
    const subtotal  = this.carrito.reduce((acc, i) => acc + i.subtotal, 0);
    const descuento = this.carrito.reduce((acc, i) => acc + (i.cantidad * i.precio_unitario * i.descuento) / 100, 0);
    const iva       = subtotal * (this.ivaPercent / 100);
    return { subtotal, descuento, iva, total: subtotal + iva };
  }

  calcularVuelto(): number { return Math.max(0, this.montoRecibido - this.calcularTotal().total); }

  async guardarPedido() {
    if (!this.carrito.length) return;
    if (!this.clienteSeleccionado) { const t = await this.toastCtrl.create({ message: 'Selecciona un cliente primero', duration: 2000, position: 'bottom', color: 'warning' }); await t.present(); return; }
    this.guardandoCarrito = true;
    this.carritoPendiente.guardar({ cliente_id: this.clienteSeleccionado.id!, items: this.carrito, iva_percent: this.ivaPercent, forma_pago: this.formaPago, monto_recibido: this.formaPago === 'Efectivo' ? this.montoRecibido : null, vuelto: this.formaPago === 'Efectivo' ? this.calcularVuelto() : null }).subscribe({
      next: async () => { this.guardandoCarrito = false; this.carritoGuardadoEnBD = true; const t = await this.toastCtrl.create({ message: 'Carrito guardado ✓', duration: 2000, position: 'bottom', color: 'success' }); await t.present(); },
      error: async () => { this.guardandoCarrito = false; const t = await this.toastCtrl.create({ message: 'Error al guardar el carrito', duration: 2000, position: 'bottom', color: 'danger' }); await t.present(); },
    });
  }

  eliminarDelCarrito(index: number) {
    const item = this.carrito[index];
    const visIdx = this.productosVisibles.findIndex(p => p.id === item.producto_id);
    if (visIdx !== -1) this.productosVisibles[visIdx] = { ...this.productosVisibles[visIdx], stock: (this.productosVisibles[visIdx].stock ?? 0) + item.cantidad };
    const allIdx = this.productos.findIndex(p => p.id === item.producto_id);
    if (allIdx !== -1) this.productos[allIdx] = { ...this.productos[allIdx], stock: (this.productos[allIdx].stock ?? 0) + item.cantidad };
    this.carrito.splice(index, 1);
    this.carritoGuardadoEnBD = false;
  }

  finalizarPedido() {
    if (!this.carrito.length) return;
    if (!this.clienteSeleccionado) { this.toastCtrl.create({ message: 'Selecciona un cliente primero', duration: 2000, position: 'bottom', color: 'warning' }).then(t => t.present()); return; }
    const totales = this.calcularTotal();
    const tipoPagoMap: any = { Efectivo: 'efectivo', Transferencia: 'transferencia', Pendiente: 'credito', Cheques: 'cheques' };
    const payload = {
      cliente_id: this.clienteSeleccionado.id,
      subtotal: totales.subtotal, descuento: totales.descuento, total: totales.total,
      tipo_pago: tipoPagoMap[this.formaPago] || 'efectivo',
      monto_pagado: this.formaPago !== 'Pendiente' ? totales.total : 0,
      saldo_generado: this.formaPago === 'Pendiente' ? totales.total : 0,
      iva: totales.iva, notas: null,
      monto_recibido: this.formaPago === 'Efectivo' ? this.montoRecibido : null,
      vuelto: this.formaPago === 'Efectivo' ? this.calcularVuelto() : null,
      productos: this.carrito.map(item => ({ producto_id: item.producto_id, cantidad: item.cantidad, precio_unitario: item.precio_unitario, descuento: item.descuento })),
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
          subtotal: totales.subtotal, descuento: totales.descuento, iva: totales.iva, ivaPercent: this.ivaPercent,
          total: totales.total, formaPago: this.formaPago, montoRecibido: this.montoRecibido || 0, vuelto: this.calcularVuelto(),
        };
        this.carritoPendiente.eliminar(this.clienteSeleccionado!.id!).subscribe();
        this.carrito = []; this.clienteSeleccionado = null; this.busquedaCliente = '';
        this.montoRecibido = 0; this.carritoGuardadoEnBD = false;
        this.cerrarCarrito(); this.cargarProductos();
        this.estadoImpresion = 'preguntar'; this.errorImpresion = ''; this.mostrarModalImpresion = true;
      },
      error: (err) => {
        const msg = err?.error?.error || err?.message || 'Error al guardar el pedido';
        const esCierre = msg.toLowerCase().includes('cierre');
        this.toastCtrl.create({ message: esCierre ? '⚠️ No hay caja abierta. Abre un cierre en la pestaña Caja antes de vender.' : `Error: ${msg}`, duration: 4000, position: 'bottom', color: 'danger' }).then(t => t.present());
      },
    });
  }

  // ── Impresión ─────────────────────────────────────────────────────────────
  cerrarModalImpresion() { this.mostrarModalImpresion = false; this.serviciosDebug = ''; }
  async verServicios()   { this.serviciosDebug = 'Cargando...'; this.serviciosDebug = await this.printerService.descubrirServicios(); }

  async imprimirRecibo() {
    if (!this.ultimoRecibo) return;
    this.imprimiendo = true;
    try { await this.printerService.imprimirRecibo(this.ultimoRecibo); this.estadoImpresion = 'impreso'; }
    catch (err: any) { this.estadoImpresion = 'error'; this.errorImpresion = err?.message || 'Error de conexión'; }
    finally { this.imprimiendo = false; }
  }

  // ── Bluetooth ─────────────────────────────────────────────────────────────
  abrirConexionBT() { this.mostrarModalBT = true; this.escanearBT(); }
  cerrarConexionBT() { this.mostrarModalBT = false; }

  escanearBT() {
    this.escaneandoBT = true; this.dispositivosBT = [];
    this.printerService.escanearDispositivos().then((d: any[]) => { this.dispositivosBT = d; }).catch(() => { this.dispositivosBT = []; }).finally(() => { this.escaneandoBT = false; });
  }

  conectarImpresora(dispositivo: any) {
    if (this.conectandoBT === dispositivo.address) return;
    this.conectandoBT = dispositivo.address;
    this.printerService.conectar(dispositivo.address, dispositivo.name)
      .then(() => { this.conectandoBT = ''; this.cerrarConexionBT(); this.toastCtrl.create({ message: `✓ Conectado a ${dispositivo.name || dispositivo.address}`, duration: 2000, position: 'bottom', color: 'success' }).then(t => t.present()); })
      .catch(() => { this.conectandoBT = ''; this.toastCtrl.create({ message: 'Error al conectar. Verifica que la impresora esté encendida.', duration: 3000, position: 'bottom', color: 'danger' }).then(t => t.present()); });
  }
}