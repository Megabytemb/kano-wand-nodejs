var fitCurve = require('fit-curve')
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');

if (!Array.prototype.flat) {
  Array.prototype.flat = function() {
    return this.reduce(function (flat, toFlatten) {
      return flat.concat(Array.isArray(toFlatten) ? toFlatten.flat() : toFlatten);
    }, []);
  }
}
/* global event */
/* eslint no-restricted-globals: ["error"] */
 class GestureSpells {
    constructor() {
        this.theSpells = [
            'Accio', 'Aguamenti', 'Alohomora',
            'Avis', 'Bombarda', 'Colovaria',
            'Engorgio', 'Epoximise', 'Evanesco',
            'Expelliarmus', 'Flipendo', 'Fumos',
            'Gemino', 'Impedimenta', 'Incendio',
            'Locomotor', 'Lumos', 'Oppugno',
            'Orchideous', 'Vermillious', 'Reducio',
            'Reducto', 'Reparo', 'Serpensortia',
            'Wingardium Leviosa', 'not a Spell',
        ].sort();
        this.numberOfspells = this.theSpells.length;
        this.loadModel();
        this.resolution = 27;
    }
    loadModel(load) {
      this.loaded = tf.loadLayersModel('file://' + require.resolve(__dirname + '/model/spelling.json'));
    }
    predict(spellToRecognise) {
        const spellSize = 80;
        const flatSp = spellToRecognise.flat(3);
        const pad = Array(...Array(spellSize - flatSp.length))
            .map(Number.prototype.valueOf, 0);
        return this.loaded
            .then(loaded => loaded.predict(tf.tensor2d(flatSp.concat(pad), [1, spellSize])).data()
                .then((p) => {
                    const max = Math.max(...p);
                    return {
                        score: max,
                        spell: this.theSpells[p.indexOf(max)],
                    };
                }));
    }
    toCurve(s) {
        // max curves
        const size = 10;
        const op0 = fitCurve(s, 6);
        const op1 = fitCurve(s, 5);
        const op2 = fitCurve(s, 4);
        const op3 = fitCurve(s, 3);
        const op4 = fitCurve(s, 2);
        const op5 = fitCurve(s, 1);
        let picked;
        if (op5.length <= size) {
            picked = op5;
        } else if (op4.length <= size) {
            picked = op4;
        } else if (op3.length <= size) {
            picked = op3;
        } else if (op2.length <= size) {
            picked = op2;
        } else if (op1.length <= size) {
            picked = op1;
        } else {
            picked = op0.slice(0, size);
        }
        return picked.map(v => v.map(va => va.map(val => Math.round(val))));
    }
    normCurve(Curve) {
        const minX = Curve.reduce((a, v) => Math.min(v[0][0], v[1][0], v[2][0], v[3][0], a), 2000);
        const minY = Curve.reduce((a, v) => Math.min(v[0][1], v[1][1], v[2][1], v[3][1], a), 2000);
        const maxX = Curve.reduce((a, v) => Math.max(v[0][0], v[1][0], v[2][0], v[3][0], a), 0);
        const maxY = Curve.reduce((a, v) => Math.max(v[0][1], v[1][1], v[2][1], v[3][1], a), 0);
        const factor = this.resolution / this.distance([maxX, maxY], [minX, minY]);
        return Curve.map(va => va.map(val => [
            Math.floor((val[0] - minX) * factor),
            Math.floor((val[1] - minY) * factor),
        ]));
    }
    normSpell(theSpell) {
        const minX = theSpell.reduce((a, v) => Math.min(v[0], a), 2000);
        const minY = theSpell.reduce((a, v) => Math.min(v[1], a), 2000);
        const maxX = theSpell.reduce((a, v) => Math.max(v[0], a), 0);
        const maxY = theSpell.reduce((a, v) => Math.max(v[1], a), 0);
        const factor = this.resolution / this.distance([maxX, maxY], [minX, minY]);
        return this.normCurve(this.toCurve(theSpell.map(va => [
            Math.floor((va[0] - minX) * factor),
            Math.floor((va[1] - minY) * factor),
        ]).reduce((a, val, i, arr) => {
            if (i === 0
                || i + 1 === arr.length
                || !this.isInALine(a.slice(-1), val, arr[i + 1])) {
                a.push(val);
            }
            return a;
        }, [])));
    }
    distance(pa, pb) {
        const a = pa[0] - pb[0];
        const b = pa[1] - pb[1];
        if (a || b) {
            return Math.sqrt((a * a) + (b * b));
        }
        return 0;
    }
    isInALine(a, b, c) {
        if (a && b && c) {
            return (this.distance(a, b) + this.distance(b, c)) === this.distance(a, c);
        }
        return false;
    }
    recognise(arrayOfxy) {
        return this.predict(this.normSpell(arrayOfxy));
    }
}

module.exports = GestureSpells;