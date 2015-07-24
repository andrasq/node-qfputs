/**
 * FileWriter -- fast non-streaming file appender for accepting buffered data
 *
 * Locks the file when appending to be safe with multiple writers.
 * Also, it reopens the file periodically, to make it work with logrotate.
 *
 * Copyright (C) 2014-2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

var fs = require('fs');
var fse = require('./fs-ext.js');

var flock = fse.flock;
var flockSync = function( fd, mode ) {
    try { fse.flockSync(fd, mode); return true }
    catch (err) { return false }
}

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
    this.reopenmode = this.openmode[0] !== 'w' ? openmode : ((openmode[1] === '+' || openmode[1] === 'r') ? 'a+' : 'a');
    this.reopenInterval = 50;   // do not reuse for more than .05 seconds
    this.reopenTime = 0;
    this.isFirstOpen = true;
    this.fd = undefined;

    this._reopenFd = function(callback) {
        if (this.fd !== undefined) {
            fs.closeSync(this.fd);
            this.fd = undefined;
        }

        var self = this;
        var mode = this.isFirstOpen ? this.openmode : this.reopenmode;
        // setTimeout would be faster than Date.now, but must guarantee .05 sec
        this.reopenTime = Date.now() + this.reopenInterval;
        fs.open(this.filename, mode, function(err, fd) {
            if (err) {
                if (err.message.indexOf("ENOENT, ") === 0 &&
                    self.openmode[0] !== 'r' &&
                    !self.isFirstOpen)
                {
                    // if file was removed since the last open, and ok to create, create it anew
                    self.isFirstOpen = true;
                    return self._reopenFd(callback);
                }
                return callback(err);
            }
            self.isFirstOpen = false;
            self.fd = fd;
            callback(null, fd);
        });
    };

    this._getFd = function(callback) {
        if (this.fd !== undefined) return callback(null, this.fd);
        else return this._reopenFd(callback);
    };

    this._getLockedFd = function(callback) {
        var self = this;
        this._getFd(function(err, fd) {
            if (err) return callback(err);
            flock(fd, "ex", function(err) {
                if (err) return callback(err);
                if (Date.now() < self.reopenTime) {
                    // grab and lock the fd and only then test reopenTime, since
                    // the expectation is that most writes will be bunched
                    return callback(null, fd);
                }
                else {
                    flockSync(fd, "un");
                    self._reopenFd(function(err, fd) {
                        if (err) return callback(err);
                        self._getLockedFd(callback);
                    });
                }
            });
        })
    };

    this.write = function(str, cb) {
        var self = this;
        this._getLockedFd(function(err, fd) {
            if (err) return cb(err);
            // not much benefit to reusing a buffer for the writes
            var buf = new Buffer(str);
            fs.write(fd, buf, 0, buf.length, null, function(err, nb) {
                flockSync(fd, "un");
                if (err) return cb(err);
                // hack: prevent buf from being gc`d too early
                cb(null, nb, buf);
            });
        });
    };

    this.close = function( ) {
        try { if (this.fd) fs.closeSync(this.fd); }
        catch (err) { }
        this.fd = undefined;
    };
}
