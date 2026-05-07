import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BucketLogViewerComponent } from './bucket-log-viewer.component';

describe('BucketLogViewerComponent', () => {
  let component: BucketLogViewerComponent;
  let fixture: ComponentFixture<BucketLogViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ BucketLogViewerComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(BucketLogViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
