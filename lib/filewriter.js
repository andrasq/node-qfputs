/**
 * FileWriter -- fast non-streaming file appender for accepting buffered data
 *
 * Locks the file when appending to be safe with multiple writers.
 * Also, it reopens the file periodically, to make it work with logrotate.
 *
 * Copyright (C) 2014-2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var fs = require('fs');
var fse = require('./fs-ext.js');

var flock = fse.flock;
var flockSync = function( fd, mode ) {
    try { fse.flockSync(fd, mode); return true }
    catch (err) { return err }
}

fse.SEEK_SET = 0;
fse.SEEK_CUR = 1;
fse.SEEK_END = 2;

module.exports = FileWriter;

function FileWriter( filename, openmode ) {
    if (!(this instanceof FileWriter)) return new FileWriter(filename, openmode);
    if (!filename) throw new Error("missing filename");
    openmode = openmode || "a";

    this._isFileWriter = true;
    this.filename = filename;
    this.openmode = openmode;
    this.reopenmode = openmode;
    if (openmode[0] === 'w') {
        // do not overwrite contents when reopening file, use a instead of w, a+ instead of wr, w+
        this.reopenmode = (openmode[1] === '+' || openmode[1] === 'r') ? 'a+' : 'a';
    }
    this.reopenInterval = 50;   // do not reuse for more than .05 seconds
    this.reopenTime = 0;
    this.isFirstOpen = true;
    this.fd = undefined;
}

FileWriter.prototype = {

    _reopenFd: function _reopenFd(callback) {
        var self = this;
        var mode = this.isFirstOpen ? this.openmode : this.reopenmode;

        if (this.fd !== undefined) {
            fs.closeSync(this.fd);
            this.fd = undefined;
        }

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
    },

    _getFd: function _getFd(callback) {
        if (this.fd !== undefined) return callback(null, this.fd);
        else return this._reopenFd(callback);
    },

    _getLockedFd: function _getLockedFd(callback) {
        var self = this;
        this._getFd(function(err, fd) {
            if (err) return callback(err);
            flock(fd, "ex", function(err) {
                if (err) return callback(err);
                if (Date.now() < self.reopenTime) {
                    // grab and lock the fd and only then test reopenTime, since
                    // the expectation is that most writes will be bunched
                    // NOTE: this is also needed for correct renameFile
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
    },

    // atomically append the string to the file
    write: function write(str, cb) {
        var self = this;
        this._getLockedFd(function(err, fd) {
            if (err) return cb(err);
            // not much benefit to reusing a buffer for the writes
            var buf = new Buffer(str);
            fs.write(fd, buf, 0, buf.length, null, function(err, nb) {
                flockSync(fd, "un");
                cb(err, nb);
            });
        });
    },

    // close the file
    close: function close( ) {
        try { if (this.fd) fs.closeSync(this.fd); }
        catch (err) { }
        this.fd = undefined;
    },

    // rename the file and wait for write activity to cease
    mutexTimeout: 5000,
    renameFile: function renameFile( oldName, newName, waitMs, cb ) {
        if (!cb && typeof waitMs === 'function') {
            cb = waitMs
            waitMs = 50
        }
        // Wait for all pending writes to finish.  After waitMs no writer will reuse the old fd,
        // and once we`ve paused and have the mutex we know that no more writes will occur.
        var fd = null, mutexTimeout = (this && this.mutexTimeout) ? this.mutexTimeout : FileWriter.mutexTimeout;
        function waitForWritesToFinish( ) {
            var guard, error = null
            function finish(err) {
                if (fd !== null) fs.close(fd, function(){})
                fd = null
                if (guard && global.clearTimeout) clearTimeout(guard)
                guard = null
                return error ? cb(error) : cb(err)
            }
            try {
                guard = setTimeout(function() {
                    if (fd !== null) fs.close(fd, function(){})
                    error = new Error("timed out waiting for last write")
                    return finish(error)
                }, mutexTimeout)
                if (guard.unref) guard.unref()
                fd = fs.openSync(newName, 'r')
                fse.flock(fd, 'ex', function() {
                    try {
                        fse.flockSync(fd, 'un')
                        fs.closeSync(fd)
                        if (!error) return finish()
                    }
                    catch (err) {
                        if (!error) return finish(err)
                    }
                })
            }
            catch (err) {
                // open error, eg ENOENT or EACCESS
                return finish(err)
            }
        }
        try {
            // only rename if the source exists, else an empty target is created "wx"
            // note: race condition: if the source disappears, an empty newName can be created
            var rfd = fs.openSync(oldName, "r")
            fs.closeSync(rfd)
            // renameSync overwrites an existing newName, does not throw an error
            // prevent a rename-rename race condition by first getting exclusive rights to newName
            var fd = fs.openSync(newName, 'wx')
            fs.closeSync(fd)
            fs.renameSync(oldName, newName)
            setTimeout(waitForWritesToFinish, waitMs)
        }
        catch (err) {
            // source file ENOENT does not exist or target EEXIST exists or rename error
            return cb(err)
        }
    },
}

// expose renameFile as class method also
FileWriter.mutexTimeout = FileWriter.prototype.mutexTimeout;
FileWriter.renameFile = FileWriter.prototype.renameFile;
