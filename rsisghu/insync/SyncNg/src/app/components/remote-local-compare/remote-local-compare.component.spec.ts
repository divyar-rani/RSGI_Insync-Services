import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RemoteLocalCompareComponent } from './remote-local-compare.component';

describe('RemoteLocalCompareComponent', () => {
  let component: RemoteLocalCompareComponent;
  let fixture: ComponentFixture<RemoteLocalCompareComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ RemoteLocalCompareComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RemoteLocalCompareComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
