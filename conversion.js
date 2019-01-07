/* global event */
/* eslint no-restricted-globals: ["error"] */
module.exports = class WandConversion {
    constructor(x, y) {
        this.canvas = {
            x,
            y,
        };
        this.matrix = [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
        this.zeroVector = { x: 0, y: 0, z: 0 };
        this.oneVector = { x: 1, y: 1, z: 1 };
        this.euler = {
            x: 0, y: 0, z: 0,
        };
    }
    position(quat) {
        const quaternion = quat.map(v => v / 1024);
        const normQuaternion = WandConversion.normalize(quaternion);
        const matrixRotatedFromQuat = WandConversion.makeRotationFromQuaternion(
            this.zeroVector,
            normQuaternion,
            this.oneVector,
            this.matrix
        );
        const [yaw, roll, pitch] = WandConversion.setFromRotationMatrix(matrixRotatedFromQuat);
        const yawComplete = WandConversion.yawComplete(yaw, pitch);
        const [x, y] = this.getXY(yaw, pitch);
        return {
            x,
            y,
            pitch: pitch / 2,
            roll: -roll,
            yaw: yawComplete,
        };
    }
    getXY(y, p) {
        const w = this.canvas.x / 2;
        const h = this.canvas.y / 2;
        return [-(((y / 180) * (w * 4)) - w), h - (3 * p)];
    }
    // from Three.js https://github.com/mrdoob/three.js/blob/master/src/math/Quaternion.js
    static normalize(quat) {
        let length = WandConversion.quatLength(quat);
        let x = quat[0];
        let y = quat[1];
        let z = quat[2];
        let w = quat[3];
        if (length === 0) {
            x = 0;
            y = 0;
            z = 0;
            w = 1;
        } else {
            length = 1 / length;
            x *= length;
            y *= length;
            z *= length;
            w *= length;
        }
        return {
            x, y, z, w,
        };
    }
    // from Three.js https://github.com/mrdoob/three.js/blob/master/src/math/Quaternion.js
    static quatLength(quat) {
        return Math.sqrt((quat[1] ** 2) + (quat[2] ** 2) + (quat[3] ** 2) + (quat[0] ** 2));
    }
    // from Three.js https://github.com/mrdoob/three.js/blob/master/src/math/Euler.js
    static setFromRotationMatrix(matrix) {
        const te = matrix;
        const matrix11 = te[0];
        const matrix12 = te[4];
        const matrix13 = te[8];
        const matrix22 = te[5];
        const matrix23 = te[9];
        const matrix32 = te[6];
        const matrix33 = te[10];
        const y = Math.asin(WandConversion.clamp(matrix13, -1, 1));
        let x;
        let z;
        if (Math.abs(matrix13) < 0.99999) {
            x = Math.atan2(-matrix23, matrix33);
            z = Math.atan2(-matrix12, matrix11);
        } else {
            x = Math.atan2(matrix32, matrix22);
            z = 0;
        }
        return [y, z, x * 2].map(WandConversion.toDegrees).map(WandConversion.toReal);
    }
    // from Three.js https://github.com/mrdoob/three.js/blob/master/src/math/Matrix4.js
    static makeRotationFromQuaternion(position, quaternion, scale, matrix) {
        const te = matrix;
        const {
            x, y, z, w,
        } = quaternion;
        const xx = x * (x + x);
        const xy = x * (y + y);
        const xz = x * (z + z);
        const yy = y * (y + y);
        const yz = y * (z + z);
        const zz = z * (z + z);
        const wx = w * (x + x);
        const wy = w * (y + y);
        const wz = w * (z + z);
        const sx = scale.x;
        const sy = scale.y;
        const sz = scale.z;

        te[0] = (1 - (yy + zz)) * sx;
        te[1] = (xy + wz) * sx;
        te[2] = (xz - wy) * sx;
        te[3] = 0;
        te[4] = (xy - wz) * sy;
        te[5] = (1 - (xx + zz)) * sy;
        te[6] = (yz + wx) * sy;
        te[7] = 0;
        te[8] = (xz + wy) * sz;
        te[9] = (yz - wx) * sz;
        te[10] = (1 - (xx + yy)) * sz;
        te[11] = 0;
        te[12] = position.x;
        te[13] = position.y;
        te[14] = position.z;
        te[15] = 1;
        return te;
    }
    // from Three.js https://github.com/mrdoob/three.js/blob/master/src/math/Math.js
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    static yawComplete(yaw, pitch) {
        let yawComplete;
        if (pitch > 180 || pitch < -180) {
            yawComplete = 180 - (-yaw);
        } else {
            yawComplete = -yaw;
        }
        return yawComplete;
    }
    static toDegrees(angle) {
        return angle * (180 / Math.PI);
    }
    static toRadian(angle) {
        return angle * (Math.PI / 180);
    }
    static toReal(x) {
        if (!isNaN(parseFloat(x)) && isFinite(parseFloat(x))) {
            return parseFloat(parseFloat(x).toFixed(1));
        }
        return x;
    }
    static map(n, start1, stop1, start2, stop2) {
        return (((n - start1) / (stop1 - start1)) * (stop2 - start2)) + start2;
    }
    static arrMultiply(array, num1, num2) {
        return array[num1] * array[num2];
    }
    static distance(x1, x2, y1, y2) {
        return Math.sqrt(((x2 - x1) ** 2) + ((y2 - y1) ** 2));
    }
};