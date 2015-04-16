try {
    module.exports = require('fs-ext');
    return;
}
catch (err) {
    // fs-ext not installed, limp along without
    console.log("qfputs: fs-ext not installed, putting append-only without flock");
    module.exports = emulateFse();
    return;
}

function emulateFse() {
    fs = require('fs');
    return {
        // emulate the calls needed by FileWriter, flock and flockSync
        flock: function(fd, flag, cb) { if (cb) cb(null); },
        flockSync: function(fd, flag) { },
    };
}
