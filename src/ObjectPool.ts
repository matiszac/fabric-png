import type { TCornerPoint } from 'fabric';
import type { BoundriesEx, PositionPair, CornerPoints, Position } from './types'

export class ObjectPool {
  protected boundriesExPool: BoundriesEx[];
  protected positionPairPool: PositionPair[];
  protected cornerPointsPool: CornerPoints[];
  constructor() {
    this.boundriesExPool = [];
    this.positionPairPool = [];
    this.cornerPointsPool = [];
  }

  log() {
    console.log(
      'bex: ' + this.boundriesExPool.length +
      ', pp: ' + this.positionPairPool.length + 
      ', cp: ' + this.cornerPointsPool.length
    );
  }

  getBoundriesExObject(): BoundriesEx {
    if (this.boundriesExPool.length > 0) {
      console.log('ObjectPool -> Pop -> BoundriesEx');
      return this.boundriesExPool.pop() as BoundriesEx;
    } else {
      console.log('ObjectPool -> Create -> BoundriesEx');
      return this._createBoundriexExObject();
    }
  }
  getBoundriesExObjectWithValues(
    top: number,
    left: number,
    bottom: number,
    right: number,
    width: number,
    height: number,
  ): BoundriesEx {
    return this.applyBoundryValuesReturn(
        this.getBoundriesExObject(),
        top, left, bottom, right, width, height,
    );
  }
  applyBoundries(to: BoundriesEx, from: BoundriesEx) {
    to.top = from.top;
    to.left = from.left;
    to.bottom = from.bottom;
    to.right = from.right;
    to.width = from.width;
    to.height = from.height;
  }
  applyBoundryValuesReturn(to: BoundriesEx,
    top: number,
    left: number,
    bottom: number,
    right: number,
    width: number,
    height: number,
  ): BoundriesEx {
    to.top = top;
    to.left = left;
    to.bottom = bottom;
    to.right = right;
    to.width = width;
    to.height = height;
    return to;
  }
  releaseBoundriesExObject(obj: BoundriesEx): void {
    console.log('ObjectPool -> Release -> BoundriesEx');
    this.boundriesExPool.push(obj);
  }
  getPositionPairObject(): PositionPair {
    if (this.positionPairPool.length > 0) {
      console.log('ObjectPool -> Pop -> PositionPair');
      return this.positionPairPool.pop() as PositionPair;
    } else {
      console.log('ObjectPool -> Create -> PositionPair');
      return this._createPositionPairObject();
    }
  }
  getPositionPairObjectWithValues(pos0: Position, pos1: Position): PositionPair {
    return this.applyPositionValuesReturn(
      this.getPositionPairObject(),
      pos0, pos1,
    );
  }
  applyPositionValuesReturn(to: PositionPair, pos0: Position, pos1: Position): PositionPair {
    to[0] = pos0;
    to[1] = pos1;
    return to;
  }
  releasePositionPairObject(obj: PositionPair): void {
    console.log('ObjectPool -> Release -> PositionPair');
    this.positionPairPool.push(obj);
  }
  getCornerPointsObject(): CornerPoints {
    if (this.cornerPointsPool.length > 0) {
      console.log('ObjectPool -> Pop -> CornerPoints');
      return this.cornerPointsPool.pop() as CornerPoints;
    } else {
      console.log('ObjectPool -> Create -> CornerPoints');
      return this._createCornerPointsObject();
    }
  }
  getCornerPointsObjectFromTCornerPoint(tCornerPoint: TCornerPoint): CornerPoints {
    const corners = this.getCornerPointsObject();
    this.applyCorners(corners, tCornerPoint);
    return corners;
  }
  applyCorners(to: CornerPoints, from: TCornerPoint): CornerPoints {
    to.tl.x = from.tl.x;
    to.tl.y = from.tl.y;
    to.tr.x = from.tr.x;
    to.tr.y = from.tr.y;
    to.bl.x = from.bl.x;
    to.bl.y = from.bl.y;
    to.br.x = from.br.x;
    to.br.y = from.br.y;
    return to;
  }
  releaseCornerPointsObject(obj: CornerPoints): void {
    console.log('ObjectPool -> Release -> CornerPoints');
    this.cornerPointsPool.push(obj);
  }

  protected _createBoundriexExObject(): BoundriesEx {
    return {
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      width: 0,
      height: 0,
    };
  }
  protected _clearBoundriesExObject(obj: BoundriesEx): BoundriesEx {
    obj.top = 0;
    obj.left = 0;
    obj.bottom = 0;
    obj.right = 0;
    obj.width = 0;
    obj.height = 0;
    return obj;
  }
  protected _createPositionPairObject(): PositionPair {
    return ['', ''];
  }
  protected _clearPositionPairObject(obj: PositionPair): PositionPair {
    obj[0] = '';
    obj[1] = '';
    return obj;
  }
  protected _createCornerPointsObject(): CornerPoints {
    return {
      tl: {x: 0, y: 0},
      tr: {x: 0, y: 0},
      bl: {x: 0, y: 0},
      br: {x: 0, y: 0},
    };
  }
  protected _clearCornerPointsObject(obj: CornerPoints): CornerPoints {
    obj.tl.x = 0;
    obj.tl.y = 0;
    obj.tr.x = 0;
    obj.tr.y = 0;
    obj.bl.x = 0;
    obj.bl.y = 0;
    obj.br.x = 0;
    obj.br.y = 0;
    return obj;
  }
}