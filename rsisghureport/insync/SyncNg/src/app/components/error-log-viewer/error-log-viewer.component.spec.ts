import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ErrorLogViewerComponent } from './error-log-viewer.component';

describe('ErrorLogViewerComponent', () => {
  let component: ErrorLogViewerComponent;
  let fixture: ComponentFixture<ErrorLogViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ErrorLogViewerComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ErrorLogViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
