import { FabricImage } from 'fabric'
import type { Position, PositionPair, BoundriesEx, OCache, CornerPoints } from './types'
import { ObjectPool } from './ObjectPool';

export class ImageProcessor {
  private oCache: OCache;
  private xCanvas: OffscreenCanvas;
  private xCtx: OffscreenCanvasRenderingContext2D;
  private pool: ObjectPool;

  constructor(pool: ObjectPool) {
    this.oCache = new Map();
    this.xCanvas = new OffscreenCanvas(0,0);
    this.xCtx = this.xCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
    this.pool = pool;
  }

  getPixelBoundries(image: FabricImage, imBounds: BoundriesEx): BoundriesEx {
    const cacheState = this._createCacheState(image);
    if (this.oCache.has(image) && this.oCache.get(image)!.state === cacheState) {
      return this.oCache.get(image)!.cache;
    }
    const result = this._processImageData(this._getImageData(image, imBounds.width, imBounds.height));
    if (this.oCache.has(image)) {
      const store = this.oCache.get(image)!;
      store.state = cacheState;
      this.pool.applyBoundries(store.cache, result);
      this.pool.releaseBoundriesExObject(result);
    } else {
      this.oCache.set(image, { state: cacheState, cache: result });
    }
    return this.oCache.get(image)!.cache;
  }

  getCachedPixelBoundries(image: FabricImage): BoundriesEx | undefined{
    if (this.oCache.has(image)) {
      return this.oCache.get(image)!.cache;
    }
    return undefined;
  }

  updateCached(image: FabricImage, imBounds: BoundriesEx): void {
    const cacheState = this._createCacheState(image);
    if (this.oCache.has(image) && this.oCache.get(image)!.state === cacheState) {
      return;
    }
    const result = this._processImageData(this._getImageData(image, imBounds.width, imBounds.height));
    if (this.oCache.has(image)) {
      const store = this.oCache.get(image)!;
      store.state = cacheState;
      this.pool.applyBoundries(store.cache, result);
      this.pool.releaseBoundriesExObject(result);
    } else {
      this.oCache.set(image, { state: cacheState, cache: result });
    }
  }

  removeCached(image: FabricImage): void {
    if (this.oCache.has(image)) {
      const boundariesExObject = this.oCache.get(image)?.cache;
      if (boundariesExObject) {
        this.pool.releaseBoundriesExObject(boundariesExObject);
      }
      this.oCache.delete(image)
    }
  }

  clearCache(): void {
    // does not release objs back into pool yet.
    this.oCache.clear();
  }

  getBoundriesPooled(angle: number, corners: CornerPoints): BoundriesEx {
    return this._getBoundries(angle, corners);
  }

  getImageOffsetsPooled(imBounds: BoundriesEx, pxDims: BoundriesEx): BoundriesEx {
    // cant release pxDims cause ref held by cache
    return this._getImageOffsets(imBounds, pxDims);
  }

  getXOriginsPooled(angle: number): PositionPair {
    return this._getXOrigins(angle);
  }

  getYOriginsPooled(angle: number): PositionPair {
    return this._getYOrigins(angle);
  }

  // protected

  protected _getImageOffsets(imBounds: BoundriesEx, pxDims: BoundriesEx): BoundriesEx {
    const top = imBounds.top + pxDims.top, bottom = imBounds.bottom - pxDims.bottom;
    const left = imBounds.left + pxDims.left, right = imBounds.right - pxDims.right;
    return this.pool.getBoundriesExObjectWithValues(top, left, bottom, right, right-left, bottom-top);
  }

  protected _processImageData(imageData: ImageData): BoundriesEx {
    const
      imageDataWidth = imageData.width,
      imageDataHeight = imageData.height,
      data = imageData.data;
  
    let
      minX = imageDataWidth,
      maxX = -1,
      minY = imageDataHeight,
      maxY = -1;
  
    // search min x
    for (let x = 0; x < imageDataWidth; x++) {
      for (let y = 0; y < imageDataHeight; y++) {
        // channel index = [y * (width * 4) + x * 4 + ?] (? : 0 = red | 1 = green | 2 = blue | 3 = alpha)
        const index = y * (imageDataWidth * 4) + x * 4 + 3;
        if (_isPixelOpaque(data[index]!)) {
          minX = x;
          break;
        }
      }
      if (minX !== imageDataWidth) break;
    }
  
    // search max x
    for (let x = imageDataWidth - 1; x >= 0; x--) {
      for (let y = 0; y < imageDataHeight; y++) {
        const index = y * (imageDataWidth * 4) + x * 4 + 3;
        if (_isPixelOpaque(data[index]!)) {
          maxX = x;
          break;
        }
      }
      if (maxX !== -1) break;
    }
  
    // if no visible pixels are found
    if (minX > maxX) {
      return this.pool.getBoundriesExObject();
    }
  
    // search min y
    for (let y = 0; y < imageDataHeight; y++) {
      for (let x = minX; x <= maxX; x++) {
        const index = y * (imageDataWidth * 4) + x * 4 + 3;
        if (_isPixelOpaque(data[index]!)) {
          minY = y;
          break;
        }
      }
      if (minY !== imageDataHeight) break;
    }
  
    // search max y
    for (let y = imageDataHeight - 1; y >= 0; y--) {
      for (let x = minX; x <= maxX; x++) {
        const index = y * (imageDataWidth * 4) + x * 4 + 3;
        if (_isPixelOpaque(data[index]!)) {
          maxY = y;
          break;
        }
      }
      if (maxY !== -1) break;
    }
  
    const
      w = maxX - minX + 1,
      h = maxY - minY + 1,
      l = minX,
      t = minY,
      b = imageDataHeight - h - t,
      r = imageDataWidth - w - l;

    return this.pool.getBoundriesExObjectWithValues(t, l, b, r, w, h);
  }

  protected _getImageData(image: FabricImage, bRectWidth: number, bRectHeight: number): ImageData {
    const ctx = this.xCtx;
    ctx.canvas.width = Math.ceil(bRectWidth);
    ctx.canvas.height = Math.ceil(bRectHeight);

    const scaleX = image.getScaledWidth() / image.width;
    const scaleY = image.getScaledHeight() / image.height;
  
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // clear canvas
    ctx.save(); // save ctx state before transforms
  
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2); // set canvas origin to center
  
    ctx.rotate(_degreesToRadians(image.angle)); // apply image rotation
    ctx.scale(scaleX, scaleY); // apply image scaling
  
    ctx.drawImage(image.getElement(), -image.width / 2, -image.height / 2, image.width, image.height);
  
    ctx.restore(); // restore ctx to state before transforms for future images
  
    return ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  protected _getBoundries(angle: number, coords: CornerPoints): BoundriesEx {
    const xO = this._getXOrigins(angle);
    const yO = this._getYOrigins(angle);
    const
      t = coords[yO[0] as Position].y,
      l = coords[xO[0] as Position].x,
      b = coords[yO[1] as Position].y,
      r = coords[xO[1] as Position].x;
    const result = this.pool.getBoundriesExObjectWithValues(t, l, b, r, r-l, b-t);
    this.pool.releasePositionPairObject(xO);
    this.pool.releasePositionPairObject(yO);
    return result;
  }

  protected _getYOrigins(angle: number): PositionPair {
    if (angle <= 90 ) return this.pool.getPositionPairObjectWithValues('tl', 'br');
    if (angle <= 180) return this.pool.getPositionPairObjectWithValues('bl', 'tr');
    if (angle <= 270) return this.pool.getPositionPairObjectWithValues('br', 'tl');
    return this.pool.getPositionPairObjectWithValues('tr', 'bl');
  }
  
  protected _getXOrigins(angle: number): PositionPair {
    if (angle <= 90 ) return this.pool.getPositionPairObjectWithValues('bl', 'tr');
    if (angle <= 180) return this.pool.getPositionPairObjectWithValues('br', 'tl');
    if (angle <= 270) return this.pool.getPositionPairObjectWithValues('tr', 'bl');
    return this.pool.getPositionPairObjectWithValues('tl', 'br');
  }

  protected _createCacheState(image: FabricImage): string {
    const
      a = Math.round(image.angle * 10000),
      x = Math.round(image.scaleX * 10000),
      y = Math.round(image.scaleY * 10000);
    return `a${a}x${x}y${y}`;
  }

}

function _isPixelOpaque(alpha: number): boolean { return alpha !== 0 }

function _degreesToRadians(degrees: number): number { return degrees * Math.PI / 180 }