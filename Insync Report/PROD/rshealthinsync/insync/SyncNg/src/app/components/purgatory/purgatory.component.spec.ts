import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PurgatoryComponent } from './purgatory.component';

describe('PurgatoryComponent', () => {
  let component: PurgatoryComponent;
  let fixture: ComponentFixture<PurgatoryComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PurgatoryComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PurgatoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
