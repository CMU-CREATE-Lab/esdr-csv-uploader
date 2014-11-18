var fs = require('fs');
var log = require('log4js').getLogger("random-access-csv");

function RandomAccessCsv(config) {
   var file = config['file'];
   var hasHeaderRow = (typeof config['hasHeaderRow'] === 'undefined') ? true : config['hasHeaderRow'];
   var lineSeparator = config['lineSeparator'] || '\n';

   var fileSizeInBytes = fs.statSync(file)['size'];
   var fd = fs.openSync(file, 'r');

   var searchForCharacter = function(startingBytePosition, characterToFind, willSearchBackward) {
      willSearchBackward = !!willSearchBackward;
      var maxPosition = (typeof maxBytePos === 'undefined') ? fileSizeInBytes : maxBytePos;

      // Scan one byte at a time (yeah, yeah...I know, but it's easier this way) until we find the character or reach the
      // maxBytePos (or the beginning of the file if searching backwards)
      var pos = startingBytePosition;
      var buf = new Buffer(1);
      var searchDirection = willSearchBackward ? -1 : 1;
      var totalBytesRead = 0;
      do {
         var numBytesRead = fs.readSync(fd, buf, 0, buf.length, pos);
         totalBytesRead += numBytesRead;
         var c = buf.toString('utf8', 0, numBytesRead);
         if (c == characterToFind) {
            return pos;
         }
         pos += numBytesRead * searchDirection;
      }
      while (numBytesRead > 0 &&
             totalBytesRead < maxPosition &&
             pos >= 0 &&
             pos <= maxPosition);

      // didn't find the character
      return -1;
   };

   var getBytesAtPositionAsString = function(pos, numBytesToRead) {
      if (pos < minBytePos || pos >= fileSizeInBytes) {
         return null;
      }

      numBytesToRead = Math.min(numBytesToRead, fileSizeInBytes - pos + 1);
      var buf = new Buffer(numBytesToRead);
      var numBytesRead = fs.readSync(fd, buf, 0, buf.length, pos);
      return buf.toString('utf8', 0, numBytesRead);
   };

   // Returns the byte position of the last character of the last complete line.
   var findMaxBytePosition = function() {
      // get the position of the last byte of the file (subtract one since byte position is zero-based!)
      var pos = fileSizeInBytes - 1;

      // read that last byte
      var c = getBytesAtPositionAsString(pos, 1);

      // if the last byte is a lineSeparator, then we're done.  Otherwise, seek backwards until I find one.
      if (lineSeparator == c) {
         return pos;
      }
      return searchForCharacter(pos, lineSeparator, true);
   };

   var minBytePos = hasHeaderRow ? searchForCharacter(0, lineSeparator) + 1 : 0;
   var maxBytePos = findMaxBytePosition();

   /**
    * Returns the size of the file, in bytes.
    *
    * @return {int} the size of the file in bytes
    */
   this.sizeInBytes = function() {
      return fileSizeInBytes;
   };

   /**
    * Returns the position of the fist byte of the first line in the file (not counting the header line, if any).
    */
   this.getMinBytePosition = function() {
      return minBytePos;
   };

   /**
    * Returns the position of the last byte of the last complete line in the file (i.e. terminated by the line
    * separator).
    */
   this.getMaxBytePosition = function() {
      return maxBytePos;
   };

   /**
    * Finds the line containing the given byte position.  If the given position is invalid (less than the min byte
    * position or greater than the max byte position), this method returns <code>null</code>.  Otherwise, it returns
    * an object with the following fields:
    *
    * <ul>
    *    <li><code>startPos</code>: byte position of the first character in the line</li>
    *    <li><code>endPos</code>: byte position of the last character in the line (i.e. the line separator)</li>
    *    <li><code>line</code>: the line, as a string</li>
    * </ul>
    *
    * @param pos
    * @return {*}
    * @see getMinBytePosition()
    * @see getMaxBytePosition()
    */
   this.getLineContainingBytePosition = function(pos) {
      // Get the character at this position.  If it's null, then we know the pos is out of bounds, so just return null
      var c = getBytesAtPositionAsString(pos, 1);
      if (c != null) {
         // If the character at this position is a lineSeparator, then we know we've already found an end of a line,
         // so just search backwards to find the beginning. Otherwise, search backwards and forwards to find the ends of
         // the line.
         var startingBytePos;
         var endingBytePos;
         if (c == lineSeparator) {
            startingBytePos = searchForCharacter(pos - 1, lineSeparator, true) + 1;
            endingBytePos = pos;
         }
         else {
            startingBytePos = searchForCharacter(pos, lineSeparator, true) + 1;
            endingBytePos = searchForCharacter(pos, lineSeparator);
         }

         // TODO: optimize this to eliminate redundant reads
         if (startingBytePos != -1 && endingBytePos != -1) {
            var numBytes = endingBytePos - startingBytePos + 1;
            return {
               startPos : startingBytePos,
               endPos : endingBytePos,
               line : getBytesAtPositionAsString(startingBytePos, numBytes)
            };
         }
      }

      return null;
   };

   this.getFirstRecord = function() {
      return this.getLineContainingBytePosition(this.getMinBytePosition());
   };

   this.getLastRecord = function() {
      return this.getLineContainingBytePosition(this.getMaxBytePosition());
   };

   this.readLines = function(startingBytePos, numLines) {
      var lines = [];
      if (startingBytePos < minBytePos ||
          startingBytePos >= fileSizeInBytes ||
          numLines < 1) {
         return lines;
      }

      var chunk = new Buffer(4096);    // TODO: make this configurable?
      var previousLineData = null;
      var pos = startingBytePos;
      do {
         var numBytesRead = 0;
         if (pos <= maxBytePos) {
            var numBytesToRead = Math.min(chunk.length, maxBytePos - pos + 1);
            numBytesRead = fs.readSync(fd, chunk, 0, numBytesToRead, pos);
         }

         if (numBytesRead > 0) {
            var data = chunk.toString('utf8', 0, numBytesRead);
            if (previousLineData) {
               data = previousLineData + data;
            }

            var newLines = data.split(lineSeparator);

            // remove the last line, which is guaranteed to be a partial or empty, and hang on to it for the next chunk.
            previousLineData = newLines.splice(newLines.length - 1, 1)[0];

            // add the new lines to our lines array, making sure we don't exceed the requested amount
            lines = lines.concat(newLines.slice(0, numLines - lines.length));

            // update the read position
            pos += numBytesRead;
         }

      }
      while (numBytesRead > 0 && lines.length < numLines);

      return lines;
   };

   this.close = function() {
      try {
         fs.closeSync(fd);
         return true;
      }
      catch (e) {
         log.error("Exception while trying to close file: " + e);
         return false;
      }
   };
}

module.exports = RandomAccessCsv;
