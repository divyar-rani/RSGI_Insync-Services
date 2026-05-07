import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RevfeedComponent } from './revfeed.component';

describe('RevfeedComponent', () => {
  let component: RevfeedComponent;
  let fixture: ComponentFixture<RevfeedComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RevfeedComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RevfeedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
