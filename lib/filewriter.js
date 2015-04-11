/**
 * FileWriter -- fast non-streaming file appender for accepting buffered data
 *
 * Locks the file when appending to be safe with multiple writers.
 * Also, it reopens the file periodically, to make it work with logrotate.
 *
 * Copyright (C) 2014 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var fse = require('./fs-ext.js');

fse.SEEK_SET = 0;
fse.SEEK_CUR = 1;
fse.SEEK_END = 2;

module.exports = function FileWriter( filename, openmode ) {
    'use strict';

    if (!(this instanceof FileWriter)) return new FileWriter(filename, openmode);
    if (!filename) throw new Error("missing filename");

    this.filename = filename;
    this.openmode = openmode || "a";
    // do not overwrite contents when reopening file, use a instead of w
    this.reopenmode = openmode[0] !== 'w' ? openmode : ((openmode[1] === '+' || openmode[1] === 'r') ? 'a+' : 'a');
    this.reopenInterval = 50;
    this.reopenTime = 0;

    this._getFd = function(callback) {
        // faster to close this.fd on a setTimeout, but must guarantee < 50ms fd reuse limit
        if (Date.now() < this.reopenTime) return callback(undefined, this.fd);

        if (this.fd !== undefined) fse.closeSync(this.fd);

        var self = this;
        var mode = this.reopenTime ? this.reopenmode : this.openmode;
        fse.open(this.filename, mode, function(err, fd) {
            if (err) {
                if (err.message.indexOf("ENOENT, ") === 0 &&
                    self.openmode[0] !== 'r' &&
                    self.reopenTime !== 0)
                {
                    // if file was removed since the last open, and ok to create, create it anew
                    self.reopenTime = 0;
                    return self._getFd(callback);
                }
                return callback(err);
            }
            self.fd = fd;
            self.reopenTime = Date.now() + self.reopenInterval;
            callback(null, fd);
        });
    }

    this.write = function(str, cb) {
        var self = this;
        this._getFd(function(err, fd) {
            if (err) return cb(err);
            // not much benefit to reusing a buffer for the writes
            var buf = new Buffer(str);
            fse.flock(fd, "ex", function(err) {
                if (err) return cb(err);
                fse.write(fd, buf, 0, buf.length, null, function(err, nb) {
                    fse.flockSync(fd, "un");
                    if (err) return cb(err);
                    // hack: prevent buf from being gc`d too early
                    cb(undefined, nb, buf);
                });
            });
        });
    };
}
