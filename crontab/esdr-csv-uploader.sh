#!/bin/bash

# The full path to the directory containing the node and forever binaries.
NODE_BIN_DIR="/home/pi/node/node-v0.10.28-linux-arm-pi/bin"

# Set the NODE_PATH to the Node.js main node_modules directory.
NODE_PATH="/home/pi/node/node-v0.10.28-linux-arm-pi/lib/node_modules"

# The application startup Javascript file path.
APPLICATION_DIR="/home/pi/esdr-csv-uploader"
APPLICATION_PATH="/home/pi/esdr-csv-uploader/index.js"

# Log file path.
LOG_FOREVER="/home/pi/esdr-csv-uploader/logs/esdr-csv-uploader-forever.log"
LOG_ERR="/home/pi/esdr-csv-uploader/logs/esdr-csv-uploader-err.log"

# Forever settings to prevent the application spinning if it fails on launch.
MIN_UPTIME="5000"
SPIN_SLEEP_TIME="2000"

# Process uid, useful as a namespace for forever processes (must wrap in a string)
FOREVER_UID="esdr-csv-uploader"

# The user's home directory
HOME="/home/pi"

# Base path for all forever related files (pid files, etc.)
FOREVER_DIR="/home/pi/.forever"

PATH=${NODE_BIN_DIR}:$PATH

cd ${APPLICATION_DIR}

forever \
      --workingDir ${APPLICATION_DIR} \
      -p ${FOREVER_DIR} \
      -a \
      -l ${LOG_FOREVER} \
      -e ${LOG_ERR} \
      --minUptime ${MIN_UPTIME} \
      --spinSleepTime ${SPIN_SLEEP_TIME} \
      --uid ${FOREVER_UID} \
      start ${APPLICATION_PATH}
