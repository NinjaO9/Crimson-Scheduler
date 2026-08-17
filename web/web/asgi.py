"""
ASGI config for web project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
import sys
from pathlib import Path

django_root = Path(__file__).resolve().parent.parent

if str(django_root) not in sys.path:
    sys.path.insert(0, str(django_root))

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'web.settings')

application = get_asgi_application()
