'use strict';

if (process.argv.join(' ').indexOf('qnit ') >= 0) return;

var fs = require('fs');
var fputs = require('../');
var setImmediate = global.setImmediate || process.nextTick;

var filename = '/tmp/test.out';

var fp = fputs(fputs.FileWriter(filename, 'a'), { writeSize: 40960 });
var str = new Array(200).join('x') + '\n';
var nlines = 0;

console.time('100k fputs');
repeatFor(100000, function(cb) { fp.fputs(str); cb() }, function(err) {
    fp.fflush(function(err) {
        console.timeEnd('100k fputs');
        fs.unlinkSync(filename);
    });
})

// repeatFor adapted from minisql:
function repeatFor(n, proc, callback) {
    var ix = 0, ncalls = 0;
    (function _loop(err) {
        if (err || n-- <= 0) return callback(err);
        (ncalls++ > 100) ? setImmediate((++n, (ncalls = 0), _loop)) : proc(_loop, (ix++));
    })();
}
