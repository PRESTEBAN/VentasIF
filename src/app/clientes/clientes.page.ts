import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ClienteService, Cliente, Movimiento } from '../services/cliente';
import { AuthService } from '../services/auth';

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
    { label: 'Nombre (A-Z)',         valor: 'nombre' },
    { label: 'Saldo',                valor: 'saldo' },
    { label: 'Fecha de agregado',    valor: 'fecha_creacion' },
    { label: 'Fecha modificación',   valor: 'fecha_modificacion' },
  ];

  // Modal nuevo cliente
  mostrarAgregarCliente = false;
  nuevoCliente = { cedula: '', nombre: '', apellido: '', negocio: '', email: '', direccion: '', sector: '', telefono: '', esParticular: false };
  errores: any = {};
  guardando = false;

  // Modal detalle
  mostrarDetalle = false;
  clienteDetalle: Cliente | null = null;
  movimientos: Movimiento[] = [];
  cargandoMovimientos = false;

  // Modal editar
  mostrarEditar = false;
  editCliente = { cedula: '', nombre: '', apellido: '', negocio: '', email: '', direccion: '', sector: '', telefono: '', esParticular: false };
  erroresEditar: any = {};
  guardandoEdicion = false;

  // Modal abono
  mostrarAbono = false;
  abonoData = { ventaId: null as number | null, monto: null as number | null };
  erroresAbono: any = {};
  guardandoAbono = false;
  mensajeAbono = '';

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

  // ── CARGA ──────────────────────────────────────────────────────────────
  cargarClientes() {
    this.cargando = true;
    this.clienteService.getAllConSaldos().subscribe({
      next: (data) => { this.clientes = data; this.aplicarFiltroYOrden(); this.cargando = false; },
      error: () => { this.cargando = false; }
    });
  }

  // ── FILTRO + ORDEN ─────────────────────────────────────────────────────
  aplicarFiltroYOrden() {
    const q = this.busqueda.trim().toLowerCase();
    let res = q
      ? this.clientes.filter(c =>
          c.nombre.toLowerCase().includes(q) ||
          c.apellido.toLowerCase().includes(q) ||
          c.cedula.includes(q) ||
          (c.nombre_negocio?.toLowerCase().includes(q) ?? false)
        )
      : [...this.clientes];
    this.clientesFiltrados = this.ordenar(res);
  }

  ordenar(lista: Cliente[]): Cliente[] {
    const dir = this.direccionOrden === 'asc' ? 1 : -1;
    return lista.sort((a, b) => {
      switch (this.ordenActual) {
        case 'nombre': return dir * `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`);
        case 'saldo':  return dir * ((a.saldo || 0) - (b.saldo || 0));
        case 'fecha_creacion': return dir * (new Date(a.fecha_creacion || 0).getTime() - new Date(b.fecha_creacion || 0).getTime());
        case 'fecha_modificacion': return dir * (new Date(a.fecha_modificacion || 0).getTime() - new Date(b.fecha_modificacion || 0).getTime());
        default: return 0;
      }
    });
  }

  toggleOrdenMenu() { this.mostrarOrdenMenu = !this.mostrarOrdenMenu; }

  seleccionarOrden(campo: OrdenCampo) {
    this.direccionOrden = this.ordenActual === campo
      ? (this.direccionOrden === 'asc' ? 'desc' : 'asc')
      : 'asc';
    this.ordenActual = campo;
    this.aplicarFiltroYOrden();
    this.mostrarOrdenMenu = false;
  }

  // ── DETALLE ────────────────────────────────────────────────────────────
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
    this.clienteService.getMovimientos(clienteId).subscribe({
      next: (data) => { this.movimientos = data; this.cargandoMovimientos = false; },
      error: () => { this.cargandoMovimientos = false; }
    });
  }

  estadoLabel(estado: string): string {
    switch (estado) {
      case 'cancelado': return 'C';
      case 'abono':     return 'A';
      default:          return 'P';
    }
  }

  // ── EDITAR ─────────────────────────────────────────────────────────────
  abrirEditar() {
    if (!this.clienteDetalle) return;
    const c = this.clienteDetalle;
    this.editCliente = {
      cedula:       c.cedula,
      nombre:       c.nombre,
      apellido:     c.apellido,
      negocio:      c.nombre_negocio || '',
      email:        c.email || '',
      direccion:    c.direccion,
      sector:       c.sector || '',
      telefono:     c.telefono,
      esParticular: c.tipo_cliente === 'particular',
    };
    this.erroresEditar = {};
    this.mostrarEditar = true;
  }

  cerrarEditar() {
    this.mostrarEditar = false;
    this.erroresEditar = {};
  }

  guardarEdicion() {
    this.erroresEditar = {};
    let valido = true;

    if (!this.editCliente.cedula.trim() || !/^\d{10}$/.test(this.editCliente.cedula.trim()))
      { this.erroresEditar.cedula = 'Cédula inválida (10 dígitos)'; valido = false; }
    if (!this.editCliente.nombre.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.editCliente.nombre))
      { this.erroresEditar.nombre = 'Nombre inválido'; valido = false; }
    if (!this.editCliente.apellido.trim() || !/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]{2,}$/.test(this.editCliente.apellido))
      { this.erroresEditar.apellido = 'Apellido inválido'; valido = false; }
    if (!this.editCliente.direccion.trim() || this.editCliente.direccion.trim().length < 5)
      { this.erroresEditar.direccion = 'Dirección requerida (mín. 5 chars)'; valido = false; }
    const tel = this.editCliente.telefono.trim();
    if (!tel || (tel.length !== 10 && tel.length !== 7) || /[^0-9]/.test(tel))
      { this.erroresEditar.telefono = 'Teléfono inválido'; valido = false; }
    if (this.editCliente.email && !/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(this.editCliente.email))
      { this.erroresEditar.email = 'Email inválido'; valido = false; }

    if (!valido) return;

    const payload: Partial<Cliente> = {
      cedula:        this.editCliente.cedula.trim(),
      nombre:        this.editCliente.nombre.trim(),
      apellido:      this.editCliente.apellido.trim(),
      nombre_negocio: this.editCliente.negocio.trim() || null,
      tipo_cliente:  this.editCliente.esParticular ? 'particular' : 'negocio',
      direccion:     this.editCliente.direccion.trim(),
      sector:        this.editCliente.sector.trim() || null,
      telefono:      tel,
      email:         this.editCliente.email.trim() || null,
    };

    this.guardandoEdicion = true;
    this.clienteService.update(this.clienteDetalle!.id!, payload).subscribe({
      next: () => {
        this.guardandoEdicion = false;
        this.cerrarEditar();
        this.cargarClientes();
        // Actualizar clienteDetalle localmente
        this.clienteDetalle = { ...this.clienteDetalle!, ...payload };
      },
      error: (err) => {
        this.guardandoEdicion = false;
        this.erroresEditar.general = err.error?.error || 'Error al guardar';
      }
    });
  }

  confirmarEliminar() {
    if (!this.clienteDetalle) return;
    const nombre = `${this.clienteDetalle.nombre} ${this.clienteDetalle.apellido}`;
    if (confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) {
      this.clienteService.remove(this.clienteDetalle.id!).subscribe({
        next: () => {
          this.cerrarEditar();
          this.cerrarDetalle();
          this.cargarClientes();
        },
        error: (err) => {
          this.erroresEditar.general = err.error?.error || 'Error al eliminar';
        }
      });
    }
  }

  // ── ABONO ──────────────────────────────────────────────────────────────
  abrirAbono() {
    this.abonoData = { ventaId: null, monto: null };
    this.erroresAbono = {};
    this.mensajeAbono = '';
    this.mostrarAbono = true;
  }

  cerrarAbono() {
    this.mostrarAbono = false;
    this.erroresAbono = {};
    this.mensajeAbono = '';
  }

  guardarAbono() {
    this.erroresAbono = {};
    this.mensajeAbono = '';
    let valido = true;

    if (!this.abonoData.ventaId) { this.erroresAbono.ventaId = 'Ingresa el N° de orden'; valido = false; }
    if (!this.abonoData.monto || this.abonoData.monto <= 0) { this.erroresAbono.monto = 'Ingresa un valor mayor a 0'; valido = false; }
    if (!valido) return;

    this.guardandoAbono = true;
    this.clienteService.registrarAbono(
      this.abonoData.ventaId!,
      this.clienteDetalle!.id!,
      this.abonoData.monto!
    ).subscribe({
      next: (res: any) => {
        this.guardandoAbono = false;
        this.mensajeAbono = res.mensaje;
        // Recargar movimientos y saldo
        this.cargarMovimientos(this.clienteDetalle!.id!);
        this.cargarClientes();
        setTimeout(() => this.cerrarAbono(), 1500);
      },
      error: (err) => {
        this.guardandoAbono = false;
        this.erroresAbono.general = err.error?.error || 'Error al registrar abono';
      }
    });
  }

  // ── NUEVO CLIENTE ──────────────────────────────────────────────────────
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
      cedula, nombre: this.nuevoCliente.nombre.trim(), apellido: this.nuevoCliente.apellido.trim(),
      nombre_negocio: this.nuevoCliente.negocio.trim() || null,
      tipo_cliente: this.nuevoCliente.esParticular ? 'particular' : 'negocio',
      direccion: this.nuevoCliente.direccion.trim(),
      sector: this.nuevoCliente.sector.trim() || null,
      telefono: tel, email: this.nuevoCliente.email.trim() || null,
      limite_credito: 0, notas: null,
    };

    this.guardando = true;
    this.clienteService.create(payload).subscribe({
      next: () => { this.guardando = false; this.cargarClientes(); this.cerrarAgregarCliente(); },
      error: (err) => {
        this.guardando = false;
        this.errores.general = err.status === 400 ? 'Datos inválidos' : 'Error al guardar';
      }
    });
  }

  // ── MENU ───────────────────────────────────────────────────────────────
  abrirMenu()     { this.menuAbierto = true; }
  cerrarMenu()    { this.menuAbierto = false; }
  cerrarSesion()  { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']); }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
}