ESDR CSV Uploader
=================

Simple Node.js app for processing a CSV file and uploading it to an ESDR feed.

Configuration
=============

The uploader assumes you have already registered the device with ESDR, created a feed, and you know the read-write Feed API Key.  After doing all that, copy the `config-template.js` file to `config.js`, and edit as necessary.

Usage
=====

Run the app with:

    node index.js

If you don't specify the config file to use, it assumes `config.js`.  To use a different config file, simply include it when running the app, like this:

    node index.js different-config.js


