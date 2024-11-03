import type { TOriginX, TOriginY, FabricImage } from 'fabric'

export interface WorkerPayload {
  scaleX: number,
  scaleY: number,
  angle: number,
  imgBitmap: ImageBitmap,
  xCanvas: OffscreenCanvas,
};

export interface Controls {
  tl: boolean,
  mt: boolean,
  mtr: boolean,
  tr: boolean,
  ml: boolean,
  mr: boolean,
  bl: boolean,
  mb: boolean,
  br: boolean,
}

export interface FabrikOptions {
  artboardWidth: number,
  artboardHeight: number,
  artboardDPI?: number,
  updateCacheOnImageModified?: boolean,
  constrainImageOnModified?: boolean,
}

export interface CornerPoints {
  tl: {x: number, y: number},
  tr: {x: number, y: number},
  bl: {x: number, y: number},
  br: {x: number, y: number},
}

export interface Origin {
  originX: TOriginX,
  originY: TOriginY,
}

export type Position = "tl" | "tr" | "bl" | "br";
export type PositionPair = [Position | '', Position | ''];
export type TOriginXY = { originX: TOriginX, originY: TOriginY };
export type TOriginXYN = { originX: TOriginX | 'none', originY: TOriginY | 'none' };
export type Boundries = { top: number, left: number, bottom: number, right: number };
export type Dimensions = { width: number, height: number };
export type BoundriesEx = Boundries & Dimensions;
export type OCacheProps = { state: string, cache: BoundriesEx };
export type OCache = Map<FabricImage, OCacheProps>;
export type TransformCache = Map<FabricImage, { angle: number, scaleX: number, scaleY: number }>;
export type Artboard = {width: number, reciprocalX: number, height: number, reciprocalY: number, dpi: number};