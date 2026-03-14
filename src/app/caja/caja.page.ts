import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { SocketService } from '../services/socket';
import { Subscription } from 'rxjs';

export interface VentaDelDia {
  id: number;
  clienteNombre: string;
  clienteApellido: string;
  total: number;
}

export interface Ingreso {
  id?: number;
  cierre_id?: number;
  monto: number;
  motivo: string;
  tipo?: string;
  fecha?: string;
}

export interface Egreso {
  id?: number;
  detalle: string;
  responsable: string;
  beneficiario: string;
  valor: number;
  fecha?: string;
  cierre_id?: number;
}

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  username: string;
}

@Component({
  selector: 'app-caja',
  templateUrl: 'caja.page.html',
  styleUrls: ['caja.page.scss'],
  standalone: false,
})
export class CajaPage implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto    = false;
  usuarioActual  = '';
  usernameActual = '';
  tabActivo: 'ingresos' | 'egresos' = 'ingresos';

  private pollingInterval: any = null;
  private readonly POLLING_MS = 15000;
  private socketSubs: Subscription[] = [];

  // ---- CALENDARIO ----
  fechaSeleccionada: Date = new Date();
  semanaBase: Date        = new Date();
  semanaActual: Date[]    = [];
  mostrarDatePicker       = false;

  // ---- INGRESOS ----
  ingresos: Ingreso[]   = [];
  fondoInicial          = 40;
  fondoModificado       = false;
  cierreActivoId        = 0;
  cargando              = false;

  get totalIngresos(): number {
    return this.ingresos.reduce((acc, i) => acc + +i.monto, 0);
  }

  mostrarModalFondo = false;
  guardandoFondo    = false;
  nuevoFondo        = 40;
  claveAdmin        = '';
  erroresFondo: any = {};

  mostrarModalIngreso  = false;
  guardandoIngreso     = false;
  nuevoIngreso: Ingreso = { monto: 0, motivo: '' };
  erroresIngreso: any  = {};

  mostrarEditarIngreso      = false;
  guardandoEditarIngreso    = false;
  ingresoEditando: Ingreso  = { monto: 0, motivo: '' };
  erroresEditarIngreso: any = {};

  // ---- EGRESOS ----
  egresos: Egreso[]   = [];
  usuarios: Usuario[] = [];

  get totalEgresos(): number {
    return this.egresos.reduce((acc, e) => acc + +e.valor, 0);
  }

  mostrarModalEgreso          = false;
  guardandoEgreso             = false;
  nuevoEgreso: Egreso         = { detalle: '', responsable: '', beneficiario: '', valor: 0 };
  erroresEgreso: any          = {};
  mostrarResponsableDropdown  = false;
  mostrarBeneficiarioDropdown = false;

  // Ventas del día (para Retención)
  ventasDelDia: VentaDelDia[]       = [];
  ventaAnticipo: VentaDelDia | null = null;  // reutilizamos para Retención – añadir
  mostrarVentasDropdown             = false;

  mostrarEditarModal                = false;
  guardandoEdicion                  = false;
  egresoEditando: Egreso            = { detalle: '', responsable: '', beneficiario: '', valor: 0 };
  erroresEditar: any                = {};
  mostrarResponsableDropdownEditar  = false;
  mostrarBeneficiarioDropdownEditar = false;

  ventaAnticipoEditar: VentaDelDia | null = null;  // para Retención – editar
  mostrarVentasDropdownEditar             = false;

  mostrarConfirmarBorrar = false;
  borrando               = false;
  private itemABorrar: { tipo: 'ingreso' | 'egreso'; id: number } | null = null;

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
    private socketService: SocketService
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual  = user?.nombre || user?.username || '';
    this.usernameActual = user?.username || '';
    const base = new Date(this.fechaSeleccionada);
    base.setDate(base.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
  }

  ionViewWillEnter() {
    this.cargarUsuarios();
    this.cargarDatos();
    this.iniciarPolling();
    this.iniciarSocket();
  }

  ionViewWillLeave() { this.detenerPolling(); this.detenerSocket(); }
  ngOnDestroy()       { this.detenerPolling(); this.detenerSocket(); }

  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarDatosSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  iniciarSocket() {
    if (!this.authService.estaLogueado()) return;
    this.socketService.connect();
    const egresoSub = this.socketService.on('egresos_actualizado').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (this.esDiaDeHoy) this.cargarDatosSilencioso();
    });
    const ingresoSub = this.socketService.on('ingresos_actualizado').subscribe(() => {
      if (!this.authService.estaLogueado()) { this.detenerSocket(); return; }
      if (this.esDiaDeHoy) this.cargarDatosSilencioso();
    });
    this.socketSubs = [egresoSub, ingresoSub];
  }

  detenerSocket() { this.socketSubs.forEach(s => s.unsubscribe()); this.socketSubs = []; }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  get esDiaDeHoy(): boolean {
    const hoy = new Date(); const sel = this.fechaSeleccionada;
    return sel.getFullYear() === hoy.getFullYear() &&
           sel.getMonth()    === hoy.getMonth() &&
           sel.getDate()     === hoy.getDate();
  }

  // ---- CARGA -------------------------------------------------------
  cargarDatos() {
    this.cargando = true; this.egresos = []; this.ingresos = [];
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);

    this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${fechaStr}`, { headers: this.getHeaders() }).subscribe({
      next: (data) => { this.egresos = data; this.cargando = false; },
      error: () => { this.egresos = []; this.cargando = false; }
    });

    if (this.esDiaDeHoy) {
      this.http.get<any>(`${this.API}/ingresos`, { headers: this.getHeaders() }).subscribe({
        next: (data) => {
          this.fondoInicial    = parseFloat(data.fondo_inicial) || 40;
          this.fondoModificado = data.fondo_modificado || false;
          this.cierreActivoId  = data.cierre_id || 0;
          this.ingresos        = data.ingresos || [];
        },
        error: () => { this.ingresos = []; }
      });
    } else {
      this.http.get<any>(`${this.API}/ingresos/fecha/${fechaStr}`, { headers: this.getHeaders() }).subscribe({
        next: (data) => {
          this.fondoInicial    = parseFloat(data.fondo_inicial) || 40;
          this.fondoModificado = data.fondo_modificado || false;
          this.cierreActivoId  = data.cierre_id || 0;
          this.ingresos        = data.ingresos || [];
        },
        error: () => { this.ingresos = []; this.fondoInicial = 40; this.cierreActivoId = 0; }
      });
    }
  }

  esIngresoEditable(ingreso: Ingreso): boolean {
    if (!this.esDiaDeHoy) return false;
    return ingreso.cierre_id === this.cierreActivoId;
  }

  cargarDatosSilencioso() {
    if (!this.authService.estaLogueado()) { this.detenerPolling(); return; }
    if (!this.esDiaDeHoy) return;
    this.cargarDatos();
  }

  cargarUsuarios() {
    this.http.get<Usuario[]>(`${this.API}/egresos/usuarios`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.usuarios = data.filter(u =>
          u.username?.toLowerCase() !== 'admin' && u.nombre?.toLowerCase() !== 'admin'
        );
      },
      error: () => {}
    });
  }

  get usuariosSinAdmin(): Usuario[] { return this.usuarios; }

  getLabelBeneficiario(username: string): string {
    const u = this.usuarios.find(u => u.username === username);
    return u ? `${u.nombre} ${u.apellido}` : username;
  }

  esEgresoEditable(egreso: Egreso): boolean {
    if (!this.esDiaDeHoy) return false;
    return !egreso.cierre_id || egreso.cierre_id === this.cierreActivoId;
  }

  // ---- VENTAS DEL DÍA (para Retención) ----------------------------
  cargarVentasDelDia() {
    const fechaStr = this.formatearFecha(new Date());
    this.http.get<any[]>(`${this.API}/ventas-ruta?fecha=${fechaStr}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.ventasDelDia = (data || []).map(v => {
            const partes = (v.cliente || v.clienteNombre || '').trim().split(' ');
            return {
              id:              v.venta_id || v.id,
              clienteNombre:   partes[0] || '',
              clienteApellido: partes.slice(1).join(' ') || '',
              total:           parseFloat(v.total) || 0,
            };
          });
        },
        error: () => { this.ventasDelDia = []; }
      });
  }

  getLabelVenta(v: VentaDelDia): string {
    return `#${v.id} — ${v.clienteNombre} ${v.clienteApellido} — $${v.total.toFixed(2)}`;
  }

  toggleVentasDropdown() { this.mostrarVentasDropdown = !this.mostrarVentasDropdown; }
  seleccionarVentaAnticipo(v: VentaDelDia) {
    this.ventaAnticipo         = v;
    this.mostrarVentasDropdown = false;
    this.nuevoEgreso.detalle   = `Retención orden #${v.id} - ${v.clienteNombre} ${v.clienteApellido}`.trim();
  }

  toggleVentasDropdownEditar() { this.mostrarVentasDropdownEditar = !this.mostrarVentasDropdownEditar; }
  seleccionarVentaAnticipoEditar(v: VentaDelDia) {
    this.ventaAnticipoEditar         = v;
    this.mostrarVentasDropdownEditar = false;
    this.egresoEditando.detalle      = `Retención orden #${v.id} - ${v.clienteNombre} ${v.clienteApellido}`.trim();
  }

  // ---- CALENDARIO --------------------------------------------------
  generarSemana(base: Date) {
    const dias: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(base.getDate() + i); dias.push(d);
    }
    this.semanaActual = dias;
  }

  semanaAnterior() {
    const nueva = new Date(this.semanaBase); nueva.setDate(nueva.getDate() - 7);
    this.semanaBase = nueva; this.generarSemana(nueva);
    this.fechaSeleccionada = new Date(this.semanaActual[6]); this.cargarDatos();
  }

  semanaSiguiente() {
    const nueva = new Date(this.semanaBase); nueva.setDate(nueva.getDate() + 7);
    this.semanaBase = nueva; this.generarSemana(nueva);
    this.fechaSeleccionada = new Date(this.semanaActual[0]); this.cargarDatos();
  }

  esSemanaActual(): boolean {
    const ultimoDia = new Date(this.semanaActual[this.semanaActual.length - 1]);
    const hoy = new Date(); hoy.setHours(0,0,0,0); ultimoDia.setHours(0,0,0,0);
    return ultimoDia >= hoy;
  }

  seleccionarDia(dia: Date) { this.fechaSeleccionada = new Date(dia); this.cargarDatos(); }
  esDiaSeleccionado(dia: Date): boolean { return dia.toDateString() === this.fechaSeleccionada.toDateString(); }
  esHoy(dia: Date): boolean { return dia.toDateString() === new Date().toDateString(); }
  abrirDatePicker()  { this.mostrarDatePicker = true; }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value; if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    const base = new Date(nueva); base.setDate(nueva.getDate() - 3);
    this.semanaBase = base; this.generarSemana(this.semanaBase);
    this.cargarDatos(); this.cerrarDatePicker();
  }

  abrirModalSegunTab() {
    if (this.tabActivo === 'ingresos') this.abrirModalIngreso();
    else this.abrirModalEgreso();
  }

  // ---- FONDO INICIAL -----------------------------------------------
  abrirEditarFondo() {
    this.nuevoFondo = this.fondoInicial; this.claveAdmin = ''; this.erroresFondo = {};
    this.mostrarModalFondo = true;
  }

  cerrarModalFondo() { this.mostrarModalFondo = false; this.erroresFondo = {}; }

  guardarFondo() {
    this.erroresFondo = {};
    if (!this.nuevoFondo || this.nuevoFondo < 0) { this.erroresFondo.monto = 'Ingresa un monto válido'; return; }
    if (this.fondoModificado && !this.claveAdmin.trim()) { this.erroresFondo.clave = 'La clave es requerida'; return; }
    this.guardandoFondo = true;
    const payload: any = { monto: this.nuevoFondo };
    if (this.fondoModificado) payload.clave_admin = this.claveAdmin;
    this.http.put<any>(`${this.API}/ingresos/fondo`, payload, { headers: this.getHeaders() }).subscribe({
      next: (res) => { this.fondoInicial = res.fondo_inicial; this.fondoModificado = true; this.guardandoFondo = false; this.cerrarModalFondo(); },
      error: (err) => { this.guardandoFondo = false; this.erroresFondo.general = err.error?.error || 'Error al actualizar'; if (err.status === 403) this.erroresFondo.clave = 'Clave incorrecta'; }
    });
  }

  // ---- MODAL INGRESO -----------------------------------------------
  abrirModalIngreso() { this.nuevoIngreso = { monto: 0, motivo: '' }; this.erroresIngreso = {}; this.mostrarModalIngreso = true; }
  cerrarModalIngreso() { this.mostrarModalIngreso = false; this.erroresIngreso = {}; }

  guardarIngreso() {
    this.erroresIngreso = {}; let valido = true;
    if (!this.nuevoIngreso.motivo.trim()) { this.erroresIngreso.motivo = 'El motivo es requerido'; valido = false; }
    if (!this.nuevoIngreso.monto || this.nuevoIngreso.monto <= 0) { this.erroresIngreso.monto = 'Ingresa un valor válido'; valido = false; }
    if (!valido) return;
    this.guardandoIngreso = true;
    this.http.post<any>(`${this.API}/ingresos`, { monto: this.nuevoIngreso.monto, motivo: this.nuevoIngreso.motivo.trim() }, { headers: this.getHeaders() }).subscribe({
      next: () => { this.guardandoIngreso = false; this.cerrarModalIngreso(); this.cargarDatos(); },
      error: () => { this.guardandoIngreso = false; this.erroresIngreso.general = 'Error al guardar'; }
    });
  }

  // ---- EDITAR INGRESO ----------------------------------------------
  abrirEditarIngreso(ingreso: Ingreso) { this.ingresoEditando = { ...ingreso }; this.erroresEditarIngreso = {}; this.mostrarEditarIngreso = true; }
  cerrarEditarIngreso() { this.mostrarEditarIngreso = false; this.erroresEditarIngreso = {}; }

  guardarEdicionIngreso() {
    this.erroresEditarIngreso = {}; let valido = true;
    if (!this.ingresoEditando.motivo?.trim()) { this.erroresEditarIngreso.motivo = 'El motivo es requerido'; valido = false; }
    if (!this.ingresoEditando.monto || this.ingresoEditando.monto <= 0) { this.erroresEditarIngreso.monto = 'Ingresa un valor válido'; valido = false; }
    if (!valido) return;
    this.guardandoEditarIngreso = true;
    this.http.put<any>(`${this.API}/ingresos/${this.ingresoEditando.id}`, { monto: this.ingresoEditando.monto, motivo: this.ingresoEditando.motivo!.trim() }, { headers: this.getHeaders() }).subscribe({
      next: () => { this.guardandoEditarIngreso = false; this.cerrarEditarIngreso(); this.cargarDatos(); },
      error: () => { this.guardandoEditarIngreso = false; this.erroresEditarIngreso.general = 'Error al guardar'; }
    });
  }

  // ---- MODAL EGRESO ------------------------------------------------
  abrirModalEgreso() {
    this.nuevoEgreso   = { detalle: '', responsable: this.getResponsablePorDefecto(), beneficiario: '', valor: 0 };
    this.erroresEgreso = {}; this.ventaAnticipo = null; this.ventasDelDia = [];
    this.mostrarModalEgreso = true;
  }

  cerrarModalEgreso() {
    this.mostrarModalEgreso = false; this.mostrarResponsableDropdown = false;
    this.mostrarBeneficiarioDropdown = false; this.mostrarVentasDropdown = false;
    this.ventaAnticipo = null; this.ventasDelDia = []; this.erroresEgreso = {};
  }

  private getResponsablePorDefecto(): string {
    const username = this.usernameActual.toLowerCase().trim();
    const u = this.usuarios.find(u => u.username.toLowerCase().trim() === username);
    return u ? u.username : '';
  }

  toggleResponsable() { this.mostrarResponsableDropdown = !this.mostrarResponsableDropdown; }
  seleccionarResponsable(v: string) { this.nuevoEgreso.responsable = v; this.mostrarResponsableDropdown = false; }

  toggleBeneficiario() { this.mostrarBeneficiarioDropdown = !this.mostrarBeneficiarioDropdown; }
  seleccionarBeneficiario(v: string) {
    this.nuevoEgreso.beneficiario = v; this.mostrarBeneficiarioDropdown = false;
    if (v === 'Retencion') {
      this.ventaAnticipo = null; this.cargarVentasDelDia();
    } else {
      this.ventaAnticipo = null; this.ventasDelDia = [];
    }
  }

  guardarEgreso() {
    this.erroresEgreso = {}; let valido = true;
    if (!this.nuevoEgreso.detalle.trim())   { this.erroresEgreso.detalle      = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.responsable)      { this.erroresEgreso.responsable  = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.beneficiario)     { this.erroresEgreso.beneficiario = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.valor || this.nuevoEgreso.valor <= 0) { this.erroresEgreso.valor = 'Valor inválido'; valido = false; }
    if (!valido) return;
    this.guardandoEgreso = true;
    this.http.post<Egreso>(`${this.API}/egresos`,
      { detalle: this.nuevoEgreso.detalle.trim(), responsable: this.nuevoEgreso.responsable, beneficiario: this.nuevoEgreso.beneficiario, valor: this.nuevoEgreso.valor },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { this.guardandoEgreso = false; this.cerrarModalEgreso(); this.cargarDatos(); },
      error: () => { this.guardandoEgreso = false; this.erroresEgreso.general = 'Error al guardar'; }
    });
  }

  // ---- EDITAR EGRESO -----------------------------------------------
  abrirEditar(egreso: Egreso) {
    this.egresoEditando = { ...egreso }; this.erroresEditar = {};
    this.mostrarResponsableDropdownEditar = false; this.mostrarBeneficiarioDropdownEditar = false;
    this.ventaAnticipoEditar = null;
    if (egreso.beneficiario === 'Retencion') this.cargarVentasDelDia();
    this.mostrarEditarModal = true;
  }

  cerrarEditar() {
    this.mostrarEditarModal = false; this.mostrarResponsableDropdownEditar = false;
    this.mostrarBeneficiarioDropdownEditar = false; this.mostrarVentasDropdownEditar = false;
    this.ventaAnticipoEditar = null; this.erroresEditar = {};
  }

  toggleResponsableEditar() { this.mostrarResponsableDropdownEditar = !this.mostrarResponsableDropdownEditar; }
  seleccionarResponsableEditar(v: string) { this.egresoEditando.responsable = v; this.mostrarResponsableDropdownEditar = false; }

  toggleBeneficiarioEditar() { this.mostrarBeneficiarioDropdownEditar = !this.mostrarBeneficiarioDropdownEditar; }
  seleccionarBeneficiarioEditar(v: string) {
    this.egresoEditando.beneficiario = v; this.mostrarBeneficiarioDropdownEditar = false;
    if (v === 'Retencion') {
      this.ventaAnticipoEditar = null; this.cargarVentasDelDia();
    } else {
      this.ventaAnticipoEditar = null;
    }
  }

  guardarEdicion() {
    this.erroresEditar = {}; let valido = true;
    if (!this.egresoEditando.detalle.trim())  { this.erroresEditar.detalle      = 'Requerido'; valido = false; }
    if (!this.egresoEditando.responsable)     { this.erroresEditar.responsable  = 'Requerido'; valido = false; }
    if (!this.egresoEditando.beneficiario)    { this.erroresEditar.beneficiario = 'Requerido'; valido = false; }
    if (!this.egresoEditando.valor || this.egresoEditando.valor <= 0) { this.erroresEditar.valor = 'Valor inválido'; valido = false; }
    if (!valido) return;
    this.guardandoEdicion = true;
    this.http.put<Egreso>(`${this.API}/egresos/${this.egresoEditando.id}`,
      { detalle: this.egresoEditando.detalle.trim(), responsable: this.egresoEditando.responsable, beneficiario: this.egresoEditando.beneficiario, valor: this.egresoEditando.valor },
      { headers: this.getHeaders() }
    ).subscribe({
      next: (updated) => { this.egresos = this.egresos.map(e => e.id === updated.id ? updated : e); this.guardandoEdicion = false; this.cerrarEditar(); },
      error: () => { this.guardandoEdicion = false; this.erroresEditar.general = 'Error al guardar'; }
    });
  }

  // ---- BORRAR ------------------------------------------------------
  confirmarBorrarIngreso(ingreso: Ingreso) { this.itemABorrar = { tipo: 'ingreso', id: ingreso.id! }; this.mostrarConfirmarBorrar = true; }
  confirmarBorrarEgreso(egreso: Egreso)    { this.itemABorrar = { tipo: 'egreso',  id: egreso.id!  }; this.mostrarConfirmarBorrar = true; }
  cancelarBorrar() { this.mostrarConfirmarBorrar = false; this.itemABorrar = null; }

  ejecutarBorrar() {
    if (!this.itemABorrar) return;
    this.borrando = true;
    const url = this.itemABorrar.tipo === 'ingreso'
      ? `${this.API}/ingresos/${this.itemABorrar.id}`
      : `${this.API}/egresos/${this.itemABorrar.id}`;
    this.http.delete(url, { headers: this.getHeaders() }).subscribe({
      next: () => {
        if (this.itemABorrar!.tipo === 'ingreso') {
          this.ingresos = this.ingresos.filter(i => i.id !== this.itemABorrar!.id);
        } else {
          this.egresos  = this.egresos.filter(e => e.id !== this.itemABorrar!.id);
        }
        this.borrando = false; this.cancelarBorrar();
      },
      error: () => { this.borrando = false; this.cancelarBorrar(); }
    });
  }

  // ---- MENU --------------------------------------------------------
  abrirMenu()    { this.menuAbierto = true; }
  cerrarMenu()   { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
}