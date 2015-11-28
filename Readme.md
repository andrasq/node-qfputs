qfputs
======

Quick write-combining buffered string and binary data output.
Similar to [C puts()](http://www.cplusplus.com/reference/cstdio/puts/) or
[php fputs()](http://php.net/manual/en/function.fputs.php).

The data can be written as newline terminated lines with `fputs()`,
or in bulk with `write()`.  Lines, bulk data, strings and Buffers can
be mixed at will.

Data is buffered and written in batches in the background.  Uses any
data writer with a `write()` method taking a callback, eg node write
streams.

Install an error handler with `setOnError()` to be notified of all write errors.
Otherwise, write errors are reported to `drain()` or `fflush()`.

For high file write speeds, the built-in `Fputs.FileWriter` can handle
over a million 200-byte mutexed writes / second to disk (over 2 mill /sec
with node-v0.8).


Summary
-------

        var Fputs = require('qfputs');

        var fp = new Fputs(process.stdout);
        for (var i = 0; i < 10; i++) {
            fp.fputs("Hello, world!\n");
        }

        fp.fflush(function(err) {
            console.log("All done!");
        });


Installation
------------

        npm install git://github.com/andrasq/node-qfputs
        npm test qfputs


Methods
-------

### new Fputs( writable, [options] )

Fputs constructor, return an Fputs that flushes to the writable.
Writable can be an object with a `write(text, callback)` method, or a
string filename.  If a string, an Fputs.FileWriter will be used (see below).

Options:

- `writemode` - file open mode to use with a filename writable, default 'a'
- `writesize` - number of chars to write per chunk, default 100k
- `highWaterMark` - the number of chars buffered before write returns false, default writesize

### fputs( line )

Append the line to the file.  If the line is not already newline terminated,
it will get a newline appended, like C `puts()`.  Line must be a string, else
will be coerced to a string.

Returns true, or false if the buffer is above the highWaterMark.

### write( data, [callback()] )

Append the data to the file.  Newline termination is presumed, but not checked.
This call is intended for bulk transport of newline delimited data.
The caller is responsible for splitting the bulk data on line boundaries.
Data can be a string of a Buffer, else will be coerced to a string.  Data
items will be concatenated before being written for higher write speed.

The callback is optional.  If provided, it is called as soon as the data
is buffered, not when actually written.  Use fflush() to wait for the
write to complete and check for errors.

Returns true, or false if the buffer is above the highWaterMark.

### drain( [maxUnwritten], callback(error) )

Wait for the un-written buffered data to shrink to no more than maxUnwritten
chars.  If maxUnwritten is omitted, the built-in default of `2 * writesize`
(200 KB) is used.

If unreported write errors occurred since the last call to fflush or drain, the callback
will be called with first write error, the error state cleared.

### fflush( callback(error) )

Wait for all buffered data to be written.

If unreported write errors occurred since the last call to fflush or drain, the callback
will be called with first write error, and the error state cleared.

### setOnError( errorHandler(err) )

Call the error handler function on write errors instead of saving them for reprting
with `drain` or `fflush`.  In case of error the error handler will be called as
soon as the error is noticed, from the write callback, before the drain/fflush
callback runs.

If no error handler is installed, the first unreported error is returned in the
callback of the first `drain` or `fflush` to be called.

If the qfputs object is already in use when the error handler is installed, it can
be called immediately if there already is a waiting unreported error.

### renameFile( oldName, newName, [waitMs,] callback(err) )

Convenience function, exposes FileWriter.renameFile.


Helper Classes
--------------

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

#### renameFile( oldName, newName, [options,] callback(err) )

Rename the logfile and wait for writes to settle.  It is assumed that new
writes can start for only at most `waitMs` milliseconds before the writers
reopen the old filename.  The FileWriter built-in reopen interval is 50 ms.
Times out if a write takes longer than `mutexTimeout` seconds (5 sec default).

If `options` is a number it will be understood to mean `waitMs`.

Options:

- `waitMs` - milliseconds to wait for writes to settle (default 50)
- `mutexTimeout` - milliseconds to allow for an ongoing write to finish (default 5000)

Notes
-----

- The included Fputs.FileWriter uses `fs-ext`, which is a C++ extension.


ChangeLog
---------

### 1.5.0

- add support for write() of Buffer data, also mix of Buffer and string
- allow options to `renameFile`

### 1.4.2

- suppress fs.close errors
- check for errors of final renameFile closeSync

### 1.2.6

- fix double close in renameFile
- clean up renameFile timeout error handling

### 1.2.4

- backport renameFile close() race condition fix from 1.3

### 1.4.0

- setOnError() method

### 1.3.1

- bugfix: invoke callback only once if mutex timeout

### 1.3.0

- refactor renameFile using `aflow.series()`
- reuse a single filewriter Buffer to spare the process rss

### 1.2.2

- bugfix: use correct mutexTimeout in renameFile
- fix: do not create empty file in renameFile

### 1.2.1

- expose renameFile as QFputs class method and fp instance methods

### 1.2.0

- FileWriter.renameFile() class method

### 1.1.1

- bugfix: fix drain()

### 1.1.0

- highWaterMark option
- have write() return false/true depending on whether highWaterMark bytes buffered already

### 1.0.14

- guard against sync() errors in filewriter
- file filewriter openmode bug
- close race condition between writers and consumer
- make work with node-v0.8

### 1.0.9

- explicitly close `fd` when reopening the logfile
- reopen in `'a'` append mode when writing
- run even if no compatible `fs-ext` module is installed
- fix `fflush()` to wait just for own writes

### 1.0.0

- initial version, 2014-09-30


Todo
----

- maybe FileWriter.getLockedFd should use mutexTimeout?
