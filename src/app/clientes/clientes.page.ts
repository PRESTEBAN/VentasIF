import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClienteService, Cliente } from '../services/cliente';
import { AuthService } from '../services/auth';

export interface Movimiento {
  detalle: string;
  estado: 'C' | 'A' | 'P';
  valor: number;
  saldo: number;
}

type OrdenCampo = 'nombre' | 'saldo' | 'fecha_creacion' | 'fecha_modificacion';

@Component({
  selector: 'app-clientes',
  templateUrl: 'clientes.page.html',
  styleUrls: ['clientes.page.scss'],
  standalone: false,
})
export class ClientesPage implements OnInit {

  menuAbierto = false;
  usuarioActual: string = '';

  clientes: Cliente[] = [];
  clientesFiltrados: Cliente[] = [];
  busqueda = '';
  cargando = false;

  // Ordenamiento
  mostrarOrdenMenu = false;
  ordenActual: OrdenCampo = 'nombre';
  direccionOrden: 'asc' | 'desc' = 'asc';

  opcionesOrden: { label: string; valor: OrdenCampo }[] = [
    { label: 'Nombre (A-Z)',          valor: 'nombre' },
    { label: 'Saldo',                  valor: 'saldo' },
    { label: 'Fecha de agregado',      valor: 'fecha_creacion' },
    { label: 'Fecha de modificación',  valor: 'fecha_modificacion' },
  ];

  // Modal agregar
  mostrarAgregarCliente = false;
  nuevoCliente = {
    cedula: '', nombre: '', apellido: '',
    negocio: '', email: '', direccion: '',
    sector: '', telefono: '', esParticular: false
  };
  errores: any = {};
  guardando = false;

  // Modal detalle
  mostrarDetalle = false;
  clienteDetalle: Cliente | null = null;
  movimientos: Movimiento[] = [];
  cargandoMovimientos = false;

  constructor(
    public router: Router,
    private clienteService: ClienteService,
    private authService: AuthService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.cargarClientes();
  }

  // ---- CARGA ----
  cargarClientes() {
    this.cargando = true;
    this.clienteService.getAllConSaldos().subscribe({
      next: (data: Cliente[]) => {
        this.clientes = data;
        this.aplicarFiltroYOrden();
        this.cargando = false;
      },
      error: (err: any) => {
        console.error('Error cargando clientes:', err);
        this.cargando = false;
      }
    });
  }

  // ---- FILTRO + ORDEN ----
  aplicarFiltroYOrden() {
    const q = this.busqueda.trim().toLowerCase();

    let resultado = q
      ? this.clientes.filter(c =>
          c.nombre.toLowerCase().includes(q) ||
          c.apellido.toLowerCase().includes(q) ||
          c.cedula.includes(q) ||
          (c.nombre_negocio && c.nombre_negocio.toLowerCase().includes(q))
        )
      : [...this.clientes];

    resultado = this.ordenar(resultado);
    this.clientesFiltrados = resultado;
  }

  ordenar(lista: Cliente[]): Cliente[] {
    const dir = this.direccionOrden === 'asc' ? 1 : -1;
    return lista.sort((a, b) => {
      switch (this.ordenActual) {
        case 'nombre':
          return dir * `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`);
        case 'saldo':
          return dir * ((a.saldo || 0) - (b.saldo || 0));
        case 'fecha_creacion':
          return dir * (new Date(a.fecha_creacion || 0).getTime() - new Date(b.fecha_creacion || 0).getTime());
        case 'fecha_modificacion':
          return dir * (new Date(a.fecha_modificacion || 0).getTime() - new Date(b.fecha_modificacion || 0).getTime());
        default:
          return 0;
      }
    });
  }

  // ---- MENÚ ORDEN ----
  toggleOrdenMenu() { this.mostrarOrdenMenu = !this.mostrarOrdenMenu; }

  seleccionarOrden(campo: OrdenCampo) {
    if (this.ordenActual === campo) {
      // Si toca el mismo campo, invierte dirección
      this.direccionOrden = this.direccionOrden === 'asc' ? 'desc' : 'asc';
    } else {
      this.ordenActual = campo;
      this.direccionOrden = 'asc';
    }
    this.aplicarFiltroYOrden();
    this.mostrarOrdenMenu = false;
  }

  // ---- DETALLE ----
  verDetalle(cliente: Cliente) {
    this.clienteDetalle = cliente;
    this.movimientos = [];
    this.mostrarDetalle = true;
    this.cargarMovimientos(cliente.id!);
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
    this.clienteDetalle = null;
    this.movimientos = [];
  }

  cargarMovimientos(clienteId: number) {
    this.cargandoMovimientos = true;
    // TODO: conectar con tu endpoint de movimientos/historial del cliente
    // this.clienteService.getMovimientos(clienteId).subscribe({
    //   next: (data) => { this.movimientos = data; this.cargandoMovimientos = false; },
    //   error: () => { this.cargandoMovimientos = false; }
    // });

    // Datos de ejemplo:
    setTimeout(() => {
      this.movimientos = [
        { detalle: 'Orden 000362', estado: 'C', valor: 80.00,  saldo: 10.00  },
        { detalle: 'Abona 000339', estado: 'A', valor: 30.00,  saldo: 10.00  },
        { detalle: 'Cancela 000322', estado: 'C', valor: 80.00, saldo: 40.00 },
        { detalle: 'Orden 000329', estado: 'P', valor: 40.00,  saldo: 120.00 },
        { detalle: 'Orden 000322', estado: 'P', valor: 80.00,  saldo: 80.00  },
      ];
      this.cargandoMovimientos = false;
    }, 400);
  }

  editarCliente() {
    // TODO: abrir modal de edición con los datos del clienteDetalle
    console.log('Editar cliente:', this.clienteDetalle?.id);
  }

  verSaldo() {
    // TODO: navegar o mostrar detalle de saldo
    console.log('Ver saldo:', this.clienteDetalle?.id);
  }

  // ---- AGREGAR CLIENTE ----
  abrirAgregarCliente() { this.mostrarAgregarCliente = true; }

  cerrarAgregarCliente() {
    this.mostrarAgregarCliente = false;
    this.nuevoCliente = { cedula: '', nombre: '', apellido: '', negocio: '', email: '', direccion: '', sector: '', telefono: '', esParticular: false };
    this.errores = {};
  }

  guardarCliente() {
    this.errores = {};
    let valido = true;

    const cedula = this.nuevoCliente.cedula.trim();
    if (!cedula) { this.errores.cedula = 'La cédula es requerida'; valido = false; }
    else if (/[^0-9]/.test(cedula)) { this.errores.cedula = 'Solo números'; valido = false; }
    else if (cedula.length !== 10) { this.errores.cedula = 'Debe tener 10 dígitos'; valido = false; }

    if (!this.nuevoCliente.nombre.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.nombre))
      { this.errores.nombre = 'Nombre inválido'; valido = false; }

    if (!this.nuevoCliente.apellido.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.nuevoCliente.apellido))
      { this.errores.apellido = 'Apellido inválido'; valido = false; }

    if (!this.nuevoCliente.direccion.trim() || this.nuevoCliente.direccion.trim().length < 5)
      { this.errores.direccion = 'Dirección requerida (mín. 5 chars)'; valido = false; }

    const tel = this.nuevoCliente.telefono.trim();
    if (!tel) { this.errores.telefono = 'Teléfono requerido'; valido = false; }
    else if (/[^0-9]/.test(tel)) { this.errores.telefono = 'Solo números'; valido = false; }
    else if (tel.length !== 10 && tel.length !== 7) { this.errores.telefono = 'Celular (10) o fijo (7) dígitos'; valido = false; }

    if (this.nuevoCliente.email && !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(this.nuevoCliente.email))
      { this.errores.email = 'Email inválido'; valido = false; }

    if (!valido) return;

    const payload: Cliente = {
      cedula: cedula,
      nombre: this.nuevoCliente.nombre.trim(),
      apellido: this.nuevoCliente.apellido.trim(),
      nombre_negocio: this.nuevoCliente.negocio.trim() || null,
      tipo_cliente: this.nuevoCliente.esParticular ? 'particular' : 'negocio',
      direccion: this.nuevoCliente.direccion.trim(),
      sector: this.nuevoCliente.sector.trim() || null,
      telefono: this.nuevoCliente.telefono.trim(),
      email: this.nuevoCliente.email.trim() || null,
      limite_credito: 0, notas: null,
    };

    this.guardando = true;
    this.clienteService.create(payload).subscribe({
      next: () => { this.guardando = false; this.cargarClientes(); this.cerrarAgregarCliente(); },
      error: (err: any) => {
        this.guardando = false;
        this.errores.general = err.status === 400 ? 'Datos inválidos' : 'Error al guardar';
      }
    });
  }

  // ---- MENU ----
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
}