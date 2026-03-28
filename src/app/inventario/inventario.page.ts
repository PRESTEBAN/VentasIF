import { Component, OnInit, OnDestroy, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { InventarioService, ItemInventario } from '../services/inventario';
import { AuthService } from '../services/auth';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';

const LS_ORDEN   = 'inv_orden_bodega';
const LS_OCULTOS = 'inv_ocultos_bodega';

@Component({
  selector: 'app-inventario',
  templateUrl: 'inventario.page.html',
  styleUrls: ['inventario.page.scss'],
  standalone: false,
})
export class InventarioPage implements OnInit, OnDestroy {

  menuAbierto   = false;
  usuarioActual = '';

  tabActivo: 'inventario' | 'productos' = 'inventario';

  items: ItemInventario[]         = [];
  itemsVisibles: ItemInventario[] = [];
  itemsOcultos: ItemInventario[]  = [];

  cargando = false;

  modoIngreso      = false;
  guardandoIngreso = false;
  mensajeIngreso   = '';

  modoEditarPrecios  = false;
  guardandoPrecios   = false;
  editPrecios: { [id: number]: { mayor: number; menor: number } } = {};

  mostrarNuevoProducto = false;
  nuevoProducto = {
    codigo: '', nombre: '', descripcion: '', categoria: '',
    peso_gramos: null as number | null, unidad_medida: 'unidad',
    precio_x_mayor: null as number | null, precio_x_menor: null as number | null,
    stock_inicial: null as number | null,
  };
  erroresNuevo: any = {};
  guardandoNuevo = false;

  mostrarConfirmarVaciar = false;
  vaciandoInventario     = false;

  // ── Modo gestión ──────────────────────────────────────────────────────────
  modoGestion    = false;
  mostrarOcultos = false;
  ocultos        = new Set<number>();
  ordenPersonalizado: number[] = [];

  // ── Selección para intercambio ────────────────────────────────────────────
  /** índice del item seleccionado para intercambiar (null = ninguno) */
  seleccionadoIndex: number | null = null;

  private pollingInterval: any = null;
  private readonly POLLING_MS  = 20000;
  private socketSubs: Subscription[] = [];

  constructor(
    public router: Router,
    private inventarioService: InventarioService,
    private authService: AuthService,
    private socketService: SocketService,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.cargarPreferencias();
    this.cargarInventario();
  }

  ionViewWillEnter() { this.cargarInventario(); this.iniciarPolling(); this.iniciarSocket(); }
  ionViewWillLeave() { this.detenerPolling(); this.detenerSocket(); }
  ngOnDestroy()      { this.detenerPolling(); this.detenerSocket(); }

  // ── LocalStorage ──────────────────────────────────────────────────────────
  cargarPreferencias() {
    try { const o = localStorage.getItem(LS_ORDEN);   if (o) this.ordenPersonalizado = JSON.parse(o); } catch {}
    try { const h = localStorage.getItem(LS_OCULTOS); if (h) this.ocultos = new Set(JSON.parse(h)); } catch {}
  }

  guardarPreferencias() {
    localStorage.setItem(LS_ORDEN,   JSON.stringify(this.ordenPersonalizado));
    localStorage.setItem(LS_OCULTOS, JSON.stringify([...this.ocultos]));
  }

  // ── Construir listas ──────────────────────────────────────────────────────
  aplicarOrdenYVisibilidad() {
    let ordenados: ItemInventario[];
    if (this.ordenPersonalizado.length > 0) {
      const mapa = new Map(this.items.map(i => [i.producto_id, i]));
      ordenados = [];
      this.ordenPersonalizado.forEach(id => { if (mapa.has(id)) { ordenados.push(mapa.get(id)!); mapa.delete(id); } });
      mapa.forEach(i => ordenados.push(i));
    } else {
      ordenados = [...this.items];
    }
    this.itemsVisibles = ordenados.filter(i => !this.ocultos.has(i.producto_id));
    this.itemsOcultos  = this.items.filter(i => this.ocultos.has(i.producto_id));
  }

  // ── Modo gestión ──────────────────────────────────────────────────────────
  toggleModoGestion() {
    this.modoGestion = !this.modoGestion;
    this.mostrarOcultos = false;
    this.seleccionadoIndex = null;
    if (!this.modoGestion) this.guardarPreferencias();
  }

  ocultarProducto(productoId: number) {
    this.ocultos.add(productoId);
    this.ocultos = new Set(this.ocultos);
    this.seleccionadoIndex = null;
    this.aplicarOrdenYVisibilidad();
    this.guardarPreferencias();
  }

  restaurarProducto(productoId: number) {
    this.ocultos.delete(productoId);
    this.ocultos = new Set(this.ocultos);
    this.aplicarOrdenYVisibilidad();
    this.guardarPreferencias();
    if (this.ocultos.size === 0) this.mostrarOcultos = false;
  }

  get totalOcultos(): number { return this.ocultos.size; }

  // ── Lógica de intercambio por tap ─────────────────────────────────────────
  onTapProducto(index: number) {
    if (!this.modoGestion) return;

    // Ninguno seleccionado → seleccionar este
    if (this.seleccionadoIndex === null) {
      this.seleccionadoIndex = index;
      return;
    }

    // Tap en el mismo → deseleccionar
    if (this.seleccionadoIndex === index) {
      this.seleccionadoIndex = null;
      return;
    }

    // Tap en otro → intercambiar posiciones
    const from = this.seleccionadoIndex;
    const to   = index;

    const arr = [...this.itemsVisibles];
    const temp = arr[from];
    arr[from] = arr[to];
    arr[to]   = temp;

    this.itemsVisibles = arr;

    // Actualizar orden completo
    this.ordenPersonalizado = [
      ...arr.map(i => i.producto_id),
      ...this.itemsOcultos.map(i => i.producto_id),
    ];
    this.guardarPreferencias();
    this.seleccionadoIndex = null;
  }

  cancelarSeleccion() {
    this.seleccionadoIndex = null;
  }

  // ── Polling / Socket ──────────────────────────────────────────────────────
  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.actualizarSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();
    const sub = this.socketService.on<any>('inventario_actualizado').subscribe(data => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (this.modoIngreso || this.modoEditarPrecios || this.modoGestion) return;
      if (data?.producto_id && data?.stock_actual !== undefined) {
        const idx = this.items.findIndex(i => i.producto_id === data.producto_id);
        if (idx >= 0) { this.items[idx] = { ...this.items[idx], stock_actual: data.stock_actual }; this.aplicarOrdenYVisibilidad(); return; }
      }
      this.actualizarSilencioso();
    });
    this.socketSubs = [sub];
  }

  detenerSocket() { this.socketSubs.forEach(s => s.unsubscribe()); this.socketSubs = []; }

  actualizarSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    if (this.modoIngreso || this.modoEditarPrecios || this.modoGestion) return;
    this.inventarioService.getBodega().subscribe({
      next: (data) => { this.items = data.map(i => ({ ...i, ingreso: null })); this.inicializarPrecios(); this.aplicarOrdenYVisibilidad(); },
      error: () => {}
    });
  }

  cargarInventario() {
    this.cargando = true;
    this.inventarioService.getBodega().subscribe({
      next: (data) => {
        this.items = data.map(i => ({ ...i, ingreso: null }));
        this.inicializarPrecios();
        this.aplicarOrdenYVisibilidad();
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  inicializarPrecios() {
    this.editPrecios = {};
    this.items.forEach(i => { this.editPrecios[i.producto_id] = { mayor: i.precio_x_mayor, menor: i.precio_x_menor }; });
  }

  cambiarTab(tab: 'inventario' | 'productos') {
    this.tabActivo = tab;
    this.modoIngreso = false; this.modoEditarPrecios = false;
    this.modoGestion = false; this.mensajeIngreso = '';
    this.seleccionadoIndex = null;
  }

  // ── Ingreso stock ─────────────────────────────────────────────────────────
  activarIngreso()  { this.modoIngreso = true; this.mensajeIngreso = ''; this.items = this.items.map(i => ({ ...i, ingreso: null })); this.aplicarOrdenYVisibilidad(); }
  cancelarIngreso() { this.modoIngreso = false; this.items = this.items.map(i => ({ ...i, ingreso: null })); this.aplicarOrdenYVisibilidad(); }
  incrementar(item: ItemInventario) { item.ingreso = (item.ingreso || 0) + 1; }
  decrementar(item: ItemInventario) { item.ingreso = (item.ingreso || 0) - 1; }

  guardarIngresos() {
    const conCambio = this.itemsVisibles.filter(i => i.ingreso !== null && i.ingreso !== 0);
    if (!conCambio.length) { this.mensajeIngreso = 'No hay cambios para guardar'; return; }
    this.guardandoIngreso = true; this.mensajeIngreso = '';
    let pendientes = conCambio.length; let errores = 0;
    conCambio.forEach(item => {
      const cantidad = Math.abs(item.ingreso!);
      const tipo = item.ingreso! > 0 ? 'entrada' : 'salida';
      this.inventarioService.registrarMovimiento(item.producto_id, cantidad, tipo).subscribe({
        next: (res: any) => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) { this.items[idx].stock_actual = res.stock_actual; this.items[idx].ingreso = null; }
          pendientes--;
          if (pendientes === 0) { this.guardandoIngreso = false; this.modoIngreso = false; this.aplicarOrdenYVisibilidad(); }
        },
        error: () => { errores++; pendientes--; if (pendientes === 0) { this.guardandoIngreso = false; this.mensajeIngreso = `${errores} error(es)`; } }
      });
    });
  }

  // ── Precios ───────────────────────────────────────────────────────────────
  activarEditarPrecios()  { this.modoEditarPrecios = true; this.inicializarPrecios(); }
  cancelarEditarPrecios() { this.modoEditarPrecios = false; this.inicializarPrecios(); }

  guardarPrecios() {
    const cambios = this.items.filter(i => { const e = this.editPrecios[i.producto_id]; return e && (e.mayor !== i.precio_x_mayor || e.menor !== i.precio_x_menor); });
    if (!cambios.length) { this.modoEditarPrecios = false; return; }
    this.guardandoPrecios = true;
    let pendientes = cambios.length;
    cambios.forEach(item => {
      const e = this.editPrecios[item.producto_id];
      this.inventarioService.actualizarPrecios(item.producto_id, e.mayor, e.menor).subscribe({
        next: () => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) { this.items[idx].precio_x_mayor = e.mayor; this.items[idx].precio_x_menor = e.menor; }
          pendientes--; if (pendientes === 0) { this.guardandoPrecios = false; this.modoEditarPrecios = false; }
        },
        error: () => { pendientes--; if (pendientes === 0) this.guardandoPrecios = false; }
      });
    });
  }

  // ── Nuevo producto ────────────────────────────────────────────────────────
  abrirNuevoProducto() {
    this.nuevoProducto = { codigo:'', nombre:'', descripcion:'', categoria:'', peso_gramos:null, unidad_medida:'unidad', precio_x_mayor:null, precio_x_menor:null, stock_inicial:null };
    this.erroresNuevo = {}; this.mostrarNuevoProducto = true;
  }
  cerrarNuevoProducto() { this.mostrarNuevoProducto = false; this.erroresNuevo = {}; }

  guardarNuevoProducto() {
    this.erroresNuevo = {}; let valido = true;
    if (!this.nuevoProducto.codigo.trim())  { this.erroresNuevo.codigo = 'Código requerido'; valido = false; }
    if (!this.nuevoProducto.nombre.trim())  { this.erroresNuevo.nombre = 'Nombre requerido'; valido = false; }
    if (!this.nuevoProducto.precio_x_mayor || this.nuevoProducto.precio_x_mayor <= 0) { this.erroresNuevo.precio_x_mayor = 'Requerido'; valido = false; }
    if (!this.nuevoProducto.precio_x_menor || this.nuevoProducto.precio_x_menor <= 0) { this.erroresNuevo.precio_x_menor = 'Requerido'; valido = false; }
    if (!valido) return;
    this.guardandoNuevo = true;
    this.inventarioService.crearProducto({ ...this.nuevoProducto, stock_inicial: this.nuevoProducto.stock_inicial || 0 }).subscribe({
      next: () => { this.guardandoNuevo = false; this.cerrarNuevoProducto(); this.cargarInventario(); },
      error: (err: any) => { this.guardandoNuevo = false; this.erroresNuevo.general = err.error?.error || 'Error al guardar'; }
    });
  }

  // ── Vaciar inventario ─────────────────────────────────────────────────────
  confirmarVaciar() { this.mostrarConfirmarVaciar = true; }
  cancelarVaciar()  { this.mostrarConfirmarVaciar = false; }

  vaciarInventario() {
    const conStock = this.items.filter(i => i.stock_actual > 0);
    if (!conStock.length) { this.mostrarConfirmarVaciar = false; return; }
    this.vaciandoInventario = true;
    let pendientes = conStock.length; let errores = 0;
    conStock.forEach(item => {
      this.inventarioService.registrarMovimiento(item.producto_id, item.stock_actual, 'salida').subscribe({
        next: (res: any) => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) this.items[idx].stock_actual = res.stock_actual ?? 0;
          pendientes--;
          if (pendientes === 0) { this.vaciandoInventario = false; this.mostrarConfirmarVaciar = false; this.aplicarOrdenYVisibilidad(); if (errores > 0) this.mensajeIngreso = `${errores} error(es) al vaciar`; }
        },
        error: () => { errores++; pendientes--; if (pendientes === 0) { this.vaciandoInventario = false; this.mostrarConfirmarVaciar = false; this.mensajeIngreso = `${errores} error(es)`; } }
      });
    });
  }

  abrirMenu()    { this.menuAbierto = true; }
  cerrarMenu()   { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.router.navigate(['/login']); }
}