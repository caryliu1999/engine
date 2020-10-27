/****************************************************************************
 Copyright (c) 2017-2020 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

import { Vec2, Rect } from "../../core";

/**
 * @en Test line and line
 * @zh 测试线段与线段是否相交
 */
function lineLine (a1: Readonly<Vec2>, a2: Readonly<Vec2>, b1: Readonly<Vec2>, b2: Vec2): boolean {
    // jshint camelcase:false

    let ua_t = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
    let ub_t = (a2.x - a1.x) * (a1.y - b1.y) - (a2.y - a1.y) * (a1.x - b1.x);
    let u_b = (b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y);

    if (u_b !== 0) {
        let ua = ua_t / u_b;
        let ub = ub_t / u_b;

        if (0 <= ua && ua <= 1 && 0 <= ub && ub <= 1) {
            return true;
        }
    }

    return false;
}

let tempR1 = new Vec2;
let tempR2 = new Vec2;
let tempR3 = new Vec2;
let tempR4 = new Vec2;

/**
 * @en Test line and rect
 * @zh 测试线段与矩形是否相交
 */
function lineRect (a1: Readonly<Vec2>, a2: Readonly<Vec2>, b: Rect): boolean {
    let r0 = tempR1.set(b.x, b.y);
    let r1 = tempR2.set(b.x, b.yMax);
    let r2 = tempR3.set(b.xMax, b.yMax);
    let r3 = tempR4.set(b.xMax, b.y);

    if (lineLine(a1, a2, r0, r1))
        return true;

    if (lineLine(a1, a2, r1, r2))
        return true;

    if (lineLine(a1, a2, r2, r3))
        return true;

    if (lineLine(a1, a2, r3, r0))
        return true;

    return false;
}


/**
 * @en Test line and polygon
 * @zh 测试线段与多边形是否相交
 */
function linePolygon (a1: Readonly<Vec2>, a2: Readonly<Vec2>, b: readonly Vec2[]): boolean {
    let length = b.length;

    for (let i = 0; i < length; ++i) {
        let b1 = b[i];
        let b2 = b[(i + 1) % length];

        if (lineLine(a1, a2, b1, b2))
            return true;
    }

    return false;
}


/**
 * @en Test rect and rect
 * @zh 测试矩形与矩形是否相交
 */
function rectRect (a: Rect, b: Rect): boolean {
    // jshint camelcase:false

    let a_min_x = a.x;
    let a_min_y = a.y;
    let a_max_x = a.x + a.width;
    let a_max_y = a.y + a.height;

    let b_min_x = b.x;
    let b_min_y = b.y;
    let b_max_x = b.x + b.width;
    let b_max_y = b.y + b.height;

    return a_min_x <= b_max_x &&
        a_max_x >= b_min_x &&
        a_min_y <= b_max_y &&
        a_max_y >= b_min_y
        ;
}

/**
 * @en Test rect and polygon
 * @zh 测试矩形与多边形是否相交
 */
function rectPolygon (a: Readonly<Rect>, b: readonly Vec2[]): boolean {
    let r0 = tempR1.set(a.x, a.y);
    let r1 = tempR2.set(a.x, a.yMax);
    let r2 = tempR3.set(a.xMax, a.yMax);
    let r3 = tempR4.set(a.xMax, a.y);

    // intersection check
    if (linePolygon(r0, r1, b))
        return true;

    if (linePolygon(r1, r2, b))
        return true;

    if (linePolygon(r2, r3, b))
        return true;

    if (linePolygon(r3, r0, b))
        return true;

    // check if a contains b
    for (let i = 0, l = b.length; i < l; ++i) {
        if (a.contains(b[i]))
            return true;
    }

    // check if b contains a
    if (pointInPolygon(r0, b))
        return true;

    if (pointInPolygon(r1, b))
        return true;

    if (pointInPolygon(r2, b))
        return true;

    if (pointInPolygon(r3, b))
        return true;

    return false;
}


/**
 * @en Test polygon and polygon
 * @zh 测试多边形与多边形是否相交
 */
function polygonPolygon (a: readonly Vec2[], b: readonly Vec2[]): boolean {
    let i, l;

    // check if a intersects b
    for (i = 0, l = a.length; i < l; ++i) {
        let a1 = a[i];
        let a2 = a[(i + 1) % l];

        if (linePolygon(a1, a2, b))
            return true;
    }

    // check if a contains b
    for (i = 0, l = b.length; i < l; ++i) {
        if (pointInPolygon(b[i], a))
            return true;
    }

    // check if b contains a
    for (i = 0, l = a.length; i < l; ++i) {
        if (pointInPolygon(a[i], b))
            return true;
    }

    return false;
}


/**
 * @en Test circle and circle
 * @zh 测试圆形与圆形是否相交
 */
function circleCircle (c1p: Readonly<Vec2>, c1r: number, c2p: Readonly<Vec2>, c2r: number): boolean {
    let distance = Vec2.distance(c1p, c2p);
    return distance < (c1r + c2r);
}



/**
 * @en Test polygon and circle
 * @zh 测试多边形与圆形是否相交
 */
function polygonCircle (polygon: readonly Vec2[], cp: Readonly<Vec2>, cr: number): boolean {
    let position = cp;
    if (pointInPolygon(position, polygon)) {
        return true;
    }

    for (let i = 0, l = polygon.length; i < l; i++) {
        let start = i === 0 ? polygon[polygon.length - 1] : polygon[i - 1];
        let end = polygon[i];

        if (pointLineDistance(position, start, end, true) < cr) {
            return true;
        }
    }

    return false;
}

/**
 * @en Test rect and circle
 * @zh 测试矩形与圆形是否相交
 */
function rectCircle (rect: Rect, cp: Readonly<Vec2>, cr: number): boolean {
    let cx = cp.x;
    let cy = cp.y;

    let rx = rect.x;
    let ry = rect.y;
    let rw = rect.width;
    let rh = rect.height;

    // temporary variables to set edges for testing
    let testX = cx;
    let testY = cy;

    // which edge is closest?
    if (cx < rx) testX = rx;      // test left edge
    else if (cx > rx + rw) testX = rx + rw;   // right edge
    if (cy < ry) testY = ry;      // top edge
    else if (cy > ry + rh) testY = ry + rh;   // bottom edge

    // get distance from closest edges
    let distX = cx - testX;
    let distY = cy - testY;
    let distance = Math.sqrt((distX * distX) + (distY * distY));

    // if the distance is less than the radius, collision!
    if (distance <= cr) {
        return true;
    }
    return false;
}


/**
 * @en Test whether the point is in the polygon
 * @zh 测试一个点是否在一个多边形中
 */
function pointInPolygon (point: Readonly<Vec2>, polygon: readonly Vec2[]): boolean {
    let inside = false;
    let x = point.x;
    let y = point.y;

    // use some raycasting to test hits
    // https://github.com/substack/point-in-polygon/blob/master/index.js
    let length = polygon.length;

    for (let i = 0, j = length - 1; i < length; j = i++) {
        let xi = polygon[i].x, yi = polygon[i].y,
            xj = polygon[j].x, yj = polygon[j].y,
            intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

        if (intersect) inside = !inside;
    }

    return inside;
}


/**
 * @en Calculate the distance of point to line.
 * @zh 计算点到直线的距离。如果这是一条线段并且垂足不在线段内，则会计算点到线段端点的距离。
 */
function pointLineDistance (point: Readonly<Vec2>, start: Readonly<Vec2>, end: Readonly<Vec2>, isSegment: boolean): number {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let d = dx * dx + dy * dy;
    let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / d;
    let p;

    if (!isSegment) {
        p = tempR1.set(start.x + t * dx, start.y + t * dy);
    }
    else {
        if (d) {
            if (t < 0) p = start;
            else if (t > 1) p = end;
            else p = tempR1.set(start.x + t * dx, start.y + t * dy);
        }
        else {
            p = start;
        }
    }

    dx = point.x - p.x;
    dy = point.y - p.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * @en Intersection2D helper class
 * @zh 辅助类，用于测试形状与形状是否相交
 * @class Intersection2D
 */
export default class Intersection2D {
    static lineLine = lineLine;
    static lineRect = lineRect;
    static linePolygon = linePolygon;
    static rectRect = rectRect;
    static rectPolygon = rectPolygon;
    static rectCircle = rectCircle;
    static polygonPolygon = polygonPolygon;
    static circleCircle = circleCircle;
    static polygonCircle = polygonCircle;
    static pointInPolygon = pointInPolygon;
    static pointLineDistance = pointLineDistance;
}
