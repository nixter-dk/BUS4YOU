#!/bin/sh
set -eu

php artisan config:cache
php artisan view:cache
php artisan migrate --force
php artisan db:seed --force

exec "$@"
