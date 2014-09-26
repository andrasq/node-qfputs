// qfputs test
// Copyright (C) 2014 Andras Radics
// Licensed under the Apache License, Version 2.0

var fs = require('fs');

var Fputs = require('../index.js');

function uniqid( ) {
    return Math.floor(Math.random() * 0x100000000).toString(16);
}

module.exports = {
    setUp: function(cb) {
        var tempfile = this.tempfile = "/tmp/nodeunit-" + process.pid + ".tmp";
        this.mockWriter = {
            written: [],
            write: function(str, cb) { this.written.push(str); cb(); },
            fflush: function(cb) { cb(); },
            sync: function(cb) { cb(); },
            getContents: function() { return this.written.join(''); },
        };

        this.fileWriter = new Fputs.FileWriter(tempfile, "a");
        this.fileWriter.getContents = function() { return "" + fs.readFileSync(tempfile); }

        this.writer = this.mockWriter;
        this.fp = new Fputs(this.writer);

        cb();
    },

    tearDown: function(cb) {
        try { fs.unlinkSync(this.tempfile); } catch (e) {}
        cb();
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
            // nodeunit FIXIT: an error thrown here yields "Undone tests" but is not displayed
            t.ifError(err);
            var contents = "" + self.writer.getContents(tempfile);
            t.equals(contents, expect);
            t.done();
        });
    },
}
