import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ManagePolicyComponent } from './manage-policy.component';

describe('ManagePolicyComponent', () => {
  let component: ManagePolicyComponent;
  let fixture: ComponentFixture<ManagePolicyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ManagePolicyComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ManagePolicyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
