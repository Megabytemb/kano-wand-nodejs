var noble = require('noble-mac');
var kano = require('./kano_info.json');
const KanoWand = require('./index');

var wands = [];
var discoverTime = null;
var DISCOVER_TIMEOUT_IN_SECONDS = 10;
var KEEP_ALIVE_INTERVAL_IN_SECONDS = 30;

noble.on('stateChange', function(state) {
  if (state === 'poweredOn') {
    console.log("Searching for wands ...");
    discoverTime = new Date();
    noble.startScanning();
  } else {
    console.log("WARN: Bluetooth is not enabled !!");
    noble.stopScanning();
  }
});

noble.on('discover', function(peripheral) {
  let deviceName = peripheral.advertisement.localName || "";
  if (deviceName.startsWith("Kano-Wand")) {
    console.log("Found Wand", deviceName);

    peripheral.connect(function(error) {
      var wand = new KanoWand(deviceName);
      wand.init(peripheral)
      .then(()=> {
        wands.push(wand);
        wand.vibrate(kano.PATTERN.REGULAR);

        wand.spells.subscribe((spell) => {
          console.log("spells:", spell);
        });

        wand.move.subscribe((data) => {
          //console.log("move:", data);
        });

        wand.onFlick.subscribe((data) => {
          console.log("onFlick", data);
        });

        wand.whileFlick.subscribe((data) => {
          //console.log("whileFlick", data);
        });

        wand.button.subscribe((state) => {
          console.log("button:", state);
          if (state === "reset") {
            wand.vibrate(kano.PATTERN.BURST);
            wand.setLed(true, "#31FFA6");
          }
        });

        wand.battery.subscribe((state) => {
          console.log("Battery status:",state);
        });

        // Wait for the wand startup led animation to finish
        setTimeout(function() {
          wand.setLed(true, "#206EFF");
        }, 3500);

        wand.aliveInterval = setInterval(() => {
          wand.keepAlive();
        }, 1000 * KEEP_ALIVE_INTERVAL_IN_SECONDS);
      });
    });

    peripheral.once('disconnect', (data) => {
      peripheral.disconnect();
      console.log(peripheral.advertisement.localName, ' disconnected !');
      for( var i = 0; i < wands.length; i++){
        if ( wands[i].name === peripheral.advertisement.localName) {
          clearInterval(wands[i].aliveInterval);
          wands.splice(i, 1);
        }
      }
      discoverTime = new Date();
      noble.startScanning();
    });
  }

  if (((new Date().getTime() - discoverTime.getTime()) / 1000) > DISCOVER_TIMEOUT_IN_SECONDS) {
    noble.stopScanning();
    console.log("Stop Scanning");
  }

});

process.stdin.on('keypress', (str, key) => {
  if (key.ctrl && key.name === 'c') {
    process.exit();
  } else {
    wand.reset_position();
  }
});