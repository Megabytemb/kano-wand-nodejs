var just = require('string-just');
var kano = require('./kano_info.json');
var async = require("async");
var gestureSpells = require("./gesture-spells");
const { Observable, Subject, ReplaySubject, from, of, range } = require('rxjs');
const { map, filter, switchMap } = require('rxjs/operators');

var gr = new gestureSpells()


class Wand {
    
    constructor() {
        this.buttonCharacteristic = null;
        this.vibrateCharacteristic = null;
        this.quaternionsCharacteristic = null;
        this.quaternionsResetCharacteristic = null;
        this.positions = [];
        this.buttonPressed = false;
        this.timeUp = new Date();
        this.timeDown = new Date();
        this.resetTimeout = 0.2 // determins a quick press for wand reset (milliseconds)
        this.spells = new Subject();
    }

    processCharacteristic(characteristic) {
        {
            if (compareUUID(characteristic.uuid, kano.SENSOR.QUATERNIONS_CHAR)) {
                console.log("found position");
                this.quaternionsCharacteristic = characteristic;
            }

            if (compareUUID(characteristic.uuid, kano.IO.USER_BUTTON_CHAR)) {
                console.log("found Button");
                this.buttonCharacteristic = characteristic;
            }

            if (compareUUID(characteristic.uuid, kano.SENSOR.QUATERNIONS_RESET_CHAR)) {
                console.log("found ResetChar");
                this.quaternionsResetCharacteristic = characteristic;
            }

            if (compareUUID(characteristic.uuid, kano.IO.VIBRATOR_CHAR)) {
                console.log("found vibrate");
                this.vibrateCharacteristic = characteristic;
                
            }

        }
    }

    vibrate(pattern) {
        var vibrate = Buffer.alloc(1);
        vibrate.writeUInt8(pattern,0)
        this.vibrateCharacteristic.write(vibrate, true);
    }

    init(peripheral) {
        console.log("init");
        var serviceUUIDs = [kano.SENSOR.SERVICE, kano.IO.SERVICE, kano.INFO.SERVICE];

        const $this = this;
        return new Promise((resolve, reject) => {
            async.waterfall([
                function(callback) {
                    peripheral.discoverServices(serviceUUIDs, callback);
                },
                function(services, callback) {
                    var tasks = []
                    services.forEach(function(service) {
                        tasks.push(function(callback) {
                            service.discoverCharacteristics([], callback);
                        })
                    })
    
                    async.parallel(tasks, callback);
                },
                function (characteristics, callback) {
                    characteristics = characteristics.flat();
                    characteristics.forEach(this.processCharacteristic, this)
                    callback(null, true);
                }.bind(this),
                this.subscribe_position.bind(this),
                this.subscribe_button.bind(this),
                async.apply(this.reset_position.bind(this))
            ], function (err, result) {
                resolve(true);
            });
        });
    }

    subscribe_button(result, callback) {
        console.log("Subscribe to Button")
        this.buttonCharacteristic.on('read', this.onButtonUpdate.bind(this));
        this.buttonCharacteristic.subscribe(callback);
    }

    onButtonUpdate(data, isNotification) {
        const raw = data.readUIntBE(0, 1);
        
        const pressed = raw == 1 ? true : false;
        
        this.buttonPressed = pressed;

        // timing

        if (pressed) {
            this.timeUp = new Date();
        } else {
            this.timeDown = new Date();
        }

        var seconds = (this.timeDown.getTime() - this.timeUp.getTime()) / 1000;

        if (pressed) {
            this.spell = null;
        } else if (seconds < this.resetTimeout) { // not pressed
            this.reset_position();
        } else if (this.positions.length > 0) { // not pressed
            gr.recognise(this.positions)
            .then((data) =>{
                this.spells.next(data);
            });
            this.positions = [];
        }


    }

    subscribe_position(result, callback) {
        console.log("Subscribe to Motion")
        this.quaternionsCharacteristic.on('read', this.onMotionUpdate.bind(this));
        this.quaternionsCharacteristic.subscribe(callback);
    }

    onMotionUpdate(data, isNotification) {
        let y = data.readInt16LE(0)
        let x = -1 * data.readInt16LE(2)
        let w = -1 * data.readInt16LE(4)
        let z = data.readInt16LE(6)

    
        let pitch = `Pitch: ${just.ljust(z.toString(), 16, " ")}`;
        let roll = `Roll: ${just.ljust(w.toString(), 16, " ")}`;
    
        // console.log(`${pitch}${roll}(x, y): (${x.toString()}, ${y.toString()})`)
        // console.log(this.getXY(x, y))
        if (this.buttonPressed) {
            this.positions.push(this.getXY(x, y));
        }
    }

    getXY(x, y) {
        const width = 800
        const height = 600
        // Height needs to be inversed for some reason - no idead why
        return [
            this.scale(x, -500, 500, 0, width),
            this.scale(y, 500, -500, 0, height),
        ]
    }

    scale(num, in_min, in_max, out_min, out_max) {
        return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
    }

    reset_position() {
        console.log("Reset Positoin");
        var reset = Buffer.alloc(1);
        reset.writeUInt8(1,0)
        this.quaternionsResetCharacteristic.write(reset, true);
    }
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

function compareUUID(val1, val2) {
    val1 = val1.replaceAll("-", "").toLowerCase();
    val2 = val2.replaceAll("-", "").toLowerCase();

    return val1 === val2;
};

module.exports = Wand;