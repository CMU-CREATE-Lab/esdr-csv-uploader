Register this script with crontab to have the uploader automatically started upon boot of the Raspberry Pi.  To edit
the crontab file, do:

   sudo crontab -e

And then append this line at the end (correcting the path as necessary):

   @reboot /home/pi/esdr-csv-uploader/crontab/esdr-csv-uploader.sh