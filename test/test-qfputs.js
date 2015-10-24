// qfputs test
// Copyright (C) 2014 Andras Radics
// Licensed under the Apache License, Version 2.0

var fs = require('fs');
var fse = require('fs-ext');

var Fputs = require('../index.js');
var FileWriter = require('../lib/filewriter.js');

function uniqid( ) {
    return Math.floor(Math.random() * 0x100000000).toString(16);
}

module.exports = {
    setUp: function(cb) {
        var tempfile = "/tmp/nodeunit-" + process.pid + ".tmp";
        var tempfile2 = "/tmp/nodeunit-" + process.pid + "-2.tmp";
        try { fs.unlinkSync(tempfile); } catch (e) {}
        this.tempfile = tempfile;
        this.tempfile2 = tempfile2;
        this.mockWriter = {
            written: [],
            write: function(str, cb) { this.written.push(str); cb(); },
            fflush: function(cb) { cb(); },
            sync: function(cb) { cb(); },
            getContents: function() { return this.written.join(''); },
        };

        this.fileWriter = new Fputs.FileWriter(tempfile, "a");
        this.fileWriter.getContents = function() { return "" + fs.readFileSync(this.tempfile); }

        this.writer = this.mockWriter;
        this.fp = new Fputs(this.writer);

        cb();
    },

    tearDown: function(cb) {
        try { fs.unlinkSync(this.tempfile); } catch (e) {}
        try { fs.unlinkSync(this.tempfile2); } catch (e) {}
        cb();
    },

    'package should be valid json': function(t) {
        json = require('../package.json');
        t.done();
    },

    'should expose FileWriter class': function(t) {
        t.equal(Fputs.FileWriter, FileWriter);
        t.done();
    },

    'should expose FileWriter.renameFile class method': function(t) {
        t.equal(Fputs.renameFile, FileWriter.renameFile);
        t.done();
    },

    'should expose FileWriter.renameFile as an instance method': function(t) {
        t.equal(this.fileWriter.renameFile, FileWriter.renameFile);
        t.done();
    },

    'fputs should lazy create the logfile': function(t) {
        var fp = new Fputs(this.tempfile);
        t.expect(1);
        try {
            fs.statSync(this.tempfile);
            t.ok(false, "logfile should not exist yet");
        } catch (err) { t.ok(true); }
        t.done();
    },

    'should create writable file with default write mode': function(t) {
        var fp = new Fputs.FileWriter(this.tempfile);
        var self = this;
        fp.write("one\ntwo\n", function(err) {
            t.ifError(err);
            t.equals(fs.readFileSync(self.tempfile), "one\ntwo\n");
            t.done();
        });
    },

    'fputs should write contents soon': function(t) {
        var line = "test line " + uniqid() + "\n";
        this.fp.fputs(line);
        var self = this;
        setTimeout(function(err) {
            t.ifError(err);
            t.equals(self.writer.getContents(), line);
            t.done();
        }, 10);
    },

    'fputs should not clobber write-only files on reopen': function(t) {
        var line1 = "test line " + uniqid() + "\n";
        var line2 = "test line " + uniqid() + "\n";
        var self = this;
        fp = new Fputs(new Fputs.FileWriter(self.tempfile, "w"));
        fp.fputs(line1);
        setTimeout(function() {
            fp.fputs(line2);
            fp.fflush(function(err) {
                t.ifError(err);
                t.equal(fs.readFileSync(self.tempfile), line1 + line2);
                t.done();
            });
        }, 25);
    },

    'fputs should get newline terminated': function(t) {
        var line = "test line " + uniqid();
        this.fp.fputs(line);
        var self = this;
        setTimeout(function(err) {
            t.ifError(err);
            t.equals(self.writer.getContents(), line + "\n");
            t.done();
        }, 10);
    },

    'fflush should write pending data': function(t) {
        var line = "test line";
        this.fp.fputs(line);
        var self = this;
        t.expect(2);
        this.fp.fflush(function(err) {
            t.ifError(err);
            var contents = self.writer.getContents();
            t.equals(contents, line + "\n");
            t.done();
        });
    },

    'fflush should return write errors': function(t) {
        writer = new Fputs.FileWriter("/nonesuch", "a");
        fp = new Fputs(writer);
        fp.write("data");
        fp.fflush(function(err) {
            t.ok(err instanceof Error);
            t.done();
        });
    },

    'drain should write pending data': function(t) {
        this.fp.fputs("test 1\n");
        var self = this;
        this.fp.drain(0, function(err) {
            t.ifError(err);
            t.equal(self.writer.getContents(), "test 1\n");
            t.done();
        });
    },

    'drain should return write errors': function(t) {
        writer = new Fputs.FileWriter("/nonesuch", "a");
        fp = new Fputs(writer);
        fp.write("data");
        fp.drain(0, function(err) {
            t.ok(err instanceof Error);
            t.done();
        });
    },

    'write should write contents, without newline': function(t) {
        var line = "test line " + uniqid();
        this.fp.write(line);
        var self = this;
        this.fp.fflush(function() {
            var contents = self.writer.getContents();
            t.equals(contents, line);
            t.done();
        });
    },

    'write should take an optional callback': function(t) {
        t.expect(1);
        var self = this;
        this.fp.write("test callback", function(err) {
            t.ifError(err);
            // wait for the write to finish so tempfile can be removed.
            // Nodejs is async, the pending write can land in the next tests tempfile.
            self.fp.fflush(function() {
                t.done();
            });
        });
    },

    'write should return true if buffer has room': function(t) {
        var fp = this.fp;
        var ok = fp.write("test");
        t.equal(ok, true);
        t.done();
    },

    'write should return false if buffer is full': function(t) {
        var fp = this.fp;
        var nleft = fp.highWaterMark;
        while (nleft > 0) {
            fp.write("xxxxxxxxxxxxxxxxxxxx");
            nleft -= 20;
        }
        var ok = fp.write("test");
        t.equal(ok, false);
        t.done();
    },

    'constructor should accept a filename': function(t) {
        var fp = new Fputs(this.tempfile);
        fp.fputs("test");
        var self = this;
        fp.fflush(function(err) {
            t.ifError(err);
            t.equals(fs.readFileSync(self.tempfile), "test\n");
            t.done();
        });
    },

    'constructor should accept a writable object': function(t) {
        t.expect(1);
        var self = this;
        writer = fs.createWriteStream(this.tempfile, "a");
        var fp = new Fputs(writer);
        fp.write("data");
        fp.fflush(function() {
            var contents = "" + fs.readFileSync(self.tempfile);
            t.equals(contents, "data");
            t.done();
        });
    },

    'should write many lines of various sizes': function(t) {
        var i, line = "", expect = "";
        for (i=0; i<2000; i++) {
            line += "xxxx";
            expect += line + "\n";
            this.fp.fputs(line);
        }
        var tempfile = this.tempfile;
        t.expect(2);
        var self = this;
        this.fp.fflush(function(err) {
            t.ifError(err);
            var contents = "" + self.writer.getContents(tempfile);
            t.equals(contents, expect);
            t.done();
        });
    },

    'FileWriter.write should write entire string': function(t) {
        var self = this;
        this.fileWriter.write("test123", function(err) {
            t.equal(fs.readFileSync(self.tempfile), "test123");
            t.done();
        });
    },

    'FileWriter.write should limit bytes': function(t) {
        var self = this;
        this.fileWriter.write("test123", 5, function(err) {
            t.equal(fs.readFileSync(self.tempfile), "test1");
            t.done();
        });
    },

    'FileWriter.write should write buffers': function(t) {
        var self = this;
        this.fileWriter.write(new Buffer("test123"), function(err) {
            t.equal(fs.readFileSync(self.tempfile), "test123");
            self.fileWriter.write(new Buffer("test123"), 5, function(err) {
                t.equal(fs.readFileSync(self.tempfile), "test123test1");
                t.done();
            });
        });
    },

    'FileWriter.renameFile should rename file': function(t) {
        var self = this;
        fs.writeFileSync(this.tempfile, "test");
        Fputs.FileWriter.renameFile(self.tempfile, self.tempfile2, function(err) {
            t.equals(fs.readFileSync(self.tempfile2).toString(), "test");
            t.done();
        });
    },

    'FileWriter.renameFile should pause N ms': function(t) {
        var self = this;
        fs.writeFileSync(this.tempfile, "test2");
        var t1 = Date.now();
        t.expect(1);
        Fputs.FileWriter.renameFile(self.tempfile, self.tempfile2, 66, function(err) {
            t.ok(Date.now() >= t1 + 66);
            t.done();
        });
    },

    'FileWriter.renameFile should return EEXIST error, not pause and not overwrite if target already exists': function(t) {
        var self = this;
        fs.writeFileSync(this.tempfile, "test3a");
        fs.writeFileSync(this.tempfile2, "test3b");
        var t1 = Date.now();
        t.expect(4);
        Fputs.FileWriter.renameFile(self.tempfile, self.tempfile2, 66, function(err, ret) {
            t.ok(Date.now() < t1 + 5);
            t.ok(err instanceof Error);
            t.ok(err.message.indexOf('EEXIST') === 0);
            t.equal(fs.readFileSync(self.tempfile2), "test3b");
            t.done();
        });
    },

    'should expose FileWriter.renameFile on fputs instances': function(t) {
        var fp = new Fputs(this.fileWriter);
        t.equals(Fputs.FileWriter.renameFile, fp.renameFile);
        t.done();
    },

    'FileWriter.renameFile should wait for ongoing write to finish': function(t) {
        fs.writeFileSync(this.tempfile, "test4");
        var fd = fs.openSync(this.tempfile, 'r');
        fse.flockSync(fd, 'ex') ;
        var t1 = Date.now();
        setTimeout(function(){ fse.flockSync(fd, 'un'); fs.closeSync(fd) }, 125);
        var self = this;
        t.expect(2);
        Fputs.FileWriter.renameFile(this.tempfile, this.tempfile2, function(err, ret) {
            t.ok(Date.now() >= t1 + 125);
            t.equal(fs.readFileSync(self.tempfile2).toString(), "test4");
            t.done();
        });
    },

    'FileWriter.renameFile should time out after mutexTimeout': function(t) {
        fs.writeFileSync(this.tempfile, "test4");
        var fd = fs.openSync(this.tempfile, 'r');
        fse.flockSync(fd, 'ex') ;
        var t1 = Date.now();
        setTimeout(function(){ fse.flockSync(fd, 'un'); fs.closeSync(fd) }, 200);
        var self = this;
        t.expect(3);
        Fputs.FileWriter.mutexTimeout = 125;
        Fputs.FileWriter.renameFile(this.tempfile, this.tempfile2, function(err, ret) {
            t.ok(err);
            t.ok(Date.now() >= t1 + 125);
            t.ok(Date.now() < t1 + 200);
            // note: node does not exit while fd is locked
            fse.flockSync(fd, 'un');
            t.done();
        });
    },
}
