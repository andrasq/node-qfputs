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
var aflow = require('aflow');

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
    var opts = typeof openmode === 'object' ? openmode : {openmode: openmode};
    openmode = opts.openmode || "a";
    var writesize = opts.writesize || 102400;

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
    this._writebuf = new Buffer(writesize * 1.25);
}

FileWriter.prototype = {

    _reopenFd: function _reopenFd(callback) {
        var self = this;
        var mode = this.isFirstOpen ? this.openmode : this.reopenmode;

        if (this.fd !== undefined) {
            try { fs.closeSync(this.fd); } catch (err) { console.log("FileWriter._reopenFd: closeSync: " + err.message) }
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
            var buf, nbytes;
            if (Buffer.isBuffer(str)) {
                buf = str;
                nbytes = buf.length;
            }
            else {
                // reuse the write buffer as much as possible, to cut down on rss churn
                buf = self._writebuf;
                nbytes = buf.write(str);
                if (nbytes > buf.length - 4) {
                    buf = new Buffer(str);
                    nbytes = buf.length;
                }
            }
            // write(fd, buf, bufOffset, byteCount, fileOffset, cb)
            fs.write(fd, buf, 0, nbytes, null, function(err, nb) {
                flockSync(fd, "un");
                cb(err, nb);
            });
        });
    },

    // close the file
    close: function close( ) {
        try { if (this.fd) fs.closeSync(this.fd); }
        catch (err) { console.log("FileWriter.close: closeSync: " + err.message) }
        this.fd = undefined;
    },

    // rename the file and wait for write activity to cease
    mutexTimeout: 5000,
    renameFile: function renameFile( oldName, newName, waitMs, callback ) {
        if (!callback && typeof waitMs === 'function') {
            callback = waitMs;
            waitMs = 50;
        }
        var mutexTimeout = (this && this.mutexTimeout) ? this.mutexTimeout : FileWriter.mutexTimeout;
        var fd, guard;

        aflow.series([
            function(cb) {
                // only rename if the source exists, otherwise an empty newName would be created "wx" below
                // note: race condition: if the source disappears, an empty newName can be created anyway
                // note: filesystem metadata operations like open/close are much much faster as sync
                // an ENOENT error from here means the source file oldName does not exist
                // note: aflow.series catches errors thrown in these functions
                fs.closeSync(fs.openSync(oldName, "r"));
                cb();
            },
            function(cb) {
                // renameSync overwrites an existing newName, does not throw an error
                // prevent a rename-rename race condition by first getting exclusive rights to newName
                // an EEXIST error from here means the target file newName already exists
                fs.closeSync(fs.openSync(newName, 'wx'));
                cb();
            },
            function(cb) {
                // the actual rename
                fs.renameSync(oldName, newName);
                cb();
            },
            function(cb) {
                // Wait for all writers to release the file.  After waitMs no writer will reuse an old fd
                setTimeout(cb, waitMs);
            },
            function(cb) {
                // obtain a write lock on the file to ensure that the very last write is done.
                // Error out if the write takes longer than mutexTimeout to finish.
                // an ENOENT or EACCESS from here means the target file was deleted or read-protected
                var done = false;
                function cbOnce(err) { if (!done) { done = true; cb(err) } }
                guard = setTimeout(function() {
                    cbOnce(new Error("timed out waiting for last write to finish"));
                }, mutexTimeout);
                fd = fs.openSync(newName, 'r');
                fse.flock(fd, 'ex', cbOnce);
            },
        ],
            function(err) {
                // the renamed file, still locked by us, is ready to use
                if (guard && global.clearTimeout) clearTimeout(guard);
                // closing the file descriptor also releases the lock
                if (fd !== undefined) try { fs.closeSync(fd) } catch (e) { err = err || e }
                return callback(err);
            }
        )
    },
}

// expose renameFile as class method also
FileWriter.mutexTimeout = FileWriter.prototype.mutexTimeout;
FileWriter.renameFile = FileWriter.prototype.renameFile;
