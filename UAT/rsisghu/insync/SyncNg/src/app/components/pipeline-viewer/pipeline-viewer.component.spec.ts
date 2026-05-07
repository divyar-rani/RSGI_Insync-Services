import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PipelineViewerComponent } from './pipeline-viewer.component';

describe('PipelineViewerComponent', () => {
  let component: PipelineViewerComponent;
  let fixture: ComponentFixture<PipelineViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ PipelineViewerComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PipelineViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
