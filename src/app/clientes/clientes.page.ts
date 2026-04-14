import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { ClienteService, Cliente, Movimiento } from '../services/cliente';
import { AuthService } from '../services/auth';
import { SocketService } from '../services/socket';
import { PrinterService, DatosReciboAbono } from '../services/printer';
import { Subscription } from 'rxjs';

type OrdenCampo = 'nombre' | 'saldo' | 'fecha_creacion' | 'fecha_modificacion';

export interface OrdenAgrupada {
  venta_id:    number;
  num_orden:   string;
  estado:      string;
  valor_total: number;
  saldo_orden: number;
  fecha:       string;
  forma_pago:  string;
  notas:       string;
  abonos:      { fecha: string; forma_pago: string; monto: number }[];
}

@Component({
  selector: 'app-clientes',
  templateUrl: 'clientes.page.html',
  styleUrls: ['clientes.page.scss'],
  standalone: false,
})
export class ClientesPage implements OnInit, OnDestroy {

  menuAbierto = false;
  usuarioActual: string = '';

  clientes: Cliente[] = [];
  clientesFiltrados: Cliente[] = [];
  busqueda = '';
  cargando = false;

  private pollingInterval: any = null;
  private readonly POLLING_MS = 30000;
  private socketSubs: Subscription[] = [];

  mostrarOrdenMenu = false;
  ordenActual: OrdenCampo = 'nombre';
  direccionOrden: 'asc' | 'desc' = 'asc';
  opcionesOrden: { label: string; valor: OrdenCampo }[] = [
    { label: 'Nombre (A-Z)',       valor: 'nombre' },
    { label: 'Saldo',              valor: 'saldo' },
    { label: 'Fecha de agregado',  valor: 'fecha_creacion' },
    { label: 'Fecha modificación', valor: 'fecha_modificacion' },
  ];

  mostrarAgregarCliente = false;
  nuevoCliente = {
    cedula_ruc: '', nombre: '', apellido: '', negocio: '',
    email: '', direccion: '', sector: '', telefono: '',
    esParticular: false, esRuc: false
  };
  errores: any = {};
  guardando = false;

  mostrarDetalle = false;
  puedesCerrarDetalle: boolean | (() => Promise<boolean>) = true;
  clienteDetalle: Cliente | null = null;
  movimientos: Movimiento[] = [];
  ordenesAgrupadas: OrdenAgrupada[] = [];
  cargandoMovimientos = false;

  mostrarDetalleOrden = false;
  ordenSeleccionada: OrdenAgrupada | null = null;

  mostrarEditar = false;
  editCliente = {
    cedula_ruc: '', nombre: '', apellido: '', negocio: '',
    email: '', direccion: '', sector: '', telefono: '',
    esParticular: false, esRuc: false
  };
  erroresEditar: any = {};
  guardandoEdicion = false;

  // ── Abono individual ──────────────────────────────────────────────────────
  mostrarAbono = false;
  abonoData = {
    ventaId: null as number | null,
    monto: null as number | null,
    formaPago: 'Efectivo',
    notas: ''
  };
  erroresAbono: any = {};
  guardandoAbono = false;
  mensajeAbono = '';
  abonoOrdenFija = false;
  abonoSaldoOrden = 0;
  imprimiendoAbono = false;

  // ── Cobro múltiple ────────────────────────────────────────────────────────
  mostrarCobroMultiple = false;
  ordenesSeleccionadas = new Set<number>();
  cobroMultipleFormaPago = 'Efectivo';
  cobroMultipleNotas = '';
  guardandoCobroMultiple = false;
  mensajeCobroMultiple = '';
  erroresCobroMultiple = '';

  get ordenesPendientes(): OrdenAgrupada[] {
    return this.ordenesAgrupadas.filter(o => o.saldo_orden > 0 && o.estado !== 'cancelado');
  }

  get totalCobroMultiple(): number {
    return this.ordenesPendientes
      .filter(o => this.ordenesSeleccionadas.has(o.venta_id))
      .reduce((s, o) => s + o.saldo_orden, 0);
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────
  mostrarConfirmarEliminar = false;
  eliminando = false;

  constructor(
    public router: Router,
    private clienteService: ClienteService,
    private authService: AuthService,
    private socketService: SocketService,
    private printerService: PrinterService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';
    this.cargarClientes();
  }

  ionViewWillEnter() { this.cargarClientes(); this.iniciarPolling(); this.iniciarSocket(); }
  ionViewWillLeave() { this.detenerPolling(); this.detenerSocket(); }
  ngOnDestroy()      { this.detenerPolling(); this.detenerSocket(); }

  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarClientesSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();
    const cliSub = this.socketService.on('clientes_actualizado').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      this.cargarClientesSilencioso();
      if (this.mostrarDetalle && this.clienteDetalle) this.cargarMovimientos(this.clienteDetalle.id!);
    });
    const ordenSub = this.socketService.on('orden_actualizada').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (this.mostrarDetalle && this.clienteDetalle) this.cargarMovimientos(this.clienteDetalle.id!);
    });
    this.socketSubs = [cliSub, ordenSub];
  }

  detenerSocket() { this.socketSubs.forEach(s => s.unsubscribe()); this.socketSubs = []; }

  cargarClientesSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    this.clienteService.getAllConSaldos().subscribe({
      next: (data) => { this.clientes = data; this.aplicarFiltroYOrden(); },
      error: () => {}
    });
  }

  cargarClientes() {
    this.cargando = true;
    this.clienteService.getAllConSaldos().subscribe({
      next: (data) => { this.clientes = data; this.aplicarFiltroYOrden(); this.cargando = false; },
      error: () => { this.cargando = false; }
    });
  }

  aplicarFiltroYOrden() {
    const q = this.busqueda.trim().toLowerCase();
    let res = q
      ? this.clientes.filter(c =>
          c.nombre.toLowerCase().includes(q) ||
          c.apellido.toLowerCase().includes(q) ||
          c.cedula_ruc.includes(q) ||
          (c.nombre_negocio?.toLowerCase().includes(q) ?? false))
      : [...this.clientes];
    this.clientesFiltrados = this.ordenar(res);
  }

  ordenar(lista: Cliente[]): Cliente[] {
    const dir = this.direccionOrden === 'asc' ? 1 : -1;
    return lista.sort((a, b) => {
      switch (this.ordenActual) {
        case 'nombre':             return dir * `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`);
        case 'saldo':              return dir * ((a.saldo_pendiente || 0) - (b.saldo_pendiente || 0));
        case 'fecha_creacion':     return dir * (new Date(a.fecha_creacion || 0).getTime() - new Date(b.fecha_creacion || 0).getTime());
        case 'fecha_modificacion': return dir * (new Date(a.fecha_modificacion || 0).getTime() - new Date(b.fecha_modificacion || 0).getTime());
        default: return 0;
      }
    });
  }

  toggleOrdenMenu() { this.mostrarOrdenMenu = !this.mostrarOrdenMenu; }

  seleccionarOrden(campo: OrdenCampo) {
    this.direccionOrden = this.ordenActual === campo ? (this.direccionOrden === 'asc' ? 'desc' : 'asc') : 'asc';
    this.ordenActual = campo;
    this.aplicarFiltroYOrden();
    this.mostrarOrdenMenu = false;
  }

  verDetalle(cliente: Cliente) {
    this.clienteDetalle = cliente;
    this.movimientos = [];
    this.ordenesAgrupadas = [];
    this.puedesCerrarDetalle = () => new Promise(resolve => {
      const modalContent = document.querySelector('ion-modal .detalle-content');
      if (!modalContent) { resolve(true); return; }
      (modalContent as any).getScrollElement()
        .then((el: HTMLElement) => resolve(el.scrollTop < 10))
        .catch(() => resolve(true));
    });
    this.mostrarDetalle = true;
    this.cargarMovimientos(cliente.id!);
  }

  cerrarDetalle() {
    this.mostrarDetalle = false;
    this.clienteDetalle = null;
    this.movimientos = [];
    this.ordenesAgrupadas = [];
  }

  cargarMovimientos(clienteId: number) {
    this.cargandoMovimientos = true;
    this.clienteService.getMovimientos(clienteId).subscribe({
      next: (data) => {
        this.movimientos = data;
        this.ordenesAgrupadas = this.agruparPorOrden(data);
        this.cargandoMovimientos = false;
      },
      error: () => { this.cargandoMovimientos = false; }
    });
  }

  private agruparPorOrden(movs: Movimiento[]): OrdenAgrupada[] {
    const mapa = new Map<number, OrdenAgrupada>();

    for (const m of movs) {
      const id = (m as any).venta_id ?? 0;
      const esAbono = m.estado === 'abono';

      if (!mapa.has(id)) {
        const entrada: any = {
          venta_id:         id,
          num_orden:        m.num_orden,
          estado:           esAbono ? 'pendiente' : m.estado,
          valor_total:      esAbono ? 0 : Math.abs(+m.valor),
          saldo_orden:      0,
          fecha:            m.fecha,
          forma_pago:       esAbono ? '' : ((m as any).forma_pago ?? ''),
          notas:            esAbono ? '' : ((m as any).notas ?? ''),
          abonos:           [],
          _saldo_generado:  esAbono ? undefined : +(m as any).saldo_generado,
        };
        mapa.set(id, entrada);
      }

      const entry = mapa.get(id)!;

      if (esAbono) {
        entry.abonos.push({
          fecha:      m.fecha,
          forma_pago: (m as any).forma_pago ?? '',
          monto:      Math.abs(+m.valor),
        });
      } else {
        entry.valor_total = Math.abs(+m.valor);
        entry.estado      = m.estado;
        entry.fecha       = m.fecha;
        entry.forma_pago  = (m as any).forma_pago ?? entry.forma_pago;
        entry.notas       = (m as any).notas ?? entry.notas;
        entry.num_orden   = m.num_orden;
        // ── CORRECCIÓN: guardar saldo_generado que viene del backend ──
        (entry as any)._saldo_generado = +(m as any).saldo_generado;
      }
    }

    for (const [, entry] of mapa) {
      const totalAbonado   = entry.abonos.reduce((sum, a) => sum + a.monto, 0);
      const saldoDesdeDB   = (entry as any)._saldo_generado;

      // Si el backend envió saldo_generado (incluso 0), usarlo directamente.
      // Solo calcular manualmente si no viene ese dato.
      if (saldoDesdeDB !== undefined && saldoDesdeDB !== null && !isNaN(saldoDesdeDB)) {
        entry.saldo_orden = saldoDesdeDB;
      } else {
        entry.saldo_orden = Math.max(0, entry.valor_total - totalAbonado);
      }

      if (entry.estado !== 'cancelado') {
        if (entry.saldo_orden === 0) entry.estado = 'pagado';
        else if (entry.abonos.length > 0 && entry.saldo_orden > 0) entry.estado = 'abono';
      }
    }

    return Array.from(mapa.values()).sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
  }

  verDetalleOrden(orden: OrdenAgrupada) {
    this.ordenSeleccionada = orden;
    this.mostrarDetalleOrden = true;
  }

  cerrarDetalleOrden() {
    this.mostrarDetalleOrden = false;
    this.ordenSeleccionada = null;
  }

  totalAbonado(orden: OrdenAgrupada): number {
    return orden.abonos.reduce((s, a) => s + a.monto, 0);
  }

  estadoLabel(estado: string): string {
    switch (estado) {
      case 'cancelado': return 'C';
      case 'abono':     return 'A';
      case 'pagado':    return 'OK';
      default:          return 'P';
    }
  }

  estadoLabelLargo(estado: string): string {
    switch (estado) {
      case 'cancelado': return 'Cancelado';
      case 'abono':     return 'Abonado';
      case 'pagado':    return 'Pagado';
      default:          return 'Pendiente';
    }
  }

  // ── Abono desde popup de orden ────────────────────────────────────────────
  abrirAbonoDesdeOrden(orden: OrdenAgrupada) {
    this.abonoData = { ventaId: orden.venta_id, monto: null, formaPago: 'Efectivo', notas: '' };
    this.abonoOrdenFija  = true;
    this.abonoSaldoOrden = orden.saldo_orden;
    this.erroresAbono    = {};
    this.mensajeAbono    = '';
    this.mostrarAbono    = true;
  }

  async reimprimirAbono(orden: OrdenAgrupada, abono: { fecha: string; forma_pago: string; monto: number }) {
    if (!this.clienteDetalle || this.imprimiendoAbono) return;
    this.imprimiendoAbono = true;
    try {
      const c    = this.clienteDetalle;
      const user = this.authService.getUsuario();
      await this.printerService.imprimirReciboAbono({
        ventaId:         orden.venta_id,
        clienteNombre:   `${c.nombre} ${c.apellido}`,
        clienteCedula:   c.cedula_ruc   || '',
        clienteTelefono: c.telefono     || '',
        clienteDireccion:c.direccion    || '',
        vendedor:        user?.nombre || user?.username || 'Admin',
        fechaVenta:      orden.fecha    || '',
        valorTotalVenta: orden.valor_total,
        saldoPendiente:  orden.saldo_orden + abono.monto,
        valorAbono:      abono.monto,
        saldoRestante:   orden.saldo_orden,
      });
    } catch (e: any) {
      console.warn('[Printer] Error al reimprimir abono:', e.message);
    } finally {
      this.imprimiendoAbono = false;
    }
  }

  abrirAbono() {
    this.abonoData = { ventaId: null, monto: null, formaPago: 'Efectivo', notas: '' };
    this.abonoOrdenFija  = false;
    this.abonoSaldoOrden = 0;
    this.erroresAbono    = {};
    this.mensajeAbono    = '';
    this.mostrarAbono    = true;
  }

  cerrarAbono() {
    this.mostrarAbono    = false;
    this.abonoOrdenFija  = false;
    this.abonoSaldoOrden = 0;
    this.erroresAbono    = {};
    this.mensajeAbono    = '';
  }

  guardarAbono() {
    this.erroresAbono = {}; this.mensajeAbono = '';
    let valido = true;
    if (!this.abonoData.ventaId) { this.erroresAbono.ventaId = 'Ingresa el N° de orden'; valido = false; }
    if (!this.abonoData.monto || this.abonoData.monto <= 0) { this.erroresAbono.monto = 'Ingresa un valor mayor a 0'; valido = false; }
    if (!valido) return;

    this.guardandoAbono = true;
    this.clienteService.registrarAbono(
      this.abonoData.ventaId!,
      this.clienteDetalle!.id!,
      this.abonoData.monto!,
      this.abonoData.formaPago,
      this.abonoData.notas || undefined
    ).subscribe({
      next: (res: any) => {
        this.guardandoAbono = false;
        this.mensajeAbono = res.mensaje;
        this.cargarMovimientos(this.clienteDetalle!.id!);
        this.cargarClientes();
        const c    = this.clienteDetalle!;
        const user = this.authService.getUsuario();
        this.printerService.imprimirReciboAbono({
          ventaId:         this.abonoData.ventaId!,
          clienteNombre:   `${c.nombre} ${c.apellido}`,
          clienteCedula:   c.cedula_ruc  || '',
          clienteTelefono: c.telefono    || '',
          clienteDireccion:c.direccion   || '',
          vendedor:        user?.nombre || user?.username || 'Admin',
          fechaVenta:      res.fecha_venta   || '',
          valorTotalVenta: +(res.valor_total ?? 0),
          saldoPendiente:  +(res.saldo_restante ?? 0) + +this.abonoData.monto!,
          valorAbono:      +this.abonoData.monto!,
          saldoRestante:   +(res.saldo_restante ?? 0),
        }).catch(err => console.warn('[Printer] Error al imprimir abono:', err));
        setTimeout(() => this.cerrarAbono(), 1500);
      },
      error: (err) => { this.guardandoAbono = false; this.erroresAbono.general = err.error?.error || 'Error al registrar abono'; }
    });
  }

  // ── COBRO MÚLTIPLE ────────────────────────────────────────────────────────
  abrirCobroMultiple() {
    this.ordenesSeleccionadas     = new Set();
    this.cobroMultipleFormaPago   = 'Efectivo';
    this.cobroMultipleNotas       = '';
    this.mensajeCobroMultiple     = '';
    this.erroresCobroMultiple     = '';
    this.guardandoCobroMultiple   = false;
    this.mostrarCobroMultiple     = true;
  }

  cerrarCobroMultiple() {
    this.mostrarCobroMultiple = false;
    this.ordenesSeleccionadas.clear();
    this.mensajeCobroMultiple   = '';
    this.erroresCobroMultiple   = '';
  }

  toggleOrdenCobroMultiple(ventaId: number) {
    if (this.ordenesSeleccionadas.has(ventaId)) this.ordenesSeleccionadas.delete(ventaId);
    else this.ordenesSeleccionadas.add(ventaId);
    this.ordenesSeleccionadas = new Set(this.ordenesSeleccionadas);
  }

  seleccionarTodasPendientes() {
    if (this.ordenesSeleccionadas.size === this.ordenesPendientes.length) {
      this.ordenesSeleccionadas = new Set();
    } else {
      this.ordenesSeleccionadas = new Set(this.ordenesPendientes.map(o => o.venta_id));
    }
  }

  async guardarCobroMultiple() {
    this.erroresCobroMultiple = '';
    this.mensajeCobroMultiple = '';

    if (this.ordenesSeleccionadas.size === 0) {
      this.erroresCobroMultiple = 'Selecciona al menos una orden';
      return;
    }

    this.guardandoCobroMultiple = true;
    const ordenesACobrar = this.ordenesPendientes.filter(o => this.ordenesSeleccionadas.has(o.venta_id));
    const c    = this.clienteDetalle!;
    const user = this.authService.getUsuario();
    let errores = 0;

    for (const orden of ordenesACobrar) {
      try {
        await this.clienteService.registrarAbono(
          orden.venta_id,
          c.id!,
          orden.saldo_orden,
          this.cobroMultipleFormaPago,
          this.cobroMultipleNotas || undefined
        ).toPromise();

        await this.printerService.imprimirReciboAbono({
          ventaId:         orden.venta_id,
          clienteNombre:   `${c.nombre} ${c.apellido}`,
          clienteCedula:   c.cedula_ruc   || '',
          clienteTelefono: c.telefono     || '',
          clienteDireccion:c.direccion    || '',
          vendedor:        user?.nombre || user?.username || 'Admin',
          fechaVenta:      orden.fecha    || '',
          valorTotalVenta: orden.valor_total,
          saldoPendiente:  orden.saldo_orden,
          valorAbono:      orden.saldo_orden,
          saldoRestante:   0,
        }).catch(() => {});
      } catch {
        errores++;
      }
    }

    this.guardandoCobroMultiple = false;

    if (errores > 0) {
      this.erroresCobroMultiple = `${errores} orden(es) no se pudieron cobrar`;
    } else {
      const n = ordenesACobrar.length;
      this.mensajeCobroMultiple = `✓ ${n} orden${n > 1 ? 'es cobradas' : ' cobrada'} correctamente`;
      this.cargarMovimientos(c.id!);
      this.cargarClientes();
      setTimeout(() => this.cerrarCobroMultiple(), 1800);
    }
  }

  // ── Editar ────────────────────────────────────────────────────────────────
  abrirEditar() {
    if (!this.clienteDetalle) return;
    const c = this.clienteDetalle;
    const esRuc = c.cedula_ruc.length === 13 && c.cedula_ruc.endsWith('001');
    this.editCliente = {
      cedula_ruc:   esRuc ? c.cedula_ruc.slice(0, 10) : (c.cedula_ruc || ''),
      nombre:       c.nombre         || '',
      apellido:     c.apellido       || '',
      negocio:      c.nombre_negocio || '',
      email:        c.email          || '',
      direccion:    c.direccion      || '',
      sector:       c.sector         || '',
      telefono:     c.telefono       || '',
      esParticular: c.tipo_cliente === 'particular',
      esRuc,
    };
    this.erroresEditar = {};
    this.mostrarEditar = true;
  }

  cerrarEditar() { this.mostrarEditar = false; this.erroresEditar = {}; }

  onCedulaEditarChange(valor: string) {
    this.editCliente.cedula_ruc = valor.replace(/\D/g, '').slice(0, 10);
  }

  toggleRucEditar() {
    this.editCliente.esRuc = !this.editCliente.esRuc;
    if (this.erroresEditar.cedula_ruc) this.erroresEditar.cedula_ruc = '';
  }

  private getCedulaEditarParaGuardar(): string {
    const base = this.editCliente.cedula_ruc.trim();
    return this.editCliente.esRuc ? `${base}001` : base;
  }

  guardarEdicion() {
    this.erroresEditar = {};
    let valido = true;
    const cedulaBase = this.editCliente.cedula_ruc.trim();
    if (!cedulaBase || !/^\d{10}$/.test(cedulaBase))
      { this.erroresEditar.cedula_ruc = 'Cédula inválida (10 dígitos)'; valido = false; }
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
      cedula_ruc:     this.getCedulaEditarParaGuardar(),
      nombre:         this.editCliente.nombre.trim(),
      apellido:       this.editCliente.apellido.trim(),
      nombre_negocio: this.editCliente.negocio.trim() || null,
      tipo_cliente:   this.editCliente.esParticular ? 'particular' : 'negocio',
      direccion:      this.editCliente.direccion.trim(),
      sector:         this.editCliente.sector.trim() || null,
      telefono:       tel,
      email:          this.editCliente.email.trim() || null,
    };

    this.guardandoEdicion = true;
    this.clienteService.update(this.clienteDetalle!.id!, payload).subscribe({
      next: () => {
        this.guardandoEdicion = false;
        this.cerrarEditar();
        this.cargarClientes();
        this.clienteDetalle = { ...this.clienteDetalle!, ...payload };
      },
      error: (err) => { this.guardandoEdicion = false; this.erroresEditar.general = err.error?.error || 'Error al guardar'; }
    });
  }

  confirmarEliminar() { this.mostrarConfirmarEliminar = true; }
  cancelarEliminar()  { this.mostrarConfirmarEliminar = false; }

  ejecutarEliminar() {
    if (!this.clienteDetalle) return;
    this.eliminando = true;
    this.clienteService.remove(this.clienteDetalle.id!).subscribe({
      next: () => {
        this.eliminando = false;
        this.mostrarConfirmarEliminar = false;
        this.cerrarEditar();
        this.cerrarDetalle();
        this.cargarClientes();
      },
      error: (err) => {
        this.eliminando = false;
        this.mostrarConfirmarEliminar = false;
        this.erroresEditar.general = err.error?.error || 'Error al eliminar';
      }
    });
  }

  abrirAgregarCliente() { this.mostrarAgregarCliente = true; }

  cerrarAgregarCliente() {
    this.mostrarAgregarCliente = false;
    this.nuevoCliente = {
      cedula_ruc: '', nombre: '', apellido: '', negocio: '',
      email: '', direccion: '', sector: '', telefono: '',
      esParticular: false, esRuc: false
    };
    this.errores = {};
  }

  onCedulaChange(valor: string) {
    this.nuevoCliente.cedula_ruc = valor.replace(/\D/g, '').slice(0, 10);
  }

  toggleRuc() {
    this.nuevoCliente.esRuc = !this.nuevoCliente.esRuc;
    if (this.errores.cedula_ruc) this.errores.cedula_ruc = '';
  }

  private getCedulaParaGuardar(): string {
    const base = this.nuevoCliente.cedula_ruc.trim();
    return this.nuevoCliente.esRuc ? `${base}001` : base;
  }

  guardarCliente() {
    this.errores = {};
    let valido = true;
    const cedulaBase = this.nuevoCliente.cedula_ruc.trim();
    if (!cedulaBase) { this.errores.cedula_ruc = 'La cédula es requerida'; valido = false; }
    else if (/[^0-9]/.test(cedulaBase)) { this.errores.cedula_ruc = 'Solo números'; valido = false; }
    else if (cedulaBase.length !== 10)  { this.errores.cedula_ruc = 'Debe tener 10 dígitos'; valido = false; }
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
      cedula_ruc:     this.getCedulaParaGuardar(),
      nombre:         this.nuevoCliente.nombre.trim(),
      apellido:       this.nuevoCliente.apellido.trim(),
      nombre_negocio: this.nuevoCliente.negocio.trim() || null,
      tipo_cliente:   this.nuevoCliente.esParticular ? 'particular' : 'negocio',
      direccion:      this.nuevoCliente.direccion.trim(),
      sector:         this.nuevoCliente.sector.trim() || null,
      telefono:       tel,
      email:          this.nuevoCliente.email.trim() || null,
      limite_credito: 0,
      notas:          null,
    };

    this.guardando = true;
    this.clienteService.create(payload).subscribe({
      next: () => { this.guardando = false; this.cargarClientes(); this.cerrarAgregarCliente(); },
      error: (err) => { this.guardando = false; this.errores.general = err.status === 400 ? 'Datos inválidos' : 'Error al guardar'; }
    });
  }

  abrirMenu()  { this.menuAbierto = true;  }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
} 