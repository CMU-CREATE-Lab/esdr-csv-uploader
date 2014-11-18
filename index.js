var log4js = require('log4js');
log4js.configure('log4js-config.json');
var log = log4js.getLogger("esdr-csv-uploader");

var configFilePath = require('path').resolve(process.argv[2] || './config.js');
var config = require(configFilePath);
var superagent = require('superagent');
var flow = require('nimble');
var RandomAccessCsv = require('./lib/RandomAccessCsv');

var FIELD_DELIMITER = config.get("csv:data:fieldDelimiter");
var NUMERIC_COMPARATOR = function(a, b) {
   if (a < b) {
      return -1;
   }
   if (a > b) {
      return 1;
   }
   return 0;
};

// pick out the index of the timestamp field
var timestampIndexInCsv = config.get("csv:data:timestampIndex");

// get the timestamp parser function
var timestampParser = config.get("csv:data:timestampParser");
if (typeof timestampParser !== 'function') {
   log.info("Using default timestamp parser");
   timestampParser = function(strVal) {
      return parseFloat(strVal);
   };
}

/**
 * Attempts to find the given needle in the given haystack using the given comparator.  If found, it returns the
 * index of the element; otherwise it returns a negative number which is the complement of the insertion index.
 *
 * Requirements:
 * 1) haystack must provide a <code>size()</code> method for returning the number of items in the collection.
 * 2) haystack must provide a <code>get(index)</code> method for returning the item at the given zero-based index.
 *
 * @param {Object} haystack the ordered collection to search
 * @param {*} needle the item to find
 * @param {function} comparator the comparator to use
 * @param {int} [initialMin] the initial min position, defaults to 0 if undefined
 * @param {int} [initialMax] the initial max position, defaults to <code>hackstack.size() - 1</code> if undefined
 */
var binarySearch = function(haystack, needle, comparator, initialMin, initialMax) {
   var low = initialMin || 0;
   var high = initialMax || haystack.size() - 1;

   while (low <= high) {
      // Note that "(low + high) >>> 1" may overflow, and results in a typecast to double (which gives the wrong results).
      // See: http://googleresearch.blogspot.com/2006/06/extra-extra-read-all-about-it-nearly.html
      var mid = low + (high - low >> 1);
      var cmp = comparator(haystack.get(mid), needle) | 0;

      if (cmp < 0) {          // too low
         low = mid + 1;
      }
      else if (cmp > 0) {     // too high
         high = mid - 1;
      }
      else {                  // found it!
         return mid;
      }
   }

   return ~low;               // not found
};

var getTimestampOfLatestData = function(callback) {
   superagent
         .get(config.get("esdr:apiRootUrl") + "/feed?fields=maxTimeSecs")
         .set({
                 FeedApiKey : config.get("esdr:feedId")
              })
         .end(function(err, res) {
                 if (err) {
                    return callback(err);
                 }

                 if (res) {
                    if (res.status == 200) {
                       if (res.body) {
                          if (res.body.data) {
                             return callback(null, res.body.data['maxTimeSecs'])
                          }
                          return callback(new Error("Missing response data!"));
                       }
                       return callback(new Error("Missing response body!"));
                    }
                    return callback(new Error("Unexpected response status [" + res.status + "]"));
                 }
                 return callback(new Error("No response from ESDR!"));
              });
};

var csvToJson = (function() {
   // get the channel names we care about as an array
   var channelNames = Object.keys(config.get("csv:data:fields"));

   // for each of the channel names we care about, get the CSV index and parser function
   var channelIndices = channelNames.map(function(channelName) {
      return config.get("csv:data:fields")[channelName]['index'];
   });
   var channelParsers = channelNames.map(function(channelName) {
      var parser = config.get("csv:data:fields")[channelName]['parser'];

      // default to the identity function
      if (typeof parser !== 'function') {
         parser = function(val) {
            return val;
         }
      }
      return parser;
   });

   return function(csvLines) {
      if (csvLines && csvLines.length > 0) {
         return {
            "channel_names" : channelNames,
            "data" : csvLines.map(function(line) {
               // split the line into fields
               var fields = line.trim().split(FIELD_DELIMITER);

               // pick out the timestamp field, and parse it
               var timestamp = timestampParser(fields[timestampIndexInCsv]);

               // build up the record we'll include in the JSON
               var record = [timestamp];
               for (var i = 0; i < channelIndices.length; i++) {
                  // determine the index in the CSV record of this field
                  var index = channelIndices[i];

                  // pick out the field
                  var field = fields[index];

                  // parse the field and push it on to the record
                  var parser = channelParsers[i];
                  record.push(parser(field));
               }

               return record;
            })
         };
      }
      return null;
   };
})();

var run = function() {

   var error = null;
   var csv = null;
   var maxTimeSecs = null;
   var startingBytePos = null;
   var isUploadRequired = false;
   var csvLinesToUpload = null;
   var jsonToUpload = null;

   var hasNoError = function() {
      return error == null;
   };

   flow.series([
                  // initialize
                  function(done) {
                     error = null;
                     csv = null;
                     maxTimeSecs = null;
                     startingBytePos = null;
                     isUploadRequired = false;
                     csvLinesToUpload = null;
                     jsonToUpload = null;
                     done();
                  },

                  // create the RandomAccessCsv, which will fail if the file doesn't exist
                  function(done) {
                     try {
                        csv = new RandomAccessCsv(config.get("csv"));
                     }
                     catch (err) {
                        log.error("Error while creating the RandomAccessCsv instance: " + err);
                        error = err;
                     }
                     done();
                  },

                  // fetch the timestamp of the last data point from ESDR
                  function(done) {
                     if (hasNoError()) {
                        getTimestampOfLatestData(function(err, theMaxTimeSecs) {
                           if (err) {
                              error = err
                           }
                           else {
                              maxTimeSecs = theMaxTimeSecs;
                              log.trace("maxTimeSecs = [" + maxTimeSecs + "]");
                           }
                           done();
                        });
                     }
                     else {
                        done();
                     }
                  },

                  // determine the starting byte position of where we should start reading for new records
                  function(done) {
                     if (hasNoError()) {
                        // start at the beginning of the file if nothing has been uploaded yet
                        if (maxTimeSecs == null) {
                           startingBytePos = csv.getMinBytePosition();
                           isUploadRequired = true;
                        }
                        else {
                           // compare maxTimeSecs with the timestamp in the first and last line in the CSV
                           var firstRecord = csv.getFirstRecord();
                           var lastRecord = csv.getLastRecord();
                           if (firstRecord && lastRecord) {
                              var firstRecordTimestamp = timestampParser(firstRecord.line.split(FIELD_DELIMITER)[timestampIndexInCsv]);
                              var lastRecordTimestamp = timestampParser(lastRecord.line.split(FIELD_DELIMITER)[timestampIndexInCsv]);

                              if (maxTimeSecs < firstRecordTimestamp) {
                                 log.debug("This entire file is NEWER than what is in ESDR!");
                                 startingBytePos = csv.getMinBytePosition();
                                 isUploadRequired = true;
                              }
                              else if (maxTimeSecs >= lastRecordTimestamp) {
                                 log.debug("This entire file is OLDER than what is in ESDR!  Nothing to do!");
                              }
                              else {
                                 // binary search to find where to start reading
                                 var bytePos = binarySearch({
                                                               size : function() {
                                                                  return csv.getMaxBytePosition();
                                                               },
                                                               get : function(index) {
                                                                  var lineObject = csv.getLineContainingBytePosition(index);
                                                                  var line = lineObject['line'].trim();
                                                                  var fields = line.split(FIELD_DELIMITER);
                                                                  return timestampParser(fields[timestampIndexInCsv]);
                                                               }
                                                            },
                                                            maxTimeSecs,
                                                            NUMERIC_COMPARATOR,
                                                            csv.getMinBytePosition(),
                                                            csv.getMaxBytePosition());

                                 // If the bytePos is negative, then the timestamp doesn't exist in the file, and we
                                 // need to take the complement and start reading at the line containing that byte. If
                                 // the bytePos is non-negative, then we found the timestamp, and thus we need to start
                                 // reading at the *next* line.
                                 var line;
                                 if (bytePos < 0) {
                                    startingBytePos = ~bytePos;
                                    log.trace("maxTimeSecs IS NOT in the CSV, start reading at position " + startingBytePos);
                                 }
                                 else {
                                    line = csv.getLineContainingBytePosition(bytePos);
                                    startingBytePos = line.endPos + 1;
                                    log.trace("maxTimeSecs IS in the CSV, start reading at position " + startingBytePos);
                                 }
                                 isUploadRequired = (startingBytePos < csv.getMaxBytePosition());
                                 log.trace("isUploadRequired = " + isUploadRequired + " (maxBytePosition=" + csv.getMaxBytePosition() + ")");
                              }
                           }
                           else {
                              log.debug("This entire file is OLDER than what is in ESDR!  Nothing to do!");
                           }

                        }
                     }

                     done();
                  },

                  // now that we know the starting line number, read lines from the CSV
                  function(done) {
                     if (isUploadRequired && hasNoError()) {
                        csvLinesToUpload = csv.readLines(startingBytePos, config.get("maxRecordsPerUpload"));
                     }
                     done();
                  },

                  // convert the lines (if any) to JSON
                  function(done) {
                     if (csvLinesToUpload && csvLinesToUpload.length > 0) {
                        jsonToUpload = csvToJson(csvLinesToUpload);
                        //log.debug(JSON.stringify(jsonToUpload, null, 3));
                     }
                     done();
                  },

                  // upload to ESDR!
                  function(done) {
                     if (jsonToUpload != null) {
                        superagent
                              .put(config.get("esdr:apiRootUrl") + "/feed")
                              .set({
                                      FeedApiKey : config.get("esdr:feedId")
                                   })
                              .send(jsonToUpload)
                              .end(function(err, res) {
                                      if (err || res == null) {
                                         error = err;
                                      }
                                      else {
                                         // TODO: need to check the returned status!
                                         //log.trace(JSON.stringify(res.body, null, 3));
                                      }
                                      done();
                                   });
                     }
                     else {
                        done();
                     }
                  }
               ],

         // handle outcome
               function() {
                  // TODO: deal with possible error!
                  if (csv) {
                     csv.close();
                  }
                  var linesUploaded = csvLinesToUpload ? csvLinesToUpload.length : 0;
                  log.debug("All done--uploaded [" + linesUploaded + "] lines");

                  setTimeout(run, linesUploaded > 1 ? 1 : 1000);     // TODO: get these times from the config
               }
   );
};

run();