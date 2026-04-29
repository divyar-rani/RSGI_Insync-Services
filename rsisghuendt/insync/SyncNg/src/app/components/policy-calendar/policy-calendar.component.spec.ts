import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PolicyCalendarComponent } from './policy-calendar.component';

describe('PolicyCalendarComponent', () => {
  let component: PolicyCalendarComponent;
  let fixture: ComponentFixture<PolicyCalendarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PolicyCalendarComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PolicyCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
