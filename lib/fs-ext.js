try {
    module.exports = require('fs-ext');
    return;
}
catch (err) {
    // fs-ext not installed, limp along without
    console.log("qfputs: fs-ext not installed, putting append-only without flock");
    fs = require('fs');
    dummyFs = {
        open: function(filename, mode, cb) { return fs.open(filename, "a", cb); },
        openSync: function(filename, mode) { return fs.openSync(filename, mode); },
        write: function(fd, buf, from, to, filepos, cb) { return fs.write(fd, buf, from, to, filepos, cb); },
        // seek and flock are not supported, hence use append-only mode
        seekSync: function(fd, offset, whence) { },
        flock: function(fd, flag, cb) { if (cb) cb(null); },
    };
    module.exports = dummyFs;
    return;
}
