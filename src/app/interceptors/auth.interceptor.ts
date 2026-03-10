import { Injectable } from '@angular/core';
import {
  HttpInterceptor, HttpRequest, HttpHandler,
  HttpErrorResponse, HttpEvent
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, filter, take, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  private refrescando = false;
  private refreshSubject = new BehaviorSubject<string | null>(null);

  constructor(private authService: AuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // No interceptar las llamadas de login/refresh
    if (req.url.includes('/auth/login') || req.url.includes('/auth/refresh')) {
      return next.handle(req);
    }

    const token = this.authService.getToken();
    const authReq = token ? this.agregarToken(req, token) : req;

    return next.handle(authReq).pipe(
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401) {
          return this.manejarToken401(req, next);
        }
        return throwError(() => error);
      })
    );
  }

  private agregarToken(req: HttpRequest<any>, token: string): HttpRequest<any> {
    return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  private manejarToken401(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.authService.getRefreshToken()) {
      this.authService.logout();
      this.router.navigate(['/login']);
      return throwError(() => new Error('Sin refresh token'));
    }

    if (this.refrescando) {
      // Esperar a que termine el refresh en curso
      return this.refreshSubject.pipe(
        filter(token => token !== null),
        take(1),
        switchMap(token => next.handle(this.agregarToken(req, token!)))
      );
    }

    this.refrescando = true;
    this.refreshSubject.next(null);

    return this.authService.refreshToken().pipe(
      switchMap(data => {
        this.refrescando = false;
        this.authService.guardarNuevoToken(data.token, data.refreshToken);
        this.refreshSubject.next(data.token);
        return next.handle(this.agregarToken(req, data.token));
      }),
      catchError(err => {
        this.refrescando = false;
        this.authService.logout();
        this.router.navigate(['/login']);
        return throwError(() => err);
      })
    );
  }
}