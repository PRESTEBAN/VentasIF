import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { InventarioService, ItemInventario } from '../services/inventario';
import { AuthService } from '../services/auth';

@Component({
  selector: 'app-inventario',
  templateUrl: 'inventario.page.html',
  styleUrls: ['inventario.page.scss'],
  standalone: false,
})
export class InventarioPage implements OnInit {

  menuAbierto = false;
  usuarioActual = '';

  // Tabs
  tabActivo: 'inventario' | 'productos' = 'inventario';

  // Data
  items: ItemInventario[] = [];
  cargando = false;

  // Modo ingreso (tab inventario)
  modoIngreso = false;
  guardandoIngreso = false;
  mensajeIngreso = '';

  // Modo editar precios (tab productos)
  modoEditarPrecios = false;
  guardandoPrecios = false;
  editPrecios: { [producto_id: number]: { mayor: number; menor: number } } = {};

  // Modal nuevo producto
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

  constructor(
    public router: Router,
    private inventarioService: InventarioService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.cargarInventario();
  }

  // ── CARGA ────────────────────────────────────────────────────────────────
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
      this.editPrecios[i.producto_id] = {
        mayor: i.precio_x_mayor,
        menor: i.precio_x_menor,
      };
    });
  }

  // ── TABS ─────────────────────────────────────────────────────────────────
  cambiarTab(tab: 'inventario' | 'productos') {
    this.tabActivo = tab;
    // Al cambiar de tab salir de modos de edición
    this.modoIngreso = false;
    this.modoEditarPrecios = false;
    this.mensajeIngreso = '';
  }

  // ── MODO INGRESO ──────────────────────────────────────────────────────────
  activarIngreso() {
    this.modoIngreso = true;
    this.mensajeIngreso = '';
    this.items = this.items.map(i => ({ ...i, ingreso: null }));
  }

  cancelarIngreso() {
    this.modoIngreso = false;
    this.items = this.items.map(i => ({ ...i, ingreso: null }));
  }

  guardarIngresos() {
    const conIngreso = this.items.filter(i => i.ingreso && i.ingreso > 0);
    if (conIngreso.length === 0) {
      this.mensajeIngreso = 'No hay ingresos para guardar';
      return;
    }

    this.guardandoIngreso = true;
    this.mensajeIngreso = '';

    // Registrar uno por uno en secuencia
    let pendientes = conIngreso.length;
    let errores = 0;

    conIngreso.forEach(item => {
      this.inventarioService.registrarIngreso(item.producto_id, item.ingreso!).subscribe({
        next: (res: any) => {
          const idx = this.items.findIndex(i => i.producto_id === item.producto_id);
          if (idx >= 0) {
            this.items[idx].stock_actual = res.stock_actual;
            this.items[idx].ingreso = null;
          }
          pendientes--;
          if (pendientes === 0) {
            this.guardandoIngreso = false;
            this.modoIngreso = false;
            this.mensajeIngreso = errores > 0 ? `${errores} error(es) al guardar` : '';
          }
        },
        error: (_err: any) => {
          errores++;
          pendientes--;
          if (pendientes === 0) {
            this.guardandoIngreso = false;
            this.mensajeIngreso = `${errores} error(es) al guardar`;
          }
        }
      });
    });
  }

  // ── MODO EDITAR PRECIOS ───────────────────────────────────────────────────
  activarEditarPrecios() {
    this.modoEditarPrecios = true;
    this.inicializarPrecios();
  }

  cancelarEditarPrecios() {
    this.modoEditarPrecios = false;
    this.inicializarPrecios();
  }

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
          if (idx >= 0) {
            this.items[idx].precio_x_mayor = e.mayor;
            this.items[idx].precio_x_menor = e.menor;
          }
          pendientes--;
          if (pendientes === 0) { this.guardandoPrecios = false; this.modoEditarPrecios = false; }
        },
        error: () => {
          pendientes--;
          if (pendientes === 0) { this.guardandoPrecios = false; }
        }
      });
    });
  }

  // ── NUEVO PRODUCTO ────────────────────────────────────────────────────────
  abrirNuevoProducto() {
    this.nuevoProducto = { codigo: '', nombre: '', descripcion: '', categoria: '', peso_gramos: null, unidad_medida: 'unidad', precio_x_mayor: null, precio_x_menor: null, stock_inicial: null };
    this.erroresNuevo = {};
    this.mostrarNuevoProducto = true;
  }

  cerrarNuevoProducto() {
    this.mostrarNuevoProducto = false;
    this.erroresNuevo = {};
  }

  guardarNuevoProducto() {
    this.erroresNuevo = {};
    let valido = true;

    if (!this.nuevoProducto.codigo.trim()) { this.erroresNuevo.codigo = 'Código requerido'; valido = false; }
    if (!this.nuevoProducto.nombre.trim()) { this.erroresNuevo.nombre = 'Nombre requerido'; valido = false; }
    if (!this.nuevoProducto.precio_x_mayor || this.nuevoProducto.precio_x_mayor <= 0)
      { this.erroresNuevo.precio_x_mayor = 'Precio mayor requerido'; valido = false; }
    if (!this.nuevoProducto.precio_x_menor || this.nuevoProducto.precio_x_menor <= 0)
      { this.erroresNuevo.precio_x_menor = 'Precio menor requerido'; valido = false; }

    if (!valido) return;

    this.guardandoNuevo = true;
    this.inventarioService.crearProducto({
      ...this.nuevoProducto,
      stock_inicial: this.nuevoProducto.stock_inicial || 0,
    }).subscribe({
      next: () => {
        this.guardandoNuevo = false;
        this.cerrarNuevoProducto();
        this.cargarInventario();
      },
      error: (err: any) => {
        this.guardandoNuevo = false;
        this.erroresNuevo.general = err.error?.error || 'Error al guardar';
      }
    });
  }

  // ── MENU ──────────────────────────────────────────────────────────────────
  abrirMenu()     { this.menuAbierto = true; }
  cerrarMenu()    { this.menuAbierto = false; }
  cerrarSesion()  { this.authService.logout(); this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']); }
}