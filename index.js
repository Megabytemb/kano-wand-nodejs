var just = require('string-just');
var kano = require('./kano_info.json');
var async = require("async");
var gestureSpells = require("./gesture-spells");
const { Observable, Subject, ReplaySubject, from, of, range } = require('rxjs');
const { map, filter, switchMap } = require('rxjs/operators');
const Conv = require('./conversion');

const width = 800;
const height = 600;

const conv = new Conv(width, height);
var gr = new gestureSpells()


class Wand {

    constructor(name) {
        this.name = name;
        this.buttonCharacteristic = null;
        this.vibrateCharacteristic = null;
        this.quaternionsCharacteristic = null;
        this.quaternionsResetCharacteristic = null;
        this.ledCharacteristic = null;
        this.keepAliveCharacteristic = null;
        this.batteryCharacteristic = null;
        this.currentSpell = [];
        this.buttonPressed = false;
        this.timeUp = new Date();
        this.timeDown = new Date();
        this.resetTimeout = 0.2; // determins a quick press for wand reset (milliseconds)

        this.centerPoints = {
          x: width / 2,
          y: height / 2
        };
        this.strengthX = 100 ** 2;
        this.strengthY = 80 ** 2;
        this.lastPoint = this.centerPoints;
        this.prevPoint = null;
        this.wandGesture = [];
        this.vertical = null;

        this.spells = new Subject();
        this.positions = new Subject();
        this.battery = new Subject();
        this.button = new Subject();
        this.move = new Subject();
        this.whileFlick = new Subject();
        this.onFlick = new Subject();
    }

    static uInt8ToUInt16(byteA, byteB) {
        const number = (((byteB & 0xff) << 8) | byteA);
        const sign = byteB & (1 << 7);

        if (sign) {
            return 0xFFFF0000 | number;
        }

        return number;
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

            if (compareUUID(characteristic.uuid, kano.IO.KEEP_ALIVE_CHAR)) {
                console.log("found keep alive");
                this.keepAliveCharacteristic = characteristic;
            }

            if (compareUUID(characteristic.uuid, kano.IO.LED_CHAR))
            {
                console.log("found led");
                this.ledCharacteristic = characteristic;
            }

            if (compareUUID(characteristic.uuid, kano.IO.BATTERY_CHAR))
            {
                console.log("found battery");
                this.batteryCharacteristic = characteristic;
            }

        }
    }

    vibrate(pattern) {
      var vibrate = Buffer.alloc(1);
      vibrate.writeUInt8(pattern,0)
      this.vibrateCharacteristic.write(vibrate, true);
    }

    keepAlive() {
      var alive = Buffer.alloc(1);
      alive.writeUInt8(1,0);
      this.keepAliveCharacteristic.write(alive, true);
    }

    setLed(state, color = "#000000") {
      console.log("Set LED: ", color);
      var color = parseInt(color.replace("#","0x"),16);
      const message = Buffer.alloc(3);
      message.writeUInt8([state ? 1 : 0], 0);
      const r = (color >> 16) & 255;
      const g = (color >> 8) & 255;
      const b = color & 255;
      const rgb565 = (((r & 248) << 8) + ((g & 252) << 3) + ((b & 248) >> 3));
      message.writeUInt8([rgb565 >> 8], 1);
      message.writeUInt8([rgb565 & 0xff], 2);
      this.ledCharacteristic.write(message, true);
    }

    init(peripheral) {
        console.log("init");
        var serviceUUIDs = [
          kano.SENSOR.SERVICE.replace(/-/g, "").toLowerCase(), kano.IO.SERVICE.replace(/-/g, "").toLowerCase(), kano.INFO.SERVICE.replace(/-/g, "").toLowerCase()
        ];

        const $this = this;
        return new Promise((resolve, reject) => {
            async.waterfall([
                function(callback) {
                    console.log("Discovering services...");
                    peripheral.discoverServices(serviceUUIDs, callback);
                },
                function(services, callback) {
                    console.log("Found", services.length, "services");
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
                    callback();
                }.bind(this),
                this.subscribe_position.bind(this),
                this.subscribe_button.bind(this),
                this.subscribe_battery.bind(this),
                this.reset_position.bind(this)
            ], function (err, result) {
                console.log("Wand ready!");
                resolve(true);
            });
        });
    }

    subscribe_button(callback) {
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
            this.keepAlive();
            this.button.next('recentre');
        } else if (this.currentSpell.length > 5) { // not pressed
            this.currentSpell = this.currentSpell.splice(5);
            let flippedPositions = [];

            this.currentSpell.forEach((entry) => {
                flippedPositions.push(Wand.flipCord(entry));
            })

            const positions = this.currentSpell;
            gr.recognise(flippedPositions)
            .then((data) =>{
                data.positions = flippedPositions;
                this.spells.next(data);
            });
            this.currentSpell = [];
        }
    }

    static flipCord(cords) {
        const x = cords[0]
        const y = cords [1]
        const iy = height - (y);
        return [x, iy];
    }

    subscribe_position(callback) {
        console.log("Subscribe to Motion")
        this.quaternionsCharacteristic.on('read', this.onMotionUpdate.bind(this));
        this.quaternionsCharacteristic.subscribe(callback);
    }

    onMotionUpdate(data, isNotification) {
        let y = data.readInt16LE(0);
        let x = data.readInt16LE(2);
        let w = data.readInt16LE(4);
        let z = data.readInt16LE(6);

        const pos = conv.position([x, y, z, w]);

        let pitch = `Pitch: ${just.ljust(z.toString(), 16, " ")}`;
        let roll = `Roll: ${just.ljust(w.toString(), 16, " ")}`;

        // console.log(`${pitch}${roll}(x, y): (${x.toString()}, ${y.toString()})`)
        // console.log(this.getXY(x, y))
        if (this.buttonPressed) {
            this.currentSpell.push([pos.x, pos.y]);
            this.positions.next([pos.x, pos.y]);
        }

        pos.isButtonPressed = this.buttonPressed;
        this.move.next(pos);

        var flipPos = Wand.flipCord([pos.x, pos.y]);
        this.processPoint({x: flipPos[0], y: flipPos[1]});
    }

    processPoint(p) {

      if (this.centerPoints) {
        const distanceCenterX = p.x - this.centerPoints.x,
              distanceCenterY = p.y - this.centerPoints.y;
        if (distanceCenterX > 50) this.whileFlick.next("rightMove");
        if (distanceCenterX < -50) this.whileFlick.next("leftMove");
        if (distanceCenterY > 50) this.whileFlick.next("downMove");
        if (distanceCenterY < -50) this.whileFlick.next("upMove");
      }
      const distance = Wand.distance(this.lastPoint.x, p.x, this.lastPoint.y, p.y) / .4;

      this.centerPoints = p;
      this.lastPoint = p;

      if (this.lastPoint && this.prevPoint ) {

        if (this.lastPoint.x < -200 || this.lastPoint.x > 1000) {
          this.prevPoint = this.lastPoint;
          return;
        }

        const distanceX = this.lastPoint.x - this.prevPoint.x,
              distanceY = this.lastPoint.y - this.prevPoint.y,
              speedX = distanceX ** 2,
              speedY = distanceY ** 2;

        if (this.wandGesture.length >= 2) {
          const direct = speedY > speedX,
                dis = direct ? distanceY : distanceX;

          if (direct === this.vertical && distance > 10 && dis ** 2 > this.strengthX) {
            this.wandGesture.push(dis)
          }
          else {
            this.runGesture()
          }
          return;
        }

        if (speedX > speedY && speedX > this.strengthX) {
          this.wandGesture.push(distanceX);
          this.vertical = !1;

          if (distanceX > 0) {
            this.direction = "right"
          }
          else {
            this.direction = "left"
          }
        }
        else if (speedY > speedX && speedY > this.strengthY) {
          this.wandGesture.push(distanceY)
          this.vertical = !0

          if (distanceY > 0) {
            this.direction = "down"
          }
          else {
            this.direction = "up"
          }
        }

      }
      this.prevPoint = this.lastPoint;
    }

    runGesture() {
      this.onFlick.next(this.direction);
      this.wandGesture = []
      this.vertical = null
    }

    static distance(x1, x2, y1, y2) {
      return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
    }

    subscribe_battery(callback) {
      console.log("Subscribe to Battery")
      this.batteryCharacteristic.on('read', this.onBatteryUpdate.bind(this));
      this.batteryCharacteristic.subscribe(callback);
    }

    onBatteryUpdate(data, isNotification) {
      const batt = data.readUIntBE(0, 1);
      this.battery.next(batt);
    }

    reset_position(callback) {
        console.log("Reset Position");
        var reset = Buffer.alloc(1);
        reset.writeUInt8(1,0)
        this.quaternionsResetCharacteristic.write(reset, true);
        if(typeof(callback) == typeof(Function)) callback();
    }
}

function compareUUID(val1, val2) {
    val1 = val1.replace(/-/g, "").toLowerCase();
    val2 = val2.replace(/-/g, "").toLowerCase();

    return val1 === val2;
};

module.exports = Wand;