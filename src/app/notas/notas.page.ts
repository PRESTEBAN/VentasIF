import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

export interface Nota {
  id:             number;
  titulo:         string;
  texto:          string;
  usuario_id:     number;
  orden_id?:      number | null;
  autor_nombre:   string;
  autor_username: string;
  num_orden?:     number | null;
  created_at:     string;
  updated_at:     string;
}

export interface OrdenPreview {
  id:        number;
  num_orden: number;
}

@Component({
  selector: 'app-notas',
  templateUrl: 'notas.page.html',
  styleUrls: ['notas.page.scss'],
  standalone: false,
})
export class NotasPage implements OnInit, OnDestroy {

  private readonly API = 'https://ventasif-if-api.onrender.com/api/v1';

  // ── Estado UI ──────────────────────────────────────
  menuAbierto       = false;
  cargando          = false;
  usuarioActual     = '';
  usuarioActualNombre = '';
  terminoBusqueda   = '';

  // ── Datos ──────────────────────────────────────────
  notas:         Nota[]  = [];
  notasFiltradas: Nota[] = [];

  // ── Modal detalle ──────────────────────────────────
  notaDetalle: Nota | null = null;

  // ── Modal form (crear/editar) ──────────────────────
  mostrarFormModal = false;
  modoEditar       = false;
  guardando        = false;
  notaEditandoId: number | null = null;
  formNota = { titulo: '', texto: '', orden_id: null as number | null };
  errores: any = {};

  // Búsqueda de orden
  ordenPreview:       OrdenPreview | null = null;
  ordenNoEncontrada   = false;
  private ordenSearch$ = new Subject<number | null>();

  // ── Modal borrar ──────────────────────────────────
  mostrarConfirmarBorrar = false;
  notaABorrar: Nota | null = null;
  borrando = false;

  constructor(
    public router: Router,
    private authService: AuthService,
    private http: HttpClient,
  ) {}

  ngOnInit() {
    const user = this.authService.getUsuario();
    this.usuarioActual       = user?.username || '';
    this.usuarioActualNombre = user?.nombre
      ? `${user.nombre}${user.apellido ? ' ' + user.apellido : ''}`
      : user?.username || '';

    // Debounce para búsqueda de orden al tipear
    this.ordenSearch$.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(val => this._buscarOrden(val));
  }

  ionViewWillEnter() {
    this.cargarNotas();
  }

  ngOnDestroy() {
    this.ordenSearch$.complete();
  }

  // ── HTTP helpers ──────────────────────────────────
  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  // ── Carga de notas ────────────────────────────────
  cargarNotas() {
    this.cargando = true;
    this.http.get<Nota[]>(`${this.API}/notas`, { headers: this.getHeaders() }).subscribe({
      next: (data) => {
        this.notas         = data;
        this.notasFiltradas = data;
        this.cargando      = false;
        this.filtrar();
      },
      error: () => {
        this.notas = [];
        this.notasFiltradas = [];
        this.cargando = false;
      }
    });
  }

  // ── Filtro búsqueda ───────────────────────────────
  filtrar() {
    const t = this.terminoBusqueda.trim().toLowerCase();
    if (!t) { this.notasFiltradas = [...this.notas]; return; }
    this.notasFiltradas = this.notas.filter(n =>
      n.titulo.toLowerCase().includes(t) ||
      n.autor_nombre.toLowerCase().includes(t) ||
      n.texto.toLowerCase().includes(t)
    );
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.filtrar();
  }

  // ── Utilidades ────────────────────────────────────
  getIniciales(nombre: string): string {
    if (!nombre) return '?';
    const partes = nombre.trim().split(' ');
    if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
    return nombre.substring(0, 2).toUpperCase();
  }

  // ── Modal detalle ─────────────────────────────────
  abrirDetalle(nota: Nota) { this.notaDetalle = nota; }
  cerrarDetalle()          { this.notaDetalle = null; }

  // ── Modal crear ───────────────────────────────────
  abrirModalCrear() {
    this.modoEditar      = false;
    this.notaEditandoId  = null;
    this.formNota        = { titulo: '', texto: '', orden_id: null };
    this.errores         = {};
    this.ordenPreview    = null;
    this.ordenNoEncontrada = false;
    this.mostrarFormModal = true;
  }

  // ── Modal editar ──────────────────────────────────
  abrirModalEditar(nota: Nota) {
    this.modoEditar     = true;
    this.notaEditandoId = nota.id;
    this.formNota = {
      titulo:   nota.titulo,
      texto:    nota.texto,
      orden_id: nota.orden_id ?? null,
    };
    this.errores = {};
    this.ordenPreview = nota.num_orden
      ? { id: nota.orden_id!, num_orden: nota.num_orden }
      : null;
    this.ordenNoEncontrada = false;
    this.mostrarFormModal  = true;
  }

  cerrarFormModal() {
    this.mostrarFormModal  = false;
    this.ordenPreview      = null;
    this.ordenNoEncontrada = false;
    this.errores           = {};
  }

  // ── Búsqueda de orden ─────────────────────────────
  buscarOrden() {
    const val = this.formNota.orden_id;
    this.ordenPreview      = null;
    this.ordenNoEncontrada = false;
    this.ordenSearch$.next(val && +val > 0 ? +val : null);
  }

  private _buscarOrden(ordenId: number | null) {
    if (!ordenId) { this.ordenPreview = null; this.ordenNoEncontrada = false; return; }
    this.http.get<OrdenPreview>(`${this.API}/notas/verificar-orden/${ordenId}`, { headers: this.getHeaders() })
      .subscribe({
        next:  (o) => { this.ordenPreview = o; this.ordenNoEncontrada = false; },
        error: ()  => { this.ordenPreview = null; this.ordenNoEncontrada = true; }
      });
  }

  // ── Guardar nota (crear o editar) ─────────────────
  guardarNota() {
    this.errores = {};
    let valido = true;

    if (!this.formNota.titulo.trim()) {
      this.errores.titulo = 'El título es requerido'; valido = false;
    }
    if (!this.formNota.texto.trim()) {
      this.errores.texto = 'La nota no puede estar vacía'; valido = false;
    }
    if (!valido) return;

    // Si se ingresó un orden_id pero no se encontró, avisamos pero no bloqueamos
    const payload: any = {
      titulo:   this.formNota.titulo.trim(),
      texto:    this.formNota.texto.trim(),
      orden_id: this.formNota.orden_id && +this.formNota.orden_id > 0
                  ? +this.formNota.orden_id
                  : null,
    };

    this.guardando = true;

    if (this.modoEditar && this.notaEditandoId) {
      // PUT — editar
      this.http.put<Nota>(`${this.API}/notas/${this.notaEditandoId}`, payload, { headers: this.getHeaders() })
        .subscribe({
          next: (updated) => {
            this.notas = this.notas.map(n => n.id === updated.id ? updated : n);
            this.filtrar();
            this.guardando = false;
            this.cerrarFormModal();
          },
          error: () => {
            this.guardando = false;
            this.errores.general = 'Error al guardar, intenta de nuevo';
          }
        });
    } else {
      // POST — crear
      this.http.post<Nota>(`${this.API}/notas`, payload, { headers: this.getHeaders() })
        .subscribe({
          next: (nueva) => {
            this.notas = [nueva, ...this.notas];
            this.filtrar();
            this.guardando = false;
            this.cerrarFormModal();
          },
          error: () => {
            this.guardando = false;
            this.errores.general = 'Error al crear la nota, intenta de nuevo';
          }
        });
    }
  }

  // ── Borrar ────────────────────────────────────────
  confirmarBorrar(nota: Nota) {
    this.notaABorrar           = nota;
    this.mostrarConfirmarBorrar = true;
  }

  cancelarBorrar() {
    this.mostrarConfirmarBorrar = false;
    this.notaABorrar            = null;
  }

  borrarNota() {
    if (!this.notaABorrar?.id) return;
    this.borrando = true;
    this.http.delete(`${this.API}/notas/${this.notaABorrar.id}`, { headers: this.getHeaders() })
      .subscribe({
        next: () => {
          this.notas = this.notas.filter(n => n.id !== this.notaABorrar!.id);
          this.filtrar();
          this.borrando = false;
          this.cancelarBorrar();
        },
        error: () => {
          this.borrando = false;
          this.cancelarBorrar();
        }
      });
  }

  // ── Navegación / Menú ─────────────────────────────
  abrirMenu() { this.menuAbierto = true; }
  cerrarMenu() { this.menuAbierto = false; }
  cerrarSesion() { this.authService.logout(); this.menuAbierto = false; this.router.navigate(['/login']); }

}