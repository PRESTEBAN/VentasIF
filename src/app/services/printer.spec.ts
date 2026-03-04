import { TestBed } from '@angular/core/testing';

import { Printer } from './printer';

describe('Printer', () => {
  let service: Printer;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Printer);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
