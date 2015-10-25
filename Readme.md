qfputs
======

Fast buffered line-at-a-time output, similar to the C/C++ `fputs()`

Data is buffered and written in batches in the background.  Uses any
data writer with a `write()` method taking a callback, eg node write
streams.

Write errors are reported only to drain() or fflush(), so use them to check.

For high file write speeds, the built-in `Fputs.FileWriter` can achieve
throughputs of over 800k / sec mutexed 200-char lines saved to disk.

----
## Summary

        var fs = require('fs');
        var Fputs = require('qfputs');

        var fp = new Fputs(fs.createWriteStream("out", "a"));
        for (var i = 0; i < 10000; i++) {
            fp.fputs("Hello, line!\n");
        }

        fp.fflush(function(err) {
            // all done!
        });

----
## Installation

        npm install git://github.com/andrasq/node-qfputs
        npm test qfputs

----
## Methods

### new Fputs( writable, [options] )

Fputs constructor, return an Fputs that flushes to the writable.
Writable can be an object with a `write(text, callback)` method, or a
string filename.  If a string, an Fputs.FileWriter will be used (see below).

Options:

        writemode:   file open mode to use with a filename writable, default 'a'
        writesize:   number of chars to write per chunk, default 100k
        highWaterMark:  the number of chars buffered before write returns false, default writesize

### fputs( line )

Append the line to the file.  If the line is not already newline terminated,
it will get a newline appended.

Returns true, or false if the buffer is above the highWaterMark.

### write( string, [callback()] )

Append the string to the file.  Newline termination is presumed, but not checked.
This call is intended for bulk transport of newline delimited data.
The caller is responsible for splitting the bulk data on line boundaries.

The callback is optional.  If provided, it is called as soon as the data
is buffered, not when actually written.  Use fflush() to wait for the
write to complete and check for errors.

Returns true, or false if the buffer is above the highWaterMark.

### drain( [maxUnwritten], callback(error) )

Wait for the un-written buffered data to shrink to no more than maxUnwritten
chars.  If maxUnwritten is omitted, the built-in default of 400 KB is used.

If write errors occurred since the last call to fflush or drain, the callback
will be called with first write error, the error state cleared.

### fflush( callback(error) )

Wait for all buffered data to be written.

If write errors occurred since the last call to fflush or drain, the callback
will be called with first write error, and the error state cleared.

### renameFile( oldName, newName, [waitMs,] callback(err) )

Convenience function, exposes writable.renameFile.

## Helper Classes

### Fputs.FileWriter

The included FileWriter class is designed for shared-access streaming data logging.
Writes are made under an exclusive flock advisory lock, and the file is
reopened frequently to allow the logfile to be removed for further processing.

On initial open the specified openmode is used.  File handles are used for at
most .05 seconds, then are reopened.  On reopen, files initially opened 'w' or
'w+' are reopened 'r+' to not overwrite the just written contents.

#### new Fputs.FileWriter( filename, [openmode|opts] )

Create a FileWriter that will append the named file.  The file is "lazy"
created/opened on first access.  The default openmode is 'a', append-only.

        var Fputs = require('qfputs');
        var fp = new Fputs(new Fputs.FileWriter("out", "a"));

        fp.fputs("Hello, line!\n");

If instead of an openmode string an options object is given, the fields are

- `openmode` - file open mode, default 'a'
- `writesize` - written data target size, default 102400

#### write( data, callback(error, numBytes) )

Write the data to the file, and call callback when done.  Writes are done under an
exclusive write lock, `flock(LOCK_EX)`, to guarantee the integrity of the data with
multiple simultaneous updates.  Data can be either an utf8 string or a Buffer.

The FileWriter callback is called after the write completes.

#### renameFile( oldName, newName, [waitMs,] callback(err) )

Rename the logfile and wait for writes to settle.  It is assumed that new
writes can start for only at most `waitMs` milliseconds before the writers
reopen the old filename.  The FileWriter built-in reopen interval is 50 ms.
Times out if a write takes longer than fp.mutexTimeout seconds (5 sec default).

## Notes

- The included Fputs.FileWriter tries to use `fs-ext`, which is a C++ extension.
  If fs-ext is not installed, the output file will not be locked for writes.
