try {
    module.exports = require('fs-ext');
}
catch (err) {
    // fs-ext not installed, limp along without
    console.log("qfputs: fs-ext not installed, putting append-only without flock");
    module.exports = emulateFse();
}

function emulateFse() {
    fs = require('fs');
    return {
        // seek and flock are not supported by fs, fall back to append-only mode
        open: function(filename, mode, cb) { return fs.open(filename, "a", cb); },
        openSync: function(filename, mode) { return fs.openSync(filename, mode); },
        closeSync: function(fd) { fs.close(fd) },
        write: function(fd, buf, from, to, filepos, cb) { return fs.write(fd, buf, from, to, filepos, cb); },
        seekSync: function(fd, offset, whence) { },
        flock: function(fd, flag, cb) { if (cb) cb(null); },
    };
}
