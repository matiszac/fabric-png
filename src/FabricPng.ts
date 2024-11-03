import { Canvas, FabricImage, Point } from 'fabric';
import { ImageProcessor } from './ImageProcessor';
import { ObjectPool } from './ObjectPool'
import type { CanvasEvents, TOriginX, TOriginY, TOptions, ImageProps } from 'fabric'
import type {
  Controls,
  FabrikOptions,
  Position,
  TOriginXY,
  TOriginXYN,
  BoundriesEx,
  Artboard,
  TransformCache,
  CornerPoints,
} from './types'

export default class FabrikPng {
  private canvas: Canvas;
  private artboard: Artboard;
  private pool: ObjectPool;
  private ip: ImageProcessor;
  private transformCache: TransformCache;
  private isHandlingEvent: boolean;
  private constrainImageOnModified: boolean;
  defaultImageOptions: TOptions<ImageProps>;
  defaultContolsVisibility: Partial<Controls>;
  
  constructor(
    canvas: Canvas,
    {
      artboardWidth = 2550,
      artboardHeight = 3300,
      artboardDPI = 300,
      constrainImageOnModified = true,
    }: FabrikOptions) {
    this.canvas = canvas;
    this.artboard = {
      width: artboardWidth,
      reciprocalX: 1/artboardWidth,
      height: artboardHeight,
      reciprocalY: 1/artboardHeight,
      dpi: artboardDPI,
    };
    this.pool = new ObjectPool();
    this.ip = new ImageProcessor(this.pool);
    this.transformCache = new Map();
    this.isHandlingEvent = false;

    // defaults for image controls
    this.defaultImageOptions = {
      //originX: 'center',
      //originY: 'center',
      transparentCorners: false,
      strokeWidth: 0,
      cornerStyle: 'circle',
      cornerSize: 12,
      hasBorders: true,
      borderColor: '#1E90FF',
      cornerColor: '#FFF',
      cornerStrokeColor: '#C4C4C4',
    };

    this.defaultContolsVisibility = {
      tl: true,
      tr: true,
      bl: true,
      br: true,
      mtr: true,
      mt: false,
      mb: false,
      ml: false,
      mr: false,
    };

    // flags
    this.constrainImageOnModified = constrainImageOnModified;
   
    // init event listeners
    this.canvas.on('object:removed', (event) => this._onObjectRemoved(event));
    this.canvas.on('object:modified', (event) => this._onObjectModified(event));
    this.canvas.on('selection:created', (event) => this._onSelectionCreated(event));
    this.canvas.on('selection:updated', (event) => this._onSelectionUpdated(event));
    //this.canvas.on('object:scaling', (event) => this._onObjectScaling(event));
  }

  public log (): void {
    const image = this._getSelectedImage();
    if (!image) return;
    const padding = _inchesToPixels(0.10, this.artboard.dpi);
    this._createMatrixCopies(image, 10, 10, padding);
  }

  public log2 (): void {
    //
  }

  public canvasHasSelection(): boolean {
    return this.canvas.getActiveObjects().length > 0;
  }

  public setConstrainImageOnModified (value: boolean): void {
    this.constrainImageOnModified = value;
  }

  public canvasScaleToWidth(width: number): void {
    _scaleCanvasToWidth(this.canvas, this.artboard, width);
  }

  public canvasScaleToHeight(height: number): void {
    _scaleCanvasToHeight(this.canvas, this.artboard, height);
  }

  public artboardSetWidth(width: number): void {
    _setArtboardWidth(this.artboard, this.canvas, width);
  }

  public artboardSetHeight(height: number): void {
    _setArtboardHeight(this.artboard, this.canvas, height);
  }

  public artboardSetDPI(dpi: number): void {
    _setArtboardDPI(this.artboard, dpi);
  }

  // maybe a little less useless
  public imgDeleteSelected(): void {
    const image = this._getSelectedImage()
    if(!image) return;
    this.canvas.remove(image);
  }

  public imgDuplicateSelected(xOffset: number = 0, yOffset: number = 0) {
    const image = this._getSelectedImage()
    if(!image) return;
    this._duplicateImage(image, xOffset, yOffset);
  }

  public imgDuplicateSelectedRight() {
    const image = this._getSelectedImage()
    if(!image) return;
    const { width: xOffset } = this._getPixelBoundries(image);
    this._duplicateImage(image, xOffset, 0);
  }

  public imgDuplicateSelectedDown() {
    const image = this._getSelectedImage()
    if(!image) return;
    const { height: yOffset } = this._getPixelBoundries(image);
    this._duplicateImage(image, 0, yOffset);
  }

  public imgMoveSelectedX(xOffset: number) {
    const image = this._getSelectedImage();
    if (!image) return;
    this._moveImageXY(image, xOffset, 0);
    this.canvas.requestRenderAll();
  }

  public imgMoveSelectedY(yOffset: number) {
    const image = this._getSelectedImage();
    if (!image) return;
    this._moveImageXY(image, 0, yOffset);
    this.canvas.requestRenderAll();
  }


  // kind of unnecessary as canvas has it built in.
  public imgGetSelected (): FabricImage | undefined {
    return this._getSelectedImage();
  }

  public imgGetBoundries (): BoundriesEx | undefined {
    const image = this._getSelectedImage();
    if (!image) return undefined;
    const corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      result = this.ip.getBoundriesPooled(image.angle, corners);
    this.pool.releaseCornerPointsObject(corners);
    return result;
  }

  public imgGetPixelBoundries (): BoundriesEx | undefined {
    const image = this._getSelectedImage();
    if (!image) return undefined;
    return this._getPixelBoundries(image);
  }

  // manual call to update cache
  public imgUpdatePixelCache (): void {
    const image = this._getSelectedImage();
    if (!image) return;
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners);
    this.ip.updateCached(image, imBounds);
    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
  }

  public imgConstrainToCanvas (): void {
    const image = this._getSelectedImage();
    if (!image) return;
    this._constrainImageSizeAndPosition(image);
  }

  public imgScalePixelDimensionsToCanvas (): void { 
    const image = this._getSelectedImage();
    if (!image) return;
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      { width: bRectWidth, height: bRectHeight } = imBounds,
      pxDims = this.ip.getPixelBoundries(image, imBounds),
      { width: pxWidth, height: pxHeight } = pxDims,
      zoom = this.canvas.getZoom(),
      unscaledCanvasXMax = this._getUnscaledCanvasWidth(zoom),
      unscaledCanvasYMax = this._getUnscaledCanvasHeight(zoom);
    // 1px padding all around with : -2 to width/height
    this._scalePixelDimensionsToSize(
      image,
      bRectWidth, bRectHeight,
      pxWidth, pxHeight,
      unscaledCanvasXMax - 2, unscaledCanvasYMax - 2
    );
    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
  }

  public imgScalePixelWidthTo (width: number): void { // pass values or handle in protected versions as is ?
    const image = this._getSelectedImage();
    if (!image) return;
    this._scalePixelWidthTo(image, width);
  }

  public imgScalePixelHeightTo (height: number): void { 
    const image = this._getSelectedImage();
    if (!image) return;
    this._scalePixelHeightTo(image, height);
  }

  public imgSetPositionOnCanvas (originX: TOriginX | 'none', originY: TOriginY | 'none') {
    const image = this._getSelectedImage();
    if (!image) return;
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxDims = this.ip.getPixelBoundries(image, imBounds);
    this._resetImagePosition(image, corners, pxDims, originX, originY);
    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
  }

  public imgIsOffCanvas (): boolean | undefined {
    const image = this._getSelectedImage();
    if (!image) return undefined;
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxDims = this.ip.getPixelBoundries(image, imBounds),
      pxBounds = this.ip.getImageOffsetsPooled(imBounds, pxDims),
      zoom = this.canvas.getZoom(),
      unscaledCanvasXMax = this._getUnscaledCanvasWidth(zoom),
      unscaledCanvasYMax = this._getUnscaledCanvasHeight(zoom);
    const result = _isImageOffCanvas(pxBounds, unscaledCanvasXMax,unscaledCanvasYMax);
    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
    this.pool.releaseBoundriesExObject(pxBounds);
    return result;
  }

  public getApproximateDimensions(image: FabricImage) {
    return this._getApproximatePixelDimensions(image);
  }

  // ----

  // [ ] - if creating movingXY funcs, run FabricImage.setCoords().. same for rotate.

  // [ ] - canvasChangeWidth , canvasChangetHeight -- no proportional scaling, will affect artboard width/height

  // [ ] - canvas zoom ?? this will affect canvas width and height. 

  // [ ] - imgMoveX 

  // [ ] - imgMoveY 

  // ----

  protected _moveImageXY(image: FabricImage, xOffset: number, yOffset: number){
    const center = image.getCenterPoint();
    center.setXY(center.x + xOffset, center.y + yOffset);
    image.setPositionByOrigin(center, 'center', 'center');
    image.setCoords();
  }

  protected _duplicateImage(image: FabricImage, xOffset: number, yOffset: number) {
    const center = image.getCenterPoint();
    image.clone(Object.keys(this.defaultImageOptions)).then((img) => {
      img.setControlsVisibility(this.defaultContolsVisibility);
      img.setPositionByOrigin(new Point(center.x + xOffset, center.y + yOffset), 'center', 'center');
      this.canvas.add(img);
      this.canvas.setActiveObject(img);
      this._constrainImageSizeAndPosition(img);
    });
  }

  protected _getPixelBoundries(image: FabricImage): BoundriesEx {
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxBounds = this.ip.getPixelBoundries(image, imBounds);
    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
    return pxBounds;
  }

  // maybe have an option for position only, or size only
  protected _constrainImageSizeAndPosition(image: FabricImage): void {
    let resize = false;
    const
      zoom = this.canvas.getZoom(),
      xMax = this._getUnscaledCanvasWidth(zoom),
      yMax = this._getUnscaledCanvasHeight(zoom);
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()), // might be unnecessary
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxDims = this.ip.getPixelBoundries(image, imBounds),
      pxBounds = this.ip.getImageOffsetsPooled(imBounds, pxDims),
      { width: imgPxWidth, height: imgPxHeight } = pxDims,
      { width: bRectWidth, height: bRectHeight } = imBounds;

    if (imgPxWidth > xMax || imgPxHeight > yMax) {
      this._scalePixelDimensionsToSize(image, bRectWidth, bRectHeight, imgPxWidth, imgPxHeight, xMax, yMax);
      resize = true;
    }

    let originX: TOriginX | 'none';
    let originY: TOriginY | 'none';
    let updatedBounds: BoundriesEx;

    // check where off canvas, set x /y as left-right/top-bottom, none/none is not off canvas
    if (resize) {
      this.pool.applyCorners(corners, image.calcACoords());
      updatedBounds = this.ip.getBoundriesPooled(image.angle, corners);
      const updatedPxBounds = this.ip.getPixelBoundries(image, updatedBounds);
      const result = _whereIsImageOffCanvas(updatedPxBounds, xMax, yMax);
      originX = result.originX;
      originY = result.originY;
    } else {
      const result = _whereIsImageOffCanvas(pxBounds, xMax, yMax);
      originX = result.originX;
      originY = result.originY;
    }

    // if none/none, do nothing
    if (originX === 'none' && originY === 'none') {
      this.pool.releaseCornerPointsObject(corners);
      this.pool.releaseBoundriesExObject(imBounds);
      this.pool.releaseBoundriesExObject(pxBounds);
      if (resize) this.pool.releaseBoundriesExObject(updatedBounds!);
      return;
    }


    // if was resized use updated pixel dimens
    if (resize) {
      const updatedPxDims = this.ip.getPixelBoundries(image, updatedBounds!);
      this._resetImagePosition(image, corners, updatedPxDims, originX, originY);
    } else {
      this._resetImagePosition(image, corners, pxDims, originX, originY);
    }

    // release objects back to pool
    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
    this.pool.releaseBoundriesExObject(pxBounds);
    if (resize) this.pool.releaseBoundriesExObject(updatedBounds!);
  }

  protected _scalePixelDimensionsToSize(
    image: FabricImage,
    bRectWidth: number,
    bRectHeight: number,
    pxWidth: number,
    pxHeight: number,
    sizeWidth: number,
    sizeHeight: number
  ): void {
    if (pxWidth / sizeWidth > pxHeight / sizeHeight) {
      image.scaleToWidth(bRectWidth * (sizeWidth / pxWidth));
    } else {
      image.scaleToHeight(bRectHeight * (sizeHeight / pxHeight));
    }
  }

  protected _resetImagePosition(
    image: FabricImage,
    coords: CornerPoints,
    pxDims: BoundriesEx,
    originX: TOriginX | 'none' = 'none',
    originY: TOriginY | 'none' = 'none',
  ): void {
    if (originX === 'none' && originY === 'none') return;
    let moveToPoint: Point; // pool points?
    const
      zoom = this.canvas.getZoom(),
      width = this._getUnscaledCanvasWidth(zoom),
      height = this._getUnscaledCanvasHeight(zoom);
    const { top, left, bottom, right } = pxDims;
    const
      xO = this.ip.getXOriginsPooled(image.angle),
      yO = this.ip.getYOriginsPooled(image.angle),
      topOrigin = _positionShorthandToXY(yO[0] as Position),
      leftOrigin = _positionShorthandToXY(xO[0] as Position),
      bottomOrigin = _positionShorthandToXY(yO[1] as Position),
      rightOrigin = _positionShorthandToXY(xO[1] as Position);
    if (originX !== 'none') {
      switch (originX){
        case 'left':
          moveToPoint = new Point(0 - left, coords[xO[0] as Position].y);
          image.setPositionByOrigin(moveToPoint, leftOrigin.originX, leftOrigin.originY);
          break;
        case 'right':
          moveToPoint = new Point(width + right, coords[xO[1] as Position].y);
          image.setPositionByOrigin(moveToPoint, rightOrigin.originX, rightOrigin.originY);
          break;
      }
      if (originY === 'none') {
        image.setCoords();
        this.canvas.requestRenderAll();
        this.pool.releasePositionPairObject(xO);
        this.pool.releasePositionPairObject(yO);
        return;
      }
      this.pool.applyCorners(coords, image.calcACoords());
    }
    switch (originY){
      case 'top':
        moveToPoint = new Point(coords[yO[0] as Position].x, 0 - top);
        image.setPositionByOrigin(moveToPoint, topOrigin.originX, topOrigin.originY);
        break;
      case 'bottom':
        moveToPoint = new Point(coords[yO[1] as Position].x, height + bottom);
        image.setPositionByOrigin(moveToPoint, bottomOrigin.originX, bottomOrigin.originY);
        break;
    }
    image.setCoords();
    this.canvas.requestRenderAll();
    this.pool.releasePositionPairObject(xO);
    this.pool.releasePositionPairObject(yO);
  }

  // fix or not?
  protected _scalePixelWidthTo(image: FabricImage, newWidth: number): void {
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxDims = this.ip.getPixelBoundries(image, imBounds);
    image.scaleToWidth(imBounds.width * (newWidth / pxDims.width));
    this.pool.releaseBoundriesExObject(imBounds);
    this.pool.releaseCornerPointsObject(corners);
  }

  protected _scalePixelHeightTo(image: FabricImage, newHeight: number): void {
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxDims = this.ip.getPixelBoundries(image, imBounds);
    image.scaleToHeight(imBounds.height * (newHeight / pxDims.height));
    this.pool.releaseBoundriesExObject(imBounds);
    this.pool.releaseCornerPointsObject(corners);
  }

  // a version for a center point or, just _getImageOffsets
  // provides an approximate pixel dimension based on cached values and current scale
  // it would be too expensive to recalculate the actual pixel dimension in a function
  // meant to be called many times per second.
  protected _getApproximatePixelDimensions(image: FabricImage) {
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners);

    if (!this.ip.getCachedPixelBoundries(image)) {
      this.ip.updateCached(image, imBounds);
    }

    const { top, left, bottom, right, width, height } = this.ip.getCachedPixelBoundries(image) as BoundriesEx;
    const originalOuterWidth = left + width + right;
    const originalOuterHeight = top + height + bottom;
    const { width: newOuterWidth, height: newOuterHeight} = imBounds;
    const finalWidth = +(Math.round(width * (newOuterWidth / originalOuterWidth) * 1000) * 0.001).toFixed(3);
    const finalHeight = +(Math.round(height * (newOuterHeight / originalOuterHeight) * 1000) * 0.001).toFixed(3);

    this.pool.releaseCornerPointsObject(corners);
    this.pool.releaseBoundriesExObject(imBounds);
    
    return {
      width: finalWidth,
      height: finalHeight,
    };
  }

  protected async _createMatrixCopies(image: FabricImage, xCopies: number, yCopies: number, padding: number) {
    const
      corners = this.pool.getCornerPointsObjectFromTCornerPoint(image.calcACoords()),
      imBounds = this.ip.getBoundriesPooled(image.angle, corners),
      pxDims = this.ip.getPixelBoundries(image, imBounds);
    this._resetImagePosition(image, corners, pxDims, 'left', 'top');
    const
      { width: pxWidth, height: pxHeight } = pxDims,
      center = image.getCenterPoint(),
      zoom = this.canvas.getZoom(),
      xMax = this._getUnscaledCanvasWidth(zoom),
      yMax = this._getUnscaledCanvasHeight(zoom),
      xOffset = pxWidth + padding,
      yOffset = pxHeight + padding,
      maxXCopies = ~~(xMax / xOffset), // ~~ <- bitwise opperator, very fast
      maxYCopies = ~~(yMax / yOffset), // removes decimal without rounding
      xSteps = xCopies > maxXCopies ? maxXCopies : xCopies,
      ySteps = yCopies > maxYCopies ? maxYCopies : yCopies;
  
    let top = 0;
    let left = 0;
    for (let y = 0; y < ySteps; y++) {
      top = y * yOffset;
      for (let x = 0; x < xSteps; x++) { // duplicate in cache aswell
        left = x * xOffset;
        const img = await image.clone(Object.keys(this.defaultImageOptions));
        img.setControlsVisibility(this.defaultContolsVisibility);
        img.setPositionByOrigin(new Point(center.x + left, center.y + top), 'center', 'center');
        this.canvas.add(img);
      }
    }
    this.canvas.remove(image);
    this.canvas.requestRenderAll();
    this.pool.releaseBoundriesExObject(imBounds);
    this.pool.releaseCornerPointsObject(corners);
  }

  // ----

  protected _onSelectionCreated(event: CanvasEvents['selection:created']): void {
    console.log('event -> selection:created');
    const image = event.selected[0];
    if (image?.isType('Image')) {
      this._updateTransformCache(image as FabricImage);
    }
  }

  protected _onSelectionUpdated(event: CanvasEvents['selection:updated']): void {
    console.log('event -> selection:updated');
    const image = event.selected[0];
    if (image?.isType('Image')) {
      this._updateTransformCache(image as FabricImage);
    }
  }

  protected _onObjectModified(event: CanvasEvents['object:modified']): void {
    if (this.isHandlingEvent || !event.target.isType('Image')) return;
    const image = event.target as FabricImage;
    if (!this._hasRotated(image) && !this._hasScaled(image)) {
      console.log('event -> object:mofidied -> moved');
      this.isHandlingEvent = true;

      if (this.constrainImageOnModified) this._constrainImageSizeAndPosition(image);
      this.pool.log();

      this.isHandlingEvent = false;
      return;
    } 
    console.log('event -> object:mofidied -> transformed');
    this.isHandlingEvent = true;

    // update cache

    if (this.constrainImageOnModified) this._constrainImageSizeAndPosition(image);

    this._updateTransformCache(image);
    this.isHandlingEvent = false;
  }

  protected _onObjectRemoved (event: CanvasEvents['object:removed']): void {
    console.log('event -> object:removed');
    if (event.target.isType('Image')) {
      this.ip.removeCached(event.target as FabricImage);
      this._deleteFromTransformCache(event.target as FabricImage);
    }
  }

  // a test for scaling. may just expose the method called within for people to use.
  // _getApproximatePixelDimensions -> imgGetScalingDimensions
  protected _onObjectScaling (event: CanvasEvents['object:scaling']): void {
    if (!event.target.isType('Image')) return;
    const { width, height } = this._getApproximatePixelDimensions(event.target as FabricImage);
    console.log(`${width} x ${height}`);
  }

  protected _updateTransformCache(image: FabricImage): void {
    const cache = this.transformCache.get(image);
    if (cache) {
      cache.angle = image.angle;
      cache.scaleX = image.scaleX;
      cache.scaleY = image.scaleY;
    } else {
      this.transformCache.set(
        image,
        {
          angle: image.angle,
          scaleX: image.scaleX,
          scaleY: image.scaleY,
        },
      );
    }
  }

  protected _deleteFromTransformCache(image: FabricImage): void {
    if (this.transformCache.get(image)) {
      this.transformCache.delete(image);
    }
  }

  protected _hasRotated(image: FabricImage): boolean {
    if (image.angle !== this.transformCache.get(image)!.angle) {
      return true;
    } 
    return false;
  }

  protected _hasScaled(image: FabricImage): boolean {
    const transformCache = this.transformCache.get(image);
    if (
      image.scaleX !== transformCache!.scaleX ||
      image.scaleY !== transformCache!.scaleY
    ) {
      return true;
    } 
    return false;
  }

  protected _getSelectedImage(): FabricImage | undefined {
    const image = this.canvas.getActiveObjects()[0];
    if (!image || !image.isType('Image')) return undefined;
    return image as FabricImage;
  }

  protected _getUnscaledCanvasWidth(zoom: number): number { return this.canvas.width / zoom }
  protected _getUnscaledCanvasHeight(zoom: number): number { return this.canvas.height / zoom }

}

// impl below into class

const _scaleCanvasToWidth = (canvas: Canvas, artboard: Artboard, width: number) => {
  const scaleFactor = width * artboard.reciprocalX;
  const newDimensions = { 
    width: width,
    height: artboard.height * scaleFactor,
  };
  canvas.setZoom(scaleFactor);
  canvas.setDimensions(newDimensions);
};

const _scaleCanvasToHeight = (canvas: Canvas, artboard: Artboard, height: number) => {
  const scaleFactor = height * artboard.reciprocalY;
  const newDimensions = { 
    width: artboard.width * scaleFactor,
    height: height,
  };
  canvas.setZoom(scaleFactor);
  canvas.setDimensions(newDimensions);
};

const _setArtboardWidth = (artboard: Artboard, canvas: Canvas, width: number): void => {
  artboard.width = width;
  artboard.reciprocalX = 1/width;
  _scaleCanvasToWidth(canvas, artboard, canvas.width);
};

const _setArtboardHeight = (artboard: Artboard, canvas: Canvas, height: number): void => {
  artboard.height = height;
  artboard.reciprocalY = 1/height;
  _scaleCanvasToHeight(canvas, artboard, height);
};

const _setArtboardDPI = (artboard: Artboard, dpi: number): void => {
  artboard.dpi = dpi;
};

// helpers below

function _positionShorthandToXY(shorthand: Position): TOriginXY {
  switch(shorthand){
    case 'tl': return { originX: 'left', originY: 'top' };
    case 'tr': return { originX: 'right', originY: 'top' };
    case 'bl': return { originX: 'left', originY: 'bottom' };
    case 'br': return { originX: 'right', originY: 'bottom' };
  }
}

function _whereIsImageOffCanvas(
  boundries: BoundriesEx, // pooled
  unscaledCanvasXMax: number,
  unscaledCanvasYMax: number,
): TOriginXYN {
  let
    originX: TOriginX | 'none' = 'none',
    originY: TOriginY | 'none' = 'none';
  const { top, left, bottom, right } = boundries;
  if (left < 0) {
    originX = 'left';
  } else if (right > unscaledCanvasXMax) {
    originX = 'right';
  }
  if (top < 0) {
    originY = 'top';
  } else if (bottom > unscaledCanvasYMax) {
    originY = 'bottom';
  }
  return { originX, originY }; // not-pooled
}

function _isImageOffCanvas(pxBounds: BoundriesEx, unscaledCanvasXMax: number, unscaledCanvasYMax: number): boolean {
  const { top, left, bottom, right } = pxBounds;
  if (left < 0 || top < 0 || right > unscaledCanvasXMax || bottom > unscaledCanvasYMax) return true;
  return false;
};

function _inchesToPixels(inches: number, dpi: number): number { return dpi * inches }

function _pixelsToInches(pixels: number, dpi: number): number { return pixels / dpi }