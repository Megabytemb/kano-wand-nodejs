var noble = require('noble-mac');
const KanoWand = require('./index');

var wand = new KanoWand();

noble.on('stateChange', function(state) {
    if (state === 'poweredOn') {
      noble.startScanning();
    } else {
      noble.stopScanning();
    }
  });
  
  noble.on('discover', function(peripheral) {
      let deviceName = peripheral.advertisement.localName || "";
      if (deviceName.startsWith("Kano-Wand")) {
        noble.stopScanning();
        console.log("foundWand");
        
        peripheral.connect(function(error) {
            wand.init(peripheral)
            .then(()=> {
                wand.vibrate(1);
            });
        });
      }

  });

wand.spells.subscribe((spell) => {
    console.log(spell);
});

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit();
    } else {
      wand.reset_position();
    }
  });