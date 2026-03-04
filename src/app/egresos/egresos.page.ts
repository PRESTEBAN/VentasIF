import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface Egreso {
  id?: number;
  detalle: string;
  responsable: string;
  beneficiario: string;
  valor: number;
  fecha?: string;
}

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  username: string;
}

@Component({
  selector: 'app-egresos',
  templateUrl: 'egresos.page.html',
  styleUrls: ['egresos.page.scss'],
  standalone: false,
})
export class EgresosPage implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  menuAbierto   = false;
  usuarioActual = '';

  private pollingInterval: any = null;
  private readonly POLLING_MS  = 15000;

  // ---- CALENDARIO ----
  fechaSeleccionada: Date = new Date();
  semanaBase: Date        = new Date();   // ← primer día visible de la tira
  semanaActual: Date[]    = [];
  mostrarDatePicker       = false;

  // ---- DATOS ----
  egresos:  Egreso[]  = [];
  usuarios: Usuario[] = [];
  cargando = false;

  get totalEgresos(): number {
    return this.egresos.reduce((acc, e) => acc + +e.valor, 0);
  }

  // ---- MODAL ----
  mostrarModal = false;
  guardando    = false;
  mostrarBeneficiarioDropdown = false;
  mostrarResponsableDropdown  = false;
  nuevoEgreso: Egreso = { detalle: '', responsable: '', beneficiario: '', valor: 0 };
  errores: any = {};

  // ---- BORRAR ----
  mostrarConfirmarBorrar = false;
  egresoABorrar: Egreso | null = null;
  borrando = false;

  readonly OPCIONES_ESPECIALES = ['Vehiculo', 'Fabrica'];

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual = user?.nombre || user?.username || '';

    // semanaBase = hoy - 3 para que hoy quede centrado visualmente
    const base = new Date(this.fechaSeleccionada);
    base.setDate(base.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
  }

  ionViewWillEnter() {
    this.cargarUsuarios();
    this.cargarEgresos();
    this.iniciarPolling();
  }

  ionViewWillLeave() { this.detenerPolling(); }
  ngOnDestroy()      { this.detenerPolling(); }

  iniciarPolling() {
    this.detenerPolling();
    if (!this.authService.estaLogueado()) return;
    this.pollingInterval = setInterval(() => this.cargarEgresosSilencioso(), this.POLLING_MS);
  }

  detenerPolling() {
    if (this.pollingInterval) { clearInterval(this.pollingInterval); this.pollingInterval = null; }
  }

  cargarEgresosSilencioso() {
    if (!this.authService.estaLogueado()) return;
    const fechaStr = this.formatearFecha(this.fechaSeleccionada);
    this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${fechaStr}`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          const idsActuales = new Set(this.egresos.map(e => e.id));
          data.forEach(e => { if (!idsActuales.has(e.id)) this.egresos = [...this.egresos, e]; });
        },
        error: () => {}
      });
  }

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ---- USUARIOS — filtra Admin ----
  cargarUsuarios() {
    this.http.get<Usuario[]>(`${this.API}/egresos/usuarios`, { headers: this.getHeaders() })
      .subscribe({
        next: (data) => {
          this.usuarios = data.filter(u =>
            u.username?.toLowerCase() !== 'admin' &&
            u.nombre?.toLowerCase()   !== 'admin'
          );
        },
        error: () => {}
      });
  }

  get usuariosSinAdmin(): Usuario[] { return this.usuarios; }

  // ---- CALENDARIO ----

  // Genera 7 días consecutivos desde `base` hacia adelante (sin centrar)
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
    // retrocede exactamente 7 días desde el primer día visible
    const nueva = new Date(this.semanaBase);
    nueva.setDate(nueva.getDate() - 7);
    this.semanaBase = nueva;
    this.generarSemana(nueva);
    // selecciona el último día de la tira al retroceder
    this.fechaSeleccionada = new Date(this.semanaActual[6]);
    this.cargarEgresos();
  }

  semanaSiguiente() {
    // avanza exactamente 7 días desde el primer día visible
    const nueva = new Date(this.semanaBase);
    nueva.setDate(nueva.getDate() + 7);
    this.semanaBase = nueva;
    this.generarSemana(nueva);
    // selecciona el primer día de la tira al avanzar
    this.fechaSeleccionada = new Date(this.semanaActual[0]);
    this.cargarEgresos();
  }

  esSemanaActual(): boolean {
    // deshabilita la flecha si el último día de la tira ya llegó a hoy o futuro
    const ultimoDia = new Date(this.semanaActual[this.semanaActual.length - 1]);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    ultimoDia.setHours(0, 0, 0, 0);
    return ultimoDia >= hoy;
  }

  seleccionarDia(dia: Date) {
    // solo cambia el día seleccionado — semanaBase NO se mueve
    this.fechaSeleccionada = new Date(dia);
    this.cargarEgresos();
  }

  esDiaSeleccionado(dia: Date): boolean { return dia.toDateString() === this.fechaSeleccionada.toDateString(); }
  esHoy(dia: Date): boolean { return dia.toDateString() === new Date().toDateString(); }

  abrirDatePicker()  { this.mostrarDatePicker = true;  }
  cerrarDatePicker() { this.mostrarDatePicker = false; }

  onDatePickerChange(event: any) {
    const valor = event.target.value;
    if (!valor) return;
    const [anio, mes, dia] = valor.split('-').map(Number);
    const nueva = new Date(anio, mes - 1, dia);
    this.fechaSeleccionada = nueva;
    // date picker resetea el ancla centrada en la fecha elegida
    const base = new Date(nueva);
    base.setDate(nueva.getDate() - 3);
    this.semanaBase = base;
    this.generarSemana(this.semanaBase);
    this.cargarEgresos();
    this.cerrarDatePicker();
  }

  formatearFecha(fecha: Date): string {
    const d = fecha.getDate().toString().padStart(2, '0');
    const m = (fecha.getMonth() + 1).toString().padStart(2, '0');
    return `${fecha.getFullYear()}-${m}-${d}`;
  }

  // ---- EGRESOS ----
  cargarEgresos() {
    this.cargando = true; this.egresos = [];
    this.http.get<Egreso[]>(`${this.API}/egresos?fecha=${this.formatearFecha(this.fechaSeleccionada)}`, { headers: this.getHeaders() })
      .subscribe({ next: (data) => { this.egresos = data; this.cargando = false; }, error: () => { this.egresos = []; this.cargando = false; } });
  }

  // ---- MODAL ----
  abrirModal() {
    this.nuevoEgreso = { detalle: '', responsable: this.usuarios[0]?.username || '', beneficiario: '', valor: 0 };
    this.errores = {};
    this.mostrarModal = true;
  }

  toggleResponsable() { this.mostrarResponsableDropdown = !this.mostrarResponsableDropdown; }

  seleccionarResponsable(valor: string) {
    this.nuevoEgreso.responsable = valor;
    this.mostrarResponsableDropdown = false;
  }

  toggleBeneficiario() { this.mostrarBeneficiarioDropdown = !this.mostrarBeneficiarioDropdown; }

  seleccionarBeneficiario(valor: string) {
    this.nuevoEgreso.beneficiario = valor;
    this.mostrarBeneficiarioDropdown = false;
  }

  getLabelBeneficiario(username: string): string {
    const u = this.usuarios.find(u => u.username === username);
    return u ? `${u.nombre} ${u.apellido}` : username;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.mostrarBeneficiarioDropdown = false;
    this.mostrarResponsableDropdown  = false;
    this.errores = {};
  }

  guardarEgreso() {
    this.errores = {};
    let valido = true;
    if (!this.nuevoEgreso.detalle.trim())    { this.errores.detalle      = 'El detalle es requerido'; valido = false; }
    if (!this.nuevoEgreso.responsable)       { this.errores.responsable  = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.beneficiario)      { this.errores.beneficiario = 'Requerido'; valido = false; }
    if (!this.nuevoEgreso.valor || this.nuevoEgreso.valor <= 0) { this.errores.valor = 'Ingresa un valor válido'; valido = false; }
    if (!valido) return;

    this.guardando = true;
    this.http.post<Egreso>(`${this.API}/egresos`,
      { detalle: this.nuevoEgreso.detalle.trim(), responsable: this.nuevoEgreso.responsable, beneficiario: this.nuevoEgreso.beneficiario, valor: this.nuevoEgreso.valor },
      { headers: this.getHeaders() }
    ).subscribe({
      next: () => { this.guardando = false; this.cerrarModal(); this.cargarEgresos(); },
      error: () => { this.guardando = false; this.errores.general = 'Error al guardar, intenta de nuevo'; }
    });
  }

  // ---- BORRAR ----
  confirmarBorrar(egreso: Egreso) {
    this.egresoABorrar = egreso;
    this.mostrarConfirmarBorrar = true;
  }

  cancelarBorrar() {
    this.mostrarConfirmarBorrar = false;
    this.egresoABorrar = null;
  }

  borrarEgreso() {
    if (!this.egresoABorrar?.id) return;
    this.borrando = true;
    this.http.delete(`${this.API}/egresos/${this.egresoABorrar.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          this.egresos = this.egresos.filter(e => e.id !== this.egresoABorrar!.id);
          this.borrando = false;
          this.cancelarBorrar();
        },
        error: () => {
          this.borrando = false;
          this.cancelarBorrar();
        }
      });
  }

  // ---- MENU ----
  abrirMenu()  { this.menuAbierto = true;  }
  cerrarMenu() { this.menuAbierto = false; }

  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }
  irAClientes()   { this.cerrarMenu(); this.router.navigate(['/clientes']);   }
  irAHistorial()  { this.cerrarMenu(); this.router.navigate(['/historial']);  }
  irAInventario() { this.cerrarMenu(); this.router.navigate(['/inventario']); }
  irAEgresos()    { this.cerrarMenu(); this.router.navigate(['/egresos']);    }
}