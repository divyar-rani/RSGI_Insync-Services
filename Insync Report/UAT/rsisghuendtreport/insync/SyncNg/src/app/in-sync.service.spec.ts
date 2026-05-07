import { TestBed } from '@angular/core/testing';

import { InSyncService } from './in-sync.service';

describe('InSyncService', () => {
  let service: InSyncService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InSyncService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
