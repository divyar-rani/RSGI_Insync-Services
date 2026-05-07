import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TwigTestComponent } from './twig-test.component';

describe('TwigTestComponent', () => {
  let component: TwigTestComponent;
  let fixture: ComponentFixture<TwigTestComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TwigTestComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TwigTestComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
