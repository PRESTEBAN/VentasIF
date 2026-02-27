import { TestBed } from '@angular/core/testing';

import { CarritoEstado } from './carrito-estado';

describe('CarritoEstado', () => {
  let service: CarritoEstado;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CarritoEstado);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
