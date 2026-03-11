import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { InventarioService, ItemInventario } from '../services/inventario';
import { AuthService } from '../services/auth';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-inventario',
  templateUrl: 'inventario.page.html',
  styleUrls: ['inventario.page.scss'],
  standalone: false,
})
export class InventarioPage implements OnInit, OnDestroy {

  menuAbierto = false;
  usuarioActual = '';

  tabActivo: 'inventario' | 'productos' = 'inventario';

  items: ItemInventario[] = [];
  cargando = false;

  modoIngreso = false;
  guardandoIngreso = false;
  mensajeIngreso = '';
 
  modoEditarPrecios = false;
  guardandoPrecios = false;
  editPrecios: { [producto_id: number]: { mayor: number; menor: number } } = {};

  mostrarNuevoProducto = false;
  nuevoProducto = {
    codigo: '', nombre: '', descripcion: '', categoria: '',
    peso_gramos: null as number | null,
    unidad_medida: 'unidad',
    precio_x_mayor: null as number | null,
    precio_x_menor: null as number | null,
    stock_inicial: null as number | null, 
  };
  erroresNuevo: any = {};
  guardandoNuevo = false;

  mostrarConfirmarVaciar = false;
  vaciandoInventario = false;

  private pollingInterval: any = null;
  private readonly POLLING_MS = 20000;
  private socketSubs: Subscription[] = [];

  constructor(
    public router: Router,
    private inventarioService: InventarioService,
    private authService: AuthService,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.cargarInventario();
  }

  ionViewWillEnter() {
    this.cargarInventario();
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
    const invSub = this.socketService.on<{ accion?: string; producto_id?: number; stock_actual?: number }>('inventario_actualizado').subscribe((data) => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (this.modoIngreso || this.modoEditarPrecios) return;
      if (data?.producto_id && data?.stock_actual !== undefined) {
        const idx = this.items.findIndex(i => i.producto_id === data.producto_id);
        if (idx >= 0) { this.items[idx] = { ...this.items[idx], stock_actual: data.stock_actual }; return; }
      }
      this.actualizarSilencioso();
    });
    this.socketSubs = [invSub];
  }

  detenerSocket() {
    this.socketSubs.forEach(s => s.unsubscribe());
    this.socketSubs = [];
  }

  actualizarSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    if (this.modoIngreso || this.modoEditarPrecios) return;
    this.inventarioService.getBodega().subscribe({
      next: (data: ItemInventario[]) => { this.items = data.map(i => ({ ...i, ingreso: null })); this.inicializarPrecios(); },
      error: () => {}
    });
  }

  cargarInventario() {
    this.cargando = true;
    this.inventarioService.getBodega().subscribe({
      next: (data: ItemInventario[]) => {
        this.items = data.map(i => ({ ...i, ingreso: null }));
        this.inicializarPrecios();
        this.cargando = false;
      },
      error: () => { this.cargando = false; }
    });
  }

  inicializarPrecios() {
    this.editPrecios = {};
    this.items.forEach(i => {
      this.editPrecios[i.producto_id] = { mayor: i.precio_x_mayor, menor: i.precio_x_menor };
    });
  }

  cambiarTab(tab: 'inventario' | 'productos') {
    this.tabActivo = tab;
    this.modoIngreso = false;
    this.modoEditarPrecios = false;
    this.mensajeIngreso = '';
  }

  activarIngreso() { this.modoIngreso = true; this.mensajeIngreso = ''; this.items = this.items.map(i => ({ ...i, ingreso: null })); }
  cancelarIngreso() { this.modoIngreso = false; this.items = this.items.map(i => ({ ...i, ingreso: null })); }

  incrementar(item: ItemInventario) { item.ingreso = (item.ingreso || 0) + 1; }
  decrementar(item: ItemInventario) { item.ingreso = (item.ingreso || 0) - 1; }

  guardarIngresos() {
    const conCambio = this.items.filter(i => i.ingreso !== null && i.ingreso !== 0);
    if (conCambio.length === 0) { this.mensajeIngreso = 'No hay cambios para guardar'; return; }
    this.guardandoIngreso = true;
    this.mensajeIngreso = '';
    let pendientes = conCambio.length;
    let errores = 0;
    conCambio.forEach(item => {
      const cantidad = Math.abs(item.ingreso!);
      const tipo = item.ingreso! > 0 ? 'entrada' : 'salida';
      this.inventarioService.registrarMovimiento(item.producto_id, cantidad, tipo).subscribe({
        next: (res: any) => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) { this.items[idx].stock_actual = res.stock_actual; this.items[idx].ingreso = null; }
          pendientes--;
          if (pendientes === 0) { this.guardandoIngreso = false; this.modoIngreso = false; this.mensajeIngreso = errores > 0 ? `${errores} error(es)` : ''; }
        },
        error: () => {
          errores++; pendientes--;
          if (pendientes === 0) { this.guardandoIngreso = false; this.mensajeIngreso = `${errores} error(es) al guardar`; }
        }
      });
    });
  }

  activarEditarPrecios() { this.modoEditarPrecios = true; this.inicializarPrecios(); }
  cancelarEditarPrecios() { this.modoEditarPrecios = false; this.inicializarPrecios(); }

  guardarPrecios() {
    const cambios = this.items.filter(i => {
      const e = this.editPrecios[i.producto_id];
      return e && (e.mayor !== i.precio_x_mayor || e.menor !== i.precio_x_menor);
    });
    if (cambios.length === 0) { this.modoEditarPrecios = false; return; }
    this.guardandoPrecios = true;
    let pendientes = cambios.length;
    cambios.forEach(item => {
      const e = this.editPrecios[item.producto_id];
      this.inventarioService.actualizarPrecios(item.producto_id, e.mayor, e.menor).subscribe({
        next: () => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) { this.items[idx].precio_x_mayor = e.mayor; this.items[idx].precio_x_menor = e.menor; }
          pendientes--;
          if (pendientes === 0) { this.guardandoPrecios = false; this.modoEditarPrecios = false; }
        },
        error: () => { pendientes--; if (pendientes === 0) { this.guardandoPrecios = false; } }
      });
    });
  }

  abrirNuevoProducto() {
    this.nuevoProducto = { codigo: '', nombre: '', descripcion: '', categoria: '', peso_gramos: null, unidad_medida: 'unidad', precio_x_mayor: null, precio_x_menor: null, stock_inicial: null };
    this.erroresNuevo = {};
    this.mostrarNuevoProducto = true;
  }

  cerrarNuevoProducto() { this.mostrarNuevoProducto = false; this.erroresNuevo = {}; }

  guardarNuevoProducto() {
    this.erroresNuevo = {};
    let valido = true;
    if (!this.nuevoProducto.codigo.trim())  { this.erroresNuevo.codigo = 'Código requerido'; valido = false; }
    if (!this.nuevoProducto.nombre.trim())  { this.erroresNuevo.nombre = 'Nombre requerido'; valido = false; }
    if (!this.nuevoProducto.precio_x_mayor || this.nuevoProducto.precio_x_mayor <= 0)
      { this.erroresNuevo.precio_x_mayor = 'Precio mayor requerido'; valido = false; }
    if (!this.nuevoProducto.precio_x_menor || this.nuevoProducto.precio_x_menor <= 0)
      { this.erroresNuevo.precio_x_menor = 'Precio menor requerido'; valido = false; }
    if (!valido) return;
    this.guardandoNuevo = true;
    this.inventarioService.crearProducto({ ...this.nuevoProducto, stock_inicial: this.nuevoProducto.stock_inicial || 0 }).subscribe({
      next: () => { this.guardandoNuevo = false; this.cerrarNuevoProducto(); this.cargarInventario(); },
      error: (err: any) => { this.guardandoNuevo = false; this.erroresNuevo.general = err.error?.error || 'Error al guardar'; }
    });
  }

  // ── VACIAR INVENTARIO ─────────────────────────────────────────────────────
  confirmarVaciar() { this.mostrarConfirmarVaciar = true; }
  cancelarVaciar()  { this.mostrarConfirmarVaciar = false; }

  vaciarInventario() {
    const conStock = this.items.filter(i => i.stock_actual > 0);
    if (conStock.length === 0) { this.mostrarConfirmarVaciar = false; return; }
    this.vaciandoInventario = true;
    let pendientes = conStock.length;
    let errores = 0;
    conStock.forEach(item => {
      this.inventarioService.registrarMovimiento(item.producto_id, item.stock_actual, 'salida').subscribe({
        next: (res: any) => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) { this.items[idx].stock_actual = res.stock_actual ?? 0; }
          pendientes--;
          if (pendientes === 0) {
            this.vaciandoInventario = false;
            this.mostrarConfirmarVaciar = false;
            if (errores > 0) this.mensajeIngreso = `${errores} producto(s) no pudieron vaciarse`;
          }
        },
        error: () => {
          errores++; pendientes--;
          if (pendientes === 0) {
            this.vaciandoInventario = false;
            this.mostrarConfirmarVaciar = false;
            this.mensajeIngreso = `${errores} error(es) al vaciar inventario`;
          }
        }
      });
    });
  }

  abrirMenu()     { this.menuAbierto = true; }
  cerrarMenu()    { this.menuAbierto = false; }
  cerrarSesion()  { this.authService.logout(); this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irACaja() { this.cerrarMenu(); this.router.navigate(['/caja']); }
  irANotas() { this.cerrarMenu(); this.router.navigate(['/notas']); }
}