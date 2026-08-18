#!/bin/sh
set -eu

php artisan config:cache
php artisan view:cache
php artisan migrate --force
php artisan db:seed --force

rm -f \
    /etc/apache2/mods-enabled/mpm_event.load \
    /etc/apache2/mods-enabled/mpm_event.conf \
    /etc/apache2/mods-enabled/mpm_worker.load \
    /etc/apache2/mods-enabled/mpm_worker.conf \
    /etc/apache2/mods-enabled/mpm_itk.load \
    /etc/apache2/mods-enabled/mpm_itk.conf
a2enmod mpm_prefork >/dev/null

exec "$@"
