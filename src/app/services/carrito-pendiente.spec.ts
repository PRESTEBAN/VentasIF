import { TestBed } from '@angular/core/testing';

import { CarritoPendiente } from './carrito-pendiente';

describe('CarritoPendiente', () => {
  let service: CarritoPendiente;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CarritoPendiente);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
