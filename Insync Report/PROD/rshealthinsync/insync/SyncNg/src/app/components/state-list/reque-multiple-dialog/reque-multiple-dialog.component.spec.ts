import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RequeMultipleDialogComponent } from './reque-multiple-dialog.component';

describe('RequeMultipleDialogComponent', () => {
  let component: RequeMultipleDialogComponent;
  let fixture: ComponentFixture<RequeMultipleDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RequeMultipleDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RequeMultipleDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
