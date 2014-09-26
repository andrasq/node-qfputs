qfputs
======

Fast buffered line-at-a-time output.

Data is buffered and written in batches in the background.  Uses any
data writer with a `write()` method taking a callback, like node write
streams.

Write errors are reported only to drain() or fflush(), so use them to check.

For high file write speeds, the built-in `Fputs.FileWriter` can achieve
throughputs of over 800k 200-char lines / sec saved to disk.

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
## Methods

### new Fputs(writable, opts)

Fputs constructor, return an Fputs that flushes to the writable.
Writable can be an object with a write(text, callback) method, or a
string filename.

### fputs(line)

Append the line to the file.  If the line is not already newline terminated,
it will get a newline appended.

### write(string, callback)

Append the text to the file.  Newline termination is presumed, but not checked.
This call is intended for bulk transport of newline delimited data.

The callback is called as soon as the data is buffered, not when written.
Use fflush() to test for write errors.

### drain([maxUnwritten], callback)

Wait for the un-written buffered data to shrink to no more than maxUnwritten
chars.  If maxUnwritten is omitted, the built-in default of 400 KB is assumed.

### fflush(callback)

Wait for all buffered data to be written.

## Helper Classes

### Fputs.FileWriter

The included FileWriter class is designed for shared streaming data logging.
Writes are made under an exclusive flock advisory lock, and the file is
reopened frequently to allow the logfile to be removed for furthe processing.

#### new Fputs.FileWriter(filename, openmode)

Create a FileWriter.

        var Fputs = require('qfputs');
        var fp = new Fputs(new Fputs.FileWriter("out", "a"));

        fp.fputs("Hello, line!\n");
#### write(string, callback)

Write the text to the file, and call callback when done.

Unlinke Fputs write, the FileWriter callback is called after the write completes.
