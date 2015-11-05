/**
 * Fputs -- fast buffered line-at-a-time output
 *
 * Exports fputs() and write(), both buffer data and flush in the background.
 * Fputs will buffer an unbounded amount of data; use drain() to throttle.
 *
 * Copyright (C) 2014-2015 Andras Radics
 * Licensed under the Apache License, Version 2.0
 *
 * 2014-09-14 - AR.
 */

'use strict';

var setImmediate = global.setImmediate || process.nextTick;
var FileWriter = require('./filewriter');

module.exports = (function() {
    /**
     * Constructor, takes a writable (else a filename) and options.
     *
     * options:
     *     writemode:   file open mode, default 'a'
     *     writesize:   number of chars to write per chunk, default 100k
     */
    function Fputs( writable, opts ) {
        if (!(this instanceof Fputs)) return new Fputs(writable, opts);

        opts = opts || {};
        if (typeof writable === 'string') {
            // convert a string filename into a FileWriter writable
            writable = new Fputs.FileWriter(writable, opts.writemode || 'a');
        }
        if (!writable) writable = process.stdout;

        this.writable = writable;
        this.writesize = opts.writesize || 102400;
        this.highWaterMark = opts.highWaterMark || this.writesize;
        this.datachunks = [];
        this.unwrittenLength = 0;
        this.writtenLength = 0;
        this.resetCount = 0;
        this._syncing = false;

        this._error = null;
        this._onError = null;
        this.reportError = function(err) { if (!this._error) this._error = err; if (this._onError) this._onError(err) }
        this.returnError = function() { var err = this._error; this._error = null; return err; }
    }

    // export FileWriter on the Fputs class
    Fputs.FileWriter = FileWriter;


    // export renameFile as a QFputs class method and instance method
    Fputs.renameFile = FileWriter.renameFile;
    Fputs.prototype.mutexTimeout = FileWriter.mutexTimeout;
    Fputs.prototype.renameFile = FileWriter.renameFile;

    Fputs.prototype.reportError = function( err ) {
        if (!this._error) this._error = err;
        if (this._onError) this._onError(err);
    },

    Fputs.prototype.returnError = function( ) {
        var err = this._error;
        this._error = null;
        return err;
    },

    /**
     * Append a newline terminated string to the fifo.
     */
    Fputs.prototype.fputs = function fputs( str ) {
        if (typeof str !== 'string') str = "" + str;
        this.write((str[str.length - 1] === "\n") ? str : str + "\n");
    }

    /**
     * Write bulk data to the target.  Newline termination is not checked.
     */
    Fputs.prototype.write = function write( str, callback ) {
        if (typeof str !== 'string') str = "" + str;

        // merge writes into this.writesize sized data chunks
        // it is assumed that all writes end with a newline (not checked)
        var nchunks = this.datachunks.length;
        if (nchunks > 0 && this.datachunks[nchunks-1].length + str.length <= this.writesize) {
            // the last chunk has space for more
            this.datachunks[nchunks-1] += str;
        }
        else {
            // else start a new chunk
            this.datachunks.push(str);
        }

        if (this.writtenLength && this.writtenLength >= this.unwrittenLength) {
            // reset the lengths to avoid numeric overflow
            this.writtenLength = this.unwrittenLength = 0;
            this.resetCount += 1;
        }
        this.unwrittenLength += str.length;

        if (!this._syncing) {
            // if not currently syncing, start the sync thread
            var self = this;
            setTimeout(function(){ self._sync(); }, 1);
            this._syncing = true;
        }

        if (callback) callback(null, str.length);
        return this.unwrittenLength - this.writtenLength <= this.highWaterMark;
    }

    /**
     * Wait until willing to accept more data.
     * Waiting is optional, writes are always buffered.
     */
    Fputs.prototype.drain = function drain( maxUnwritten, callback ) {
        if (this._error) return callback(this.returnError());

        if (!callback) {
            // The built-in heuristic is to buffer up to twice as much data
            // as is written in a single write.
            callback = maxUnwritten;
            maxUnwritten = 2 * this.writesize;
        }

        if (this.unwrittenLength - this.writtenLength <= maxUnwritten) {
            callback();
        }
        else {
            var self = this;
            setTimeout(function(){ self.drain(maxUnwritten, callback); }, 5);
        }
    }

    /**
     * Wait until all the data that has been written so far has been sent.
     */
    Fputs.prototype.fflush = function fflush( callback ) {
        if (this._error) return callback(this.returnError());
        var expectedWrittenLength = this.unwrittenLength;
        var self = this;
        var resetCount = this.resetCount;

        (function waitloop() {
            if (self.writtenLength >= expectedWrittenLength || self.resetCount != resetCount) {
                callback(self.returnError());
            }
            else setTimeout(waitloop, 1);
        })();
    }

    // the sync thread runs whenever there is data waiting,
    // and tries to write chunks ending on line boundaries
    Fputs.prototype._sync = function _sync( ) {
        if (this.datachunks.length <= 0) {
            this._syncing = false;
            return;
        }

        var chunk = this.datachunks.shift();
        var self = this;
        this.writable.write(chunk, function(err, ret) {
            self.writtenLength += chunk.length;
            if (err) self.reportError(err);
            if (self.datachunks.length > 1) setImmediate(function(){ self._sync(); });
            else if (self.datachunks.length > 0) setTimeout(function(){ self._sync(); }, 1);
            else self._syncing = false;
        });

        // This function is not reentrant, only one writer thread must run.
        // Writing must be sequential, else node will lose data; the below breaks (v0.10.31):
        //    % cat > tt.js << EOF
        //    fs = require('fs');
        //    fd = fs.openSync('out', 'w');
        //    ncalls = 0;
        //    for (i=0; i<100; i++) fs.write(fd, new Buffer("test\n"), 0, 5, null, function(err){ ncalls += 1; });
        //    setTimeout(function waitdone() {
        //        (ncalls < 100) ? setTimeout(waitdone, 10) : console.log("done", ncalls);
        //    }, 10);
        //    EOF
        //    % node-v0.10.31 tt.js
        //    done 100
        //    % wc -lc out
        //    37 185 out
    }

    // sync is an alias for fflush, for qlogger
    // TODO: make qlogger use fflush, then deprecate sync
    Fputs.prototype.sync = Fputs.prototype.fflush


    return Fputs;
})();
