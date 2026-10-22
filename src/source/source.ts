export type SourceKind = 'image' | 'video' | 'webcam';

/** Anything the pipeline can read pixels from. Video sources change every frame. */
export interface Source {
  kind: SourceKind;
  name: string;
  /** Size of `element` as uploaded to the GPU. */
  width: number;
  height: number;
  /** Size before any downscale on load. */
  originalWidth: number;
  originalHeight: number;
  element: ImageBitmap | HTMLVideoElement;
  /** Original encoded source, retained for portable projects. */
  file?: File;
  /** Stable palette sampling frame for video sources. */
  paletteElement?: ImageBitmap;
  dispose(): void;
}

export function isVideo(s: Source | null): s is Source & { element: HTMLVideoElement } {
  return !!s && s.kind !== 'image';
}
