var config = require('nconf');

config.argv()
      .env()
      .defaults({
                   "csv" : {
                      // absolute or relative path to your CSV file
                      "file" : "../node-speck-gateway/speck_01234567890123456789012345678900.csv",

                      // whether your CSV file has a header row
                      "hasHeaderRow" : true,

                      "data" : {
                         // This specifies which field in the CSV contains the timestamp.  ESDR assumes the timestamp is
                         // a UNIX time double value, in seconds.
                         "timestampIndex" : 0,

                         // The function used to parse the timestamp and convert. If not defined, the string value in
                         // the CSV is simply converted to a float using parseFloat.
                         "timestampParser" : function(strVal) {
                            return parseFloat(strVal);
                         },

                         // The delimiter character between fields in the CSV
                         "fieldDelimiter" : ",",

                         // Specify which fields to pick out of the CSV, and what their name should be when uploading
                         // to ESDR (the uploader doesn't care what the field names are in the header row, if the header
                         // row exists).  Specifying the "index" is required, but parser is optional. If parser is
                         // undefined or not a function, the field is simply treated as a string.
                         "fields" : {
                            "humidity" : {
                               "index" : 1,
                               "parser" : function(strVal) {
                                  return parseInt(strVal, 10);
                               }
                            },
                            "raw_particles" : {
                               "index" : 2,
                               "parser" : function(strVal) {
                                  return parseInt(strVal, 10);
                               }
                            },
                            "particle_concentration" : {
                               "index" : 3,
                               "parser" : function(strVal) {
                                  return parseFloat(strVal);
                               }
                            }
                         }
                      }
                   },
                   "esdr" : {
                      // Root API URL for ESDR, typically https://esdr.cmucreatelab.org/api/v1
                      "apiRootUrl" : "https://esdr.cmucreatelab.org/api/v1",

                      // the read-write Feed API Key to use for uploads
                      "feedId" : "012345678901234567890123456789012345678901234567890123456789abcd"
                   },

                   "upload" : {
                      // number of records to read from the CSV, convert, and upload to ESDR with each iteration
                      "maxRecords" : 5000,

                      // Whether to continuously process the CSV for uploads.  If false, the uploader will only upload a
                      // single batch (and thus the values below are ignored).
                      "loop" : true,

                      // The minimum number of records required to be included in an upload in order for the uploader
                      // to go from "fast" upload interval to "normal".
                      "uploadIntervalRecordCountThreshold" : 2,

                      // Amount of time (in millis) to wait between upload batches when at least
                      // uploadIntervalRecordCountThreshold records where uploaded.  Setting this to a small value
                      // allows the uploader to process a large backlog of records very quickly.  Once fewer than
                      // uploadIntervalRecordCountThreshold records are uploaded in a batch, the uploader will switch
                      // to "normal" mode.
                      "fastUploadIntervalMillis" : 1,

                      // Amount of time (in millis) to wait between upload batches when fewer than
                      // uploadIntervalRecordCountThreshold records where uploaded.  If you're running the uploader
                      // simultaneously with a downloader (i.e. both working on the same CSV file), then there's no
                      // point in setting this to a value smaller than the sample acquisition rate of the device.
                      "normalUploadIntervalMillis" : 1000,

                      // Amount of time (in millis) to wait between upload batches when an error occurs.
                      "errorUploadIntervalMillis" : 5 * 60 * 1000 // five minutes
                   }
                });

module.exports = config;