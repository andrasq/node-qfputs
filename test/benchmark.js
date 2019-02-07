'use strict';

if (process.argv.join(' ').indexOf('qnit ') >= 0) return;

var fs = require('fs');
var aflow = require('aflow');
var fputs = require('../');

var filename = '/tmp/test.out';

var fp = fputs(fputs.FileWriter(filename, 'a'), { writeSize: 40960 });
var str = new Array(200).join('x') + '\n';
var nlines = 0;

console.time('100k fputs');
aflow.repeatUntil(
    function(cb) {
        fp.fputs(str);
        cb(null, ++nlines >= 100000);
    },
    function (err) {
        console.timeEnd('100k fputs');
        fs.unlinkSync(filename);
    }
);
