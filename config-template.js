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
                         "timestampParser" : function(strVal){
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

                   // number of records to read from the CSV, convert, and upload to ESDR with each iteration
                   "maxRecordsPerUpload" : 5000
                });

module.exports = config;